"""
Newsletter API (mounted at /api/v1/newsletter/).

Public (no account needed)
  GET  form/                      the footer form's wording, or {enabled: false}
  POST subscribe/                 {email, name?}  (+ honeypot `company`, must stay empty; limited per address)
  POST confirm/<token>/           confirm the email address (double opt-in)
  GET  unsubscribe/<token>/       {email (partly hidden), status}
  POST unsubscribe/<token>/       unsubscribe (also the one-click target mail apps POST to); ?d=<delivery> records which issue
  GET  c/<signed>/                a tracked button click: counts it and redirects

Admin
  GET           manage/overview/
  GET/POST      manage/subscribers/            ?q=&status=&page=   POST {email, name}
  PATCH/DELETE  manage/subscribers/<id>/       {status, name}
  POST          manage/subscribers/import/     {text}: one address per line, "Name <email>" or "email, name"
  GET           manage/subscribers/export/     CSV
  GET/PUT       manage/settings/
  GET/POST      manage/issues/
  GET/PATCH/DELETE manage/issues/<id>/
  POST          manage/issues/preview/         {fields} -> {html}
  POST          manage/issues/<id>/test/       send it to yourself
  POST          manage/issues/<id>/send/       send it to every confirmed subscriber (once)
"""
import csv
import logging
import re
from datetime import timedelta

from django.core import signing
from django.core.cache import cache
from django.core.exceptions import ValidationError
from django.core.mail import get_connection
from django.core.validators import validate_email
from django.db import IntegrityError
from django.db.models import Count, Q
from django.db.models.functions import TruncDate
from django.http import HttpResponse, HttpResponseRedirect
from django.shortcuts import get_object_or_404
from django.utils import timezone
from rest_framework import status
from rest_framework.permissions import AllowAny
from rest_framework.response import Response
from rest_framework.views import APIView

from api.throttling import AnonRate, FormRate

from accounts.permissions import IsAdmin

from . import emails
from .models import Delivery, Issue, NewsletterSettings, Subscriber

logger = logging.getLogger(__name__)
MAX_RECIPIENTS = 10000
PAGE = 50
SUBSCRIBE_LIMIT = 10          # sign-ups per IP address per hour
RESEND_AFTER = timedelta(minutes=2)


def _ip(request):
    return (request.META.get('HTTP_X_FORWARDED_FOR', '').split(',')[0].strip() or request.META.get('REMOTE_ADDR', ''))


def _clean_email(value):
    email = str(value or '').strip().lower()
    try:
        validate_email(email)
    except ValidationError:
        return ''
    return email if len(email) <= 254 else ''


def _hide(email):
    name, _, domain = email.partition('@')
    return f'{name[:2]}{"*" * max(1, len(name) - 2)}@{domain}'


def _confirm(sub, conf):
    sub.status, sub.confirmed_at, sub.unsubscribed_at = Subscriber.SUBSCRIBED, timezone.now(), None
    sub.save(update_fields=['status', 'confirmed_at', 'unsubscribed_at'])
    if conf.welcome_email:
        try:
            emails.send_welcome(sub)
        except Exception:
            logger.exception('Could not send the newsletter welcome email to %s', sub.email)


# ---------------------------------------------------------------- public

class FormView(APIView):
    permission_classes = [AllowAny]
    authentication_classes = []

    def get(self, request):
        conf = NewsletterSettings.load()
        if not conf.enabled:
            return Response({'enabled': False})
        return Response({'enabled': True, 'heading': conf.heading, 'text': conf.text, 'button_label': conf.button_label,
                         'placeholder': conf.placeholder, 'double_opt_in': conf.double_opt_in})


class SubscribeView(APIView):
    permission_classes = [AllowAny]
    throttle_classes = [AnonRate, FormRate]
    authentication_classes = []

    def post(self, request):
        conf = NewsletterSettings.load()
        if not conf.enabled:
            return Response({'detail': 'The newsletter isn’t open for sign-ups right now.'}, status=status.HTTP_400_BAD_REQUEST)
        key = f'newsletter:subscribe:{_ip(request)}'
        if cache.get(key, 0) >= SUBSCRIBE_LIMIT:
            return Response({'detail': 'Too many sign-ups from this connection. Please try again later.'}, status=status.HTTP_429_TOO_MANY_REQUESTS)
        cache.set(key, cache.get(key, 0) + 1, 3600)
        if str(request.data.get('company', '')).strip():  # honeypot: a hidden field only bots fill in
            return Response({'status': 'check_email', 'detail': 'Almost done! Check your inbox to confirm your subscription.'})

        email = _clean_email(request.data.get('email'))
        if not email:
            return Response({'email': 'Enter a valid email address.'}, status=status.HTTP_400_BAD_REQUEST)
        name = str(request.data.get('name', '')).strip()[:120]
        sub = Subscriber.objects.filter(email=email).first()
        if sub and sub.status == Subscriber.SUBSCRIBED:
            return Response({'status': 'subscribed', 'detail': 'You’re already subscribed. Thank you!'})
        if not sub:
            try:
                sub = Subscriber.objects.create(email=email, name=name, source=Subscriber.FOOTER)
            except IntegrityError:  # two sign-ups at the same moment
                sub = Subscriber.objects.get(email=email)
        elif name and not sub.name:
            sub.name = name
            sub.save(update_fields=['name'])

        if not conf.double_opt_in:
            _confirm(sub, conf)
            return Response({'status': 'subscribed', 'detail': 'You’re subscribed. Thank you!'}, status=status.HTTP_201_CREATED)

        sub.status = Subscriber.PENDING
        recently = sub.confirmation_sent_at and timezone.now() - sub.confirmation_sent_at < RESEND_AFTER
        if not recently:
            try:
                emails.send_confirmation(sub)
                sub.confirmation_sent_at = timezone.now()
            except Exception:
                logger.exception('Could not send the newsletter confirmation to %s', email)
                sub.save(update_fields=['status'])
                return Response({'detail': 'We couldn’t send the confirmation email. Please try again later.'}, status=status.HTTP_502_BAD_GATEWAY)
        sub.save(update_fields=['status', 'confirmation_sent_at'])
        return Response({'status': 'check_email', 'detail': 'Almost done! Check your inbox and click the link to confirm your subscription.'},
                        status=status.HTTP_201_CREATED)


class ConfirmView(APIView):
    permission_classes = [AllowAny]
    authentication_classes = []

    def post(self, request, token):
        sub = Subscriber.objects.filter(token=token).first()
        if not sub:
            return Response({'detail': 'This link is not valid. Please sign up again.'}, status=status.HTTP_404_NOT_FOUND)
        if sub.status != Subscriber.SUBSCRIBED:
            _confirm(sub, NewsletterSettings.load())
        return Response({'email': _hide(sub.email), 'status': sub.status})


class UnsubscribeView(APIView):
    permission_classes = [AllowAny]
    authentication_classes = []

    def get(self, request, token):
        sub = get_object_or_404(Subscriber, token=token)
        return Response({'email': _hide(sub.email), 'status': sub.status})

    def post(self, request, token):
        sub = get_object_or_404(Subscriber, token=token)
        if sub.status != Subscriber.UNSUBSCRIBED:
            sub.status, sub.unsubscribed_at = Subscriber.UNSUBSCRIBED, timezone.now()
            sub.save(update_fields=['status', 'unsubscribed_at'])
            delivery = str(request.query_params.get('d', ''))
            if delivery.isdigit():
                Delivery.objects.filter(pk=int(delivery), subscriber=sub, unsubscribed_at__isnull=True).update(unsubscribed_at=timezone.now())
        return Response({'email': _hide(sub.email), 'status': sub.status})


class ResubscribeView(APIView):
    """From the unsubscribe page: "I unsubscribed by mistake"."""
    permission_classes = [AllowAny]
    authentication_classes = []

    def post(self, request, token):
        sub = get_object_or_404(Subscriber, token=token)
        if sub.status != Subscriber.SUBSCRIBED:
            sub.status, sub.unsubscribed_at = Subscriber.SUBSCRIBED, None
            sub.confirmed_at = sub.confirmed_at or timezone.now()
            sub.save(update_fields=['status', 'unsubscribed_at', 'confirmed_at'])
        return Response({'email': _hide(sub.email), 'status': sub.status})


class ClickView(APIView):
    permission_classes = [AllowAny]
    authentication_classes = []

    def get(self, request, token):
        try:
            data = signing.loads(token, salt=emails.SALT)
        except signing.BadSignature:
            return HttpResponseRedirect(emails.site_url('/'))
        delivery = Delivery.objects.filter(pk=data.get('d')).select_related('issue').first()
        if not delivery:
            return HttpResponseRedirect(emails.site_url('/'))
        if not delivery.clicked_at:
            Delivery.objects.filter(pk=delivery.pk).update(clicked_at=timezone.now())
        return HttpResponseRedirect(emails.site_url(delivery.issue.button_link or '/'))


# ---------------------------------------------------------------- admin: overview

class OverviewView(APIView):
    permission_classes = [IsAdmin]

    def get(self, request):
        counts = dict(Subscriber.objects.values_list('status').annotate(n=Count('id')))
        since = timezone.now() - timedelta(days=30)
        daily = dict(Subscriber.objects.filter(confirmed_at__gte=since).annotate(day=TruncDate('confirmed_at'))
                     .values_list('day').annotate(n=Count('id')))
        today = timezone.localdate()
        growth = [{'date': (today - timedelta(days=i)).isoformat(), 'count': daily.get(today - timedelta(days=i), 0)} for i in range(29, -1, -1)]
        sent = Issue.objects.filter(status=Issue.SENT)
        return Response({
            'subscribed': counts.get(Subscriber.SUBSCRIBED, 0), 'pending': counts.get(Subscriber.PENDING, 0),
            'unsubscribed': counts.get(Subscriber.UNSUBSCRIBED, 0),
            'new_30_days': Subscriber.objects.filter(status=Subscriber.SUBSCRIBED, confirmed_at__gte=since).count(),
            'left_30_days': Subscriber.objects.filter(unsubscribed_at__gte=since).count(),
            'growth': growth, 'issues_sent': sent.count(),
            'recent': [issue_data(i) for i in sent.order_by('-sent_at')[:5]],
        })


# ---------------------------------------------------------------- admin: subscribers

def subscriber_data(s):
    return {'id': s.id, 'email': s.email, 'name': s.name, 'status': s.status, 'status_display': s.get_status_display(),
            'source': s.source, 'source_display': s.get_source_display(), 'created_at': s.created_at,
            'confirmed_at': s.confirmed_at, 'unsubscribed_at': s.unsubscribed_at}


def _filtered(request):
    subs = Subscriber.objects.all()
    q = str(request.query_params.get('q', '')).strip()
    if q:
        subs = subs.filter(Q(email__icontains=q) | Q(name__icontains=q))
    if request.query_params.get('status') in dict(Subscriber.STATUSES):
        subs = subs.filter(status=request.query_params['status'])
    return subs


class SubscribersView(APIView):
    permission_classes = [IsAdmin]

    def get(self, request):
        subs = _filtered(request)
        try:
            page = max(1, int(request.query_params.get('page', 1)))
        except ValueError:
            page = 1
        total = subs.count()
        counts = dict(Subscriber.objects.values_list('status').annotate(n=Count('id')))
        return Response({'results': [subscriber_data(s) for s in subs[(page - 1) * PAGE: page * PAGE]], 'count': total,
                         'page': page, 'pages': max(1, -(-total // PAGE)), 'counts': {k: counts.get(k, 0) for k, _ in Subscriber.STATUSES}})

    def post(self, request):
        """An administrator adds someone who agreed to receive the newsletter (no confirmation email)."""
        email = _clean_email(request.data.get('email'))
        if not email:
            return Response({'email': 'Enter a valid email address.'}, status=status.HTTP_400_BAD_REQUEST)
        if Subscriber.objects.filter(email=email).exists():
            return Response({'email': 'This address is already on the list.'}, status=status.HTTP_400_BAD_REQUEST)
        sub = Subscriber.objects.create(email=email, name=str(request.data.get('name', '')).strip()[:120], source=Subscriber.ADMIN,
                                        status=Subscriber.SUBSCRIBED, confirmed_at=timezone.now())
        return Response(subscriber_data(sub), status=status.HTTP_201_CREATED)


class SubscriberView(APIView):
    permission_classes = [IsAdmin]

    def patch(self, request, pk):
        sub = get_object_or_404(Subscriber, pk=pk)
        if 'name' in request.data:
            sub.name = str(request.data.get('name') or '').strip()[:120]
        new = request.data.get('status')
        if new == Subscriber.UNSUBSCRIBED and sub.status != new:
            sub.status, sub.unsubscribed_at = new, timezone.now()
        elif new == Subscriber.SUBSCRIBED and sub.status != new:
            sub.status, sub.unsubscribed_at = new, None
            sub.confirmed_at = sub.confirmed_at or timezone.now()
        sub.save()
        return Response(subscriber_data(sub))

    def delete(self, request, pk):
        get_object_or_404(Subscriber, pk=pk).delete()
        return Response(status=status.HTTP_204_NO_CONTENT)


LINE = re.compile(r'^\s*(?:"?([^"<,;]*?)"?\s*<([^>]+)>|([^,;\s]+)\s*[,;]?\s*(.*?))\s*$')


class ImportView(APIView):
    permission_classes = [IsAdmin]

    def post(self, request):
        lines = [line for line in str(request.data.get('text', '')).splitlines() if line.strip()][:MAX_RECIPIENTS]
        existing = set(Subscriber.objects.values_list('email', flat=True))
        new, invalid, duplicates = [], 0, 0
        for line in lines:
            m = LINE.match(line)
            if not m:
                invalid += 1
                continue
            name, email = (m.group(1), m.group(2)) if m.group(2) else (m.group(4), m.group(3))
            email = _clean_email(email)
            if not email:
                if line.strip().lower() not in ('email', 'email,name', 'email, name'):  # a CSV header
                    invalid += 1
                continue
            if email in existing:
                duplicates += 1
                continue
            existing.add(email)
            new.append(Subscriber(email=email, name=(name or '').strip().strip('"')[:120], source=Subscriber.IMPORT,
                                  status=Subscriber.SUBSCRIBED, confirmed_at=timezone.now()))
        Subscriber.objects.bulk_create(new, ignore_conflicts=True)
        return Response({'added': len(new), 'duplicates': duplicates, 'invalid': invalid,
                         'detail': f'Added {len(new)}. {duplicates} already on the list, {invalid} not valid.'})


class ExportView(APIView):
    permission_classes = [IsAdmin]

    def get(self, request):
        response = HttpResponse(content_type='text/csv; charset=utf-8')
        response['Content-Disposition'] = f'attachment; filename="newsletter-subscribers-{timezone.localdate().isoformat()}.csv"'
        response.write('﻿')  # so Excel reads the accents correctly
        writer = csv.writer(response)
        writer.writerow(['Email', 'Name', 'Status', 'Source', 'Signed up', 'Confirmed', 'Unsubscribed'])
        fmt = lambda d: d.strftime('%Y-%m-%d %H:%M') if d else ''  # noqa: E731
        for s in _filtered(request).iterator():
            # a leading = + - @ would make Excel run the cell as a formula
            name = f"'{s.name}" if s.name[:1] in ('=', '+', '-', '@') else s.name
            writer.writerow([s.email, name, s.get_status_display(), s.get_source_display(), fmt(s.created_at), fmt(s.confirmed_at), fmt(s.unsubscribed_at)])
        return response


# ---------------------------------------------------------------- admin: settings

SETTING_TEXT = {'heading': 80, 'text': 240, 'button_label': 30, 'placeholder': 60}
SETTING_FLAGS = ('enabled', 'double_opt_in', 'welcome_email')


def settings_data(conf):
    return {**{f: getattr(conf, f) for f in (*SETTING_TEXT, *SETTING_FLAGS)}, 'updated_at': conf.updated_at}


class SettingsView(APIView):
    permission_classes = [IsAdmin]

    def get(self, request):
        return Response(settings_data(NewsletterSettings.load()))

    def put(self, request):
        conf = NewsletterSettings.load()
        errors = {}
        for field, limit in SETTING_TEXT.items():
            if field in request.data:
                value = str(request.data[field] or '').strip()
                if not value:
                    errors[field] = 'This can’t be empty.'
                setattr(conf, field, value[:limit])
        for field in SETTING_FLAGS:
            if field in request.data:
                setattr(conf, field, bool(request.data[field]))
        if errors:
            return Response(errors, status=status.HTTP_400_BAD_REQUEST)
        conf.save()
        return Response(settings_data(conf))


# ---------------------------------------------------------------- admin: issues

ISSUE_FIELDS = {'subject': 150, 'preheader': 150, 'title': 150, 'body': 10000, 'image': 500, 'button_label': 60, 'button_link': 300}


def issue_data(issue, full=False):
    d = issue.deliveries
    sent = d.filter(sent_at__isnull=False).count()
    clicks = d.filter(clicked_at__isnull=False).count()
    data = {'id': issue.id, 'subject': issue.subject, 'status': issue.status, 'status_display': issue.get_status_display(),
            'created_at': issue.created_at, 'updated_at': issue.updated_at, 'sent_at': issue.sent_at,
            'sent': sent, 'failed': d.filter(failed=True).count(), 'clicks': clicks,
            'click_rate': round(100 * clicks / sent, 1) if sent else None, 'unsubscribed': d.filter(unsubscribed_at__isnull=False).count()}
    if full:
        data.update({f: getattr(issue, f) for f in ISSUE_FIELDS})
    return data


def apply_issue(issue, data):
    for field, limit in ISSUE_FIELDS.items():
        if field in data:
            setattr(issue, field, str(data[field] or '').strip()[:limit])
    errors = {}
    if not issue.subject:
        errors['subject'] = 'Write the subject line.'
    if not issue.body:
        errors['body'] = 'Write the newsletter.'
    if issue.button_label and not issue.button_link.startswith(('/', 'https://')):
        errors['button_link'] = 'Use a page of this site (starting with /) or a full https:// link.'
    if issue.image and not issue.image.startswith(('/', 'https://')):
        errors['image'] = 'Use an uploaded site image or a full https:// address.'
    return errors


class IssuesView(APIView):
    permission_classes = [IsAdmin]

    def get(self, request):
        return Response([issue_data(i) for i in Issue.objects.all()[:200]])

    def post(self, request):
        issue = Issue(created_by=request.user)
        errors = apply_issue(issue, request.data)
        if errors:
            return Response(errors, status=status.HTTP_400_BAD_REQUEST)
        issue.save()
        return Response(issue_data(issue, full=True), status=status.HTTP_201_CREATED)


class IssueView(APIView):
    permission_classes = [IsAdmin]

    def get(self, request, pk):
        return Response(issue_data(get_object_or_404(Issue, pk=pk), full=True))

    def patch(self, request, pk):
        issue = get_object_or_404(Issue, pk=pk)
        if issue.status != Issue.DRAFT:
            return Response({'detail': 'This newsletter has been sent and can’t be changed.'}, status=status.HTTP_400_BAD_REQUEST)
        errors = apply_issue(issue, request.data)
        if errors:
            return Response(errors, status=status.HTTP_400_BAD_REQUEST)
        issue.save()
        return Response(issue_data(issue, full=True))

    def delete(self, request, pk):
        issue = get_object_or_404(Issue, pk=pk)
        if issue.status != Issue.DRAFT:
            return Response({'detail': 'Sent newsletters are kept for their results.'}, status=status.HTTP_400_BAD_REQUEST)
        issue.delete()
        return Response(status=status.HTTP_204_NO_CONTENT)


class PreviewView(APIView):
    """The email as subscribers will see it, for the live preview next to the editor (nothing is saved)."""
    permission_classes = [IsAdmin]

    def post(self, request):
        issue = Issue()
        apply_issue(issue, request.data)
        issue.subject = issue.subject or 'Subject line'
        issue.body = issue.body or 'Your newsletter text appears here.'
        sample = Subscriber(email='subscriber@example.com', name=str(request.data.get('sample_name', 'Aminata')))
        subject, _, html, _, _ = emails.build_issue(issue, sample, for_email=False)
        return Response({'subject': subject, 'html': html, 'warnings': emails.warnings(issue)})


class IssueTestView(APIView):
    permission_classes = [IsAdmin]

    def post(self, request, pk):
        issue = get_object_or_404(Issue, pk=pk)
        sample = Subscriber(email=request.user.email, name=request.user.first_name)
        try:
            emails.send_issue_to(get_connection(), issue, sample, to=request.user.email)
        except Exception:
            logger.exception('Newsletter test failed')
            return Response({'detail': 'The test email could not be sent. Check the email settings.'}, status=status.HTTP_502_BAD_GATEWAY)
        return Response({'detail': f'Test sent to {request.user.email}.'})


def send_issue(issue):
    """Sends to every confirmed subscriber who hasn't had it yet. Returns (sent, failed)."""
    Issue.objects.filter(pk=issue.pk).update(status=Issue.SENDING)
    done = set(issue.deliveries.values_list('subscriber_id', flat=True))
    subs = [s for s in Subscriber.objects.filter(status=Subscriber.SUBSCRIBED).order_by('id')[:MAX_RECIPIENTS] if s.id not in done]
    sent = failed = 0
    connection = get_connection()
    try:
        connection.open()
        for sub in subs:
            delivery = Delivery.objects.create(issue=issue, subscriber=sub)
            try:
                emails.send_issue_to(connection, issue, sub, delivery)
                delivery.sent_at = timezone.now()
                sent += 1
            except Exception:
                logger.exception('Newsletter %s to %s failed', issue.pk, sub.email)
                delivery.failed = True
                failed += 1
            delivery.save(update_fields=['sent_at', 'failed'])
    finally:
        connection.close()
    Issue.objects.filter(pk=issue.pk).update(status=Issue.SENT, sent_at=timezone.now())
    return sent, failed


class IssueSendView(APIView):
    permission_classes = [IsAdmin]

    def post(self, request, pk):
        issue = get_object_or_404(Issue, pk=pk)
        if issue.status != Issue.DRAFT:
            return Response({'detail': 'This newsletter was already sent.'}, status=status.HTTP_400_BAD_REQUEST)
        if not Subscriber.objects.filter(status=Subscriber.SUBSCRIBED).exists():
            return Response({'detail': 'There are no confirmed subscribers yet.'}, status=status.HTTP_400_BAD_REQUEST)
        sent, failed = send_issue(issue)
        issue.refresh_from_db()
        return Response({**issue_data(issue, full=True), 'detail': f'Sent to {sent} subscribers{f", {failed} failed" if failed else ""}.'})
