"""
Audiences (segments) and email campaigns.

An audience is a set of rules; a user must match all of them (empty rules match every active, verified student):
  roles: ["STUDENT", "INSTRUCTOR"]          default ["STUDENT"]
  track: "training" | "scholarships"
  enrolled_in: [course slugs]                enrolled on (or finished) any of them
  not_enrolled_in: [course slugs]            enrolled on none of them
  completed_any: true                         finished at least one course
  wishlisted: [course slugs]                 saved any of them to their wishlist
  cart_not_empty: true                        has courses waiting in their cart
  purchased: "yes" | "no"                     has (not) paid for a course
  inactive_days: N                            hasn't learned or signed in for N days
  joined_within_days: N                       created their account in the last N days
  country: "Sierra Leone"
People who switched off marketing emails are never included.

  POST /lms/manage/audience/preview/            {rules} -> {count, sample}
  GET/POST /lms/manage/segments/   DELETE /lms/manage/segments/<id>/
  GET/POST /lms/manage/campaigns/  GET/PATCH/DELETE /lms/manage/campaigns/<id>/
  POST /lms/manage/campaigns/<id>/test/         send it to yourself
  POST /lms/manage/campaigns/<id>/send/         send it to the audience (once)
  GET  /lms/c/<token>/                          a tracked button click: counts it and redirects
  GET/POST /lms/unsubscribe/<token>/            who is unsubscribing / do it (no sign-in needed)
  GET/PUT /lms/me/email-preferences/            {marketing_emails}
"""
from datetime import timedelta

from django.conf import settings
from django.core import signing
from django.core.mail import EmailMultiAlternatives, get_connection
from django.db.models import Q
from django.http import HttpResponseRedirect
from django.shortcuts import get_object_or_404
from django.utils import timezone
from django.utils.html import escape
from rest_framework import status
from rest_framework.permissions import AllowAny, IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView

from accounts.emails import _plain, button, layout, paragraph
from accounts.models import User
from accounts.permissions import IsAdmin
from portal.models import TrainingEnrollment

from .models import CartItem, Campaign, CampaignRecipient, Certificate, LearningDay, Notification, Order, Profile, Segment, Wishlist

SALT = 'lms.campaigns'
MAX_RECIPIENTS = 5000
LEARNING = [TrainingEnrollment.ACTIVE, TrainingEnrollment.COMPLETED]


def _slugs(value):
    return [str(s) for s in value] if isinstance(value, list) else []


def _int(value):
    try:
        return max(0, int(value))
    except (TypeError, ValueError):
        return 0


def audience(rules):
    """The users the rules pick (active, verified, and not opted out of marketing emails)."""
    rules = rules if isinstance(rules, dict) else {}
    roles = [r for r in _slugs(rules.get('roles')) if r in (User.STUDENT, User.INSTRUCTOR)] or [User.STUDENT]
    users = User.objects.filter(is_active=True, is_verified=True, role__in=roles).exclude(lms_profile__marketing_emails=False)
    if rules.get('track') == 'training':
        users = users.filter(in_training=True)
    elif rules.get('track') == 'scholarships':
        users = users.filter(in_scholarships=True)
    if _slugs(rules.get('enrolled_in')):
        users = users.filter(training_enrollments__course__slug__in=_slugs(rules['enrolled_in']), training_enrollments__status__in=LEARNING)
    if _slugs(rules.get('not_enrolled_in')):
        users = users.exclude(pk__in=TrainingEnrollment.objects.filter(
            course__slug__in=_slugs(rules['not_enrolled_in']), status__in=LEARNING).values('student_id'))
    if rules.get('completed_any'):
        users = users.filter(Q(pk__in=Certificate.objects.values('enrollment__student_id'))
                             | Q(pk__in=TrainingEnrollment.objects.filter(status=TrainingEnrollment.COMPLETED).values('student_id')))
    if _slugs(rules.get('wishlisted')):
        users = users.filter(pk__in=Wishlist.objects.filter(course__slug__in=_slugs(rules['wishlisted'])).values('student_id'))
    if rules.get('cart_not_empty'):
        users = users.filter(pk__in=CartItem.objects.values('student_id'))
    paid = Order.objects.filter(status=Order.SUCCESSFUL, total__gt=0).values('student_id')
    if rules.get('purchased') == 'yes':
        users = users.filter(pk__in=paid)
    elif rules.get('purchased') == 'no':
        users = users.exclude(pk__in=paid)
    if _int(rules.get('inactive_days')):
        since = timezone.now() - timedelta(days=_int(rules['inactive_days']))
        users = (users.exclude(pk__in=LearningDay.objects.filter(date__gte=since.date()).values('user_id'))
                 .filter(Q(last_login__isnull=True) | Q(last_login__lt=since)))
    if _int(rules.get('joined_within_days')):
        users = users.filter(created_at__gte=timezone.now() - timedelta(days=_int(rules['joined_within_days'])))
    if str(rules.get('country', '')).strip():
        users = users.filter(country__iexact=str(rules['country']).strip())
    return users.distinct()


# ---------------------------------------------------------------- the email

def _site(path):
    return path if path.startswith('http') else f'{settings.FRONTEND_URL.rstrip("/")}/{path.lstrip("/")}'


def _api(path):
    base = getattr(settings, 'BACKEND_URL', '') or settings.FRONTEND_URL
    return f'{base.rstrip("/")}/api/v1/lms/{path}'


def unsubscribe_link(user, campaign=None):
    token = signing.dumps({'u': user.id, 'c': campaign.id if campaign else None}, salt=SALT)
    return _site(f'/unsubscribe/{token}')


def click_link(recipient):
    return _api(f'c/{signing.dumps({"r": recipient.id}, salt=SALT)}/')


def personal(text, user):
    return text.replace('{first_name}', user.first_name or 'there')


def build(campaign, user, recipient=None):
    """(subject, text, html) for one person."""
    title = personal(campaign.title or campaign.subject, user)
    paragraphs = [personal(p.strip(), user) for p in campaign.body.split('\n\n') if p.strip()]
    link = ''
    if campaign.button_label and campaign.button_link:
        link = click_link(recipient) if recipient else _site(campaign.button_link)
    stop = unsubscribe_link(user, campaign)
    reason = 'You received this because you have an ADRAM account and accepted news and offers.'
    html = layout(preheader=paragraphs[0] if paragraphs else title, label='News from ADRAM', tone='info', title=title, reason=reason,
                  body=''.join(paragraph(escape(p).replace('\n', '<br>')) for p in paragraphs)
                  + (button(campaign.button_label, link) if link else '')
                  + paragraph(f'<a href="{escape(stop)}" style="color:#64748b;">Unsubscribe from these emails</a>', size=12, margin='24px 0 0'))
    text = _plain(title, [*paragraphs, f'{campaign.button_label}: {link}' if link else '', f'Unsubscribe: {stop}'], reason)
    return personal(campaign.subject, user), text, html


def send_one(connection, campaign, user, recipient=None):
    subject, text, html = build(campaign, user, recipient)
    message = EmailMultiAlternatives(subject, text, settings.DEFAULT_FROM_EMAIL, [user.email], connection=connection,
                                     headers={'List-Unsubscribe': f'<{unsubscribe_link(user, campaign)}>'})
    message.attach_alternative(html, 'text/html')
    message.send(fail_silently=False)


def send_campaign(campaign):
    """Sends to everyone in the audience who hasn't had it yet. Returns (sent, failed)."""
    Campaign.objects.filter(pk=campaign.pk).update(status=Campaign.SENDING)
    done = set(campaign.recipients.values_list('user_id', flat=True))
    users = [u for u in audience(campaign.rules)[:MAX_RECIPIENTS] if u.id not in done]
    sent = failed = 0
    connection = get_connection()
    try:
        connection.open()
        for user in users:
            recipient = CampaignRecipient.objects.create(campaign=campaign, user=user)
            try:
                send_one(connection, campaign, user, recipient)
                recipient.sent_at = timezone.now()
                sent += 1
            except Exception:
                recipient.failed = True
                failed += 1
            recipient.save(update_fields=['sent_at', 'failed'])
    finally:
        connection.close()
    if campaign.notify_in_app and users:
        link = campaign.button_link if campaign.button_link.startswith('/') else ''
        Notification.objects.bulk_create(Notification(user=u, kind='announcement', title=campaign.subject[:200],
                                                      body=campaign.body.split('\n\n')[0][:500].replace('{first_name}', u.first_name or 'there'),
                                                      link=link[:300]) for u in users)
    Campaign.objects.filter(pk=campaign.pk).update(status=Campaign.SENT, sent_at=timezone.now())
    return sent, failed


# ---------------------------------------------------------------- admin views

def campaign_data(c, full=False):
    rec = c.recipients
    sent = rec.filter(sent_at__isnull=False).count()
    clicks = rec.filter(clicked_at__isnull=False).count()
    data = {'id': c.id, 'name': c.name, 'subject': c.subject, 'status': c.status, 'status_display': c.get_status_display(),
            'created_at': c.created_at, 'sent_at': c.sent_at, 'sent': sent, 'failed': rec.filter(failed=True).count(),
            'clicks': clicks, 'click_rate': round(100 * clicks / sent, 1) if sent else None,
            'unsubscribed': rec.filter(unsubscribed_at__isnull=False).count()}
    if full:
        data.update({'title': c.title, 'body': c.body, 'button_label': c.button_label, 'button_link': c.button_link,
                     'rules': c.rules, 'notify_in_app': c.notify_in_app, 'audience': audience(c.rules).count()})
    return data


FIELDS = {'name': 120, 'subject': 150, 'title': 150, 'body': 5000, 'button_label': 60, 'button_link': 300}


def apply(campaign, data):
    errors = {}
    for field, limit in FIELDS.items():
        if field in data:
            setattr(campaign, field, str(data[field] or '').strip()[:limit])
    if 'rules' in data:
        campaign.rules = data['rules'] if isinstance(data['rules'], dict) else {}
    if 'notify_in_app' in data:
        campaign.notify_in_app = bool(data['notify_in_app'])
    if not campaign.name:
        errors['name'] = 'Name the campaign.'
    if not campaign.subject:
        errors['subject'] = 'Write the subject line.'
    if not campaign.body:
        errors['body'] = 'Write the message.'
    if campaign.button_label and not (campaign.button_link.startswith('/') or campaign.button_link.startswith('https://')):
        errors['button_link'] = 'Use a page of this site (starting with /) or a full https:// link.'
    return errors


class PreviewView(APIView):
    permission_classes = [IsAdmin]

    def post(self, request):
        users = audience(request.data.get('rules'))
        return Response({'count': users.count(), 'sample': [u.get_full_name() or u.email for u in users[:5]]})


class SegmentsView(APIView):
    permission_classes = [IsAdmin]

    def get(self, request):
        return Response([{'id': s.id, 'name': s.name, 'rules': s.rules, 'count': audience(s.rules).count()} for s in Segment.objects.all()])

    def post(self, request):
        name = str(request.data.get('name', '')).strip()[:120]
        if not name:
            return Response({'name': 'Name the audience.'}, status=status.HTTP_400_BAD_REQUEST)
        rules = request.data.get('rules') if isinstance(request.data.get('rules'), dict) else {}
        s = Segment.objects.create(name=name, rules=rules)
        return Response({'id': s.id, 'name': s.name, 'rules': s.rules, 'count': audience(rules).count()}, status=status.HTTP_201_CREATED)


class SegmentView(APIView):
    permission_classes = [IsAdmin]

    def delete(self, request, pk):
        get_object_or_404(Segment, pk=pk).delete()
        return Response(status=status.HTTP_204_NO_CONTENT)


class CampaignsView(APIView):
    permission_classes = [IsAdmin]

    def get(self, request):
        return Response([campaign_data(c) for c in Campaign.objects.all()[:100]])

    def post(self, request):
        campaign = Campaign(created_by=request.user)
        errors = apply(campaign, request.data)
        if errors:
            return Response(errors, status=status.HTTP_400_BAD_REQUEST)
        campaign.save()
        return Response(campaign_data(campaign, full=True), status=status.HTTP_201_CREATED)


class CampaignView(APIView):
    permission_classes = [IsAdmin]

    def get(self, request, pk):
        return Response(campaign_data(get_object_or_404(Campaign, pk=pk), full=True))

    def patch(self, request, pk):
        campaign = get_object_or_404(Campaign, pk=pk)
        if campaign.status != Campaign.DRAFT:
            return Response({'detail': 'This campaign has been sent and can’t be changed.'}, status=status.HTTP_400_BAD_REQUEST)
        errors = apply(campaign, request.data)
        if errors:
            return Response(errors, status=status.HTTP_400_BAD_REQUEST)
        campaign.save()
        return Response(campaign_data(campaign, full=True))

    def delete(self, request, pk):
        campaign = get_object_or_404(Campaign, pk=pk)
        if campaign.status != Campaign.DRAFT:
            return Response({'detail': 'Sent campaigns are kept for their results.'}, status=status.HTTP_400_BAD_REQUEST)
        campaign.delete()
        return Response(status=status.HTTP_204_NO_CONTENT)


class CampaignTestView(APIView):
    permission_classes = [IsAdmin]

    def post(self, request, pk):
        campaign = get_object_or_404(Campaign, pk=pk)
        try:
            connection = get_connection()
            send_one(connection, campaign, request.user)
        except Exception:
            return Response({'detail': 'The test email could not be sent. Check the email settings.'}, status=status.HTTP_502_BAD_GATEWAY)
        return Response({'detail': f'Test sent to {request.user.email}.'})


class CampaignSendView(APIView):
    permission_classes = [IsAdmin]

    def post(self, request, pk):
        campaign = get_object_or_404(Campaign, pk=pk)
        if campaign.status != Campaign.DRAFT:
            return Response({'detail': 'This campaign was already sent.'}, status=status.HTTP_400_BAD_REQUEST)
        if not audience(campaign.rules).exists():
            return Response({'detail': 'Nobody matches this audience.'}, status=status.HTTP_400_BAD_REQUEST)
        sent, failed = send_campaign(campaign)
        campaign.refresh_from_db()
        return Response({**campaign_data(campaign, full=True), 'detail': f'Sent to {sent} people{f", {failed} failed" if failed else ""}.'})


# ---------------------------------------------------------------- recipients

class ClickView(APIView):
    permission_classes = [AllowAny]
    authentication_classes = []

    def get(self, request, token):
        try:
            data = signing.loads(token, salt=SALT)
        except signing.BadSignature:
            return HttpResponseRedirect(_site('/'))
        recipient = CampaignRecipient.objects.filter(pk=data.get('r')).select_related('campaign').first()
        if not recipient:
            return HttpResponseRedirect(_site('/'))
        if not recipient.clicked_at:
            CampaignRecipient.objects.filter(pk=recipient.pk).update(clicked_at=timezone.now())
        return HttpResponseRedirect(_site(recipient.campaign.button_link or '/'))


class UnsubscribeView(APIView):
    permission_classes = [AllowAny]
    authentication_classes = []

    def _read(self, token):
        try:
            data = signing.loads(token, salt=SALT)
        except signing.BadSignature:
            return None, None
        return User.objects.filter(pk=data.get('u')).first(), data.get('c')

    def get(self, request, token):
        user, _ = self._read(token)
        if not user:
            return Response({'detail': 'This link is not valid.'}, status=status.HTTP_404_NOT_FOUND)
        profile = Profile.objects.filter(user=user).first()
        email = user.email
        hidden = email[0] + '•••' + email[email.index('@'):] if '@' in email else email
        return Response({'email': hidden, 'subscribed': not profile or profile.marketing_emails})

    def post(self, request, token):
        user, campaign_id = self._read(token)
        if not user:
            return Response({'detail': 'This link is not valid.'}, status=status.HTTP_404_NOT_FOUND)
        subscribe = bool(request.data.get('subscribe', False))
        profile = Profile.for_user(user)
        profile.marketing_emails = subscribe
        profile.save(update_fields=['marketing_emails', 'updated_at'])
        if not subscribe and campaign_id:
            CampaignRecipient.objects.filter(campaign_id=campaign_id, user=user, unsubscribed_at__isnull=True).update(unsubscribed_at=timezone.now())
        return Response({'subscribed': subscribe})


class EmailPreferencesView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request):
        return Response({'marketing_emails': Profile.for_user(request.user).marketing_emails})

    def put(self, request):
        profile = Profile.for_user(request.user)
        profile.marketing_emails = bool(request.data.get('marketing_emails'))
        profile.save(update_fields=['marketing_emails', 'updated_at'])
        return Response({'marketing_emails': profile.marketing_emails})
