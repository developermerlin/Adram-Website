"""
Partners API (mounted at /api/v1/partners/).

Public
  GET  /                              visible partners by group, and the featured ones (with their quotes)
  POST apply/                         {organisation, contact_name, email, phone?, website?, partnership_type?, message}
                                      (+ honeypot `company_site`, must stay empty; limited per address)
Admin
  GET/POST          manage/partners/
  PATCH/DELETE      manage/partners/<id>/
  POST              manage/partners/reorder/  {ids: [...]}
  GET/POST          manage/groups/
  PATCH/DELETE      manage/groups/<id>/
  GET               manage/applications/      ?status=
  PATCH/DELETE      manage/applications/<id>/ {status, notes}
"""
import logging

from django.conf import settings
from django.core.cache import cache
from django.core.exceptions import ValidationError
from django.core.validators import URLValidator, validate_email
from django.db.models import Count
from django.shortcuts import get_object_or_404
from django.utils.html import escape
from rest_framework import status
from rest_framework.permissions import AllowAny
from rest_framework.response import Response
from rest_framework.views import APIView

from api.throttling import AnonRate, FormRate

from accounts.emails import INK, MUTED, _frontend, _plain, _send, button, details, layout, paragraph, quote
from accounts.permissions import IsAdmin

from .models import Partner, PartnerApplication, PartnerGroup

logger = logging.getLogger(__name__)
APPLY_LIMIT = 5  # applications per IP address per hour


def partner_data(p, admin=False):
    data = {'id': p.id, 'name': p.name, 'logo': p.logo, 'website': p.website, 'description': p.description,
            'group_id': p.group_id, 'featured': p.featured, 'quote': p.quote, 'quote_author': p.quote_author,
            'quote_role': p.quote_role, 'since': p.since}
    if admin:
        data.update({'visible': p.visible, 'sort_order': p.sort_order, 'group': p.group.name if p.group else ''})
    return data


def group_data(g, count=None):
    data = {'id': g.id, 'name': g.name, 'description': g.description, 'sort_order': g.sort_order}
    if count is not None:
        data['count'] = count
    return data


# ---------------------------------------------------------------- public

class PartnersView(APIView):
    permission_classes = [AllowAny]
    authentication_classes = []

    def get(self, request):
        partners = list(Partner.objects.filter(visible=True).select_related('group'))
        groups = []
        for g in PartnerGroup.objects.all():
            members = [partner_data(p) for p in partners if p.group_id == g.id]
            if members:
                groups.append({**group_data(g), 'partners': members})
        others = [partner_data(p) for p in partners if p.group_id is None]
        if others:
            groups.append({'id': None, 'name': '', 'description': '', 'partners': others})
        featured = [partner_data(p) for p in partners if p.featured and p.quote]
        return Response({'groups': groups, 'featured': featured, 'count': len(partners)})


class ApplyView(APIView):
    permission_classes = [AllowAny]
    throttle_classes = [AnonRate, FormRate]
    authentication_classes = []

    def post(self, request):
        d = request.data
        key = f'partners:apply:{request.META.get("HTTP_X_FORWARDED_FOR", "").split(",")[0].strip() or request.META.get("REMOTE_ADDR", "")}'
        if cache.get(key, 0) >= APPLY_LIMIT:
            return Response({'detail': 'Too many applications from this connection. Please try again later.'}, status=status.HTTP_429_TOO_MANY_REQUESTS)
        cache.set(key, cache.get(key, 0) + 1, 3600)
        if str(d.get('company_site', '')).strip():  # honeypot
            return Response({'detail': 'Thank you! We’ll be in touch within two working days.'}, status=status.HTTP_201_CREATED)

        clean = {f: str(d.get(f, '') or '').strip() for f in ('organisation', 'contact_name', 'email', 'phone', 'website', 'partnership_type', 'message')}
        errors = {}
        if not clean['organisation']:
            errors['organisation'] = 'Enter your organisation’s name.'
        if not clean['contact_name']:
            errors['contact_name'] = 'Enter your name.'
        try:
            validate_email(clean['email'])
        except ValidationError:
            errors['email'] = 'Enter a valid email address.'
        if len(clean['message']) < 20:
            errors['message'] = 'Tell us a little more about the partnership you have in mind (at least 20 characters).'
        if clean['website']:
            site = clean['website'] if clean['website'].startswith('http') else f'https://{clean["website"]}'
            try:
                URLValidator(schemes=['http', 'https'])(site)
                clean['website'] = site
            except ValidationError:
                errors['website'] = 'Enter a valid web address, or leave it empty.'
        if errors:
            return Response(errors, status=status.HTTP_400_BAD_REQUEST)
        limits = {'organisation': 150, 'contact_name': 120, 'email': 254, 'phone': 40, 'website': 300, 'partnership_type': 80, 'message': 3000}
        app = PartnerApplication.objects.create(**{k: v[:limits[k]] for k, v in clean.items()})
        for send in (notify_team, confirm_applicant):
            try:
                send(app)
            except Exception:
                logger.exception('Could not send partner application email (%s) for %s', send.__name__, app.pk)
        return Response({'detail': 'Thank you! We’ve received your application and will be in touch within two working days.'},
                        status=status.HTTP_201_CREATED)


def notify_team(app):
    rows = [('Organisation', app.organisation), ('Contact', app.contact_name), ('Email', app.email), ('Phone', app.phone),
            ('Website', app.website), ('Type of partnership', app.partnership_type)]
    title = 'New partnership application'
    reason = 'You received this email because someone applied to partner with ADRAM on the website.'
    html = layout(preheader=f'{app.organisation} wants to partner with ADRAM.', label='Partners', tone='info', title=title, reason=reason,
                  body=paragraph(f'<strong style="color:{INK};">{escape(app.organisation)}</strong> applied to become a partner. Reply to this email to answer them directly.')
                  + details(rows) + paragraph('<strong>Their message</strong>', 14, INK, '0 0 6px') + quote(app.message)
                  + button('Open the applications', _frontend('/admin/partners?tab=applications')))
    text = _plain(title, ['\n'.join(f'{k}: {v or "—"}' for k, v in rows), f'Message:\n{app.message}'], reason)
    _send(settings.CONTACT_NOTIFY_EMAIL, f'Partnership application: {app.organisation}', text, html, reply_to=[app.email])


def confirm_applicant(app):
    title = 'Thanks for your interest in partnering with us'
    first = app.contact_name.split(' ')[0]
    reason = f'You received this email because {app.email} was used to apply for a partnership with ADRAM Technologies.'
    html = layout(preheader='We’ve received your partnership application.', label='Partners', tone='success', title=title, reason=reason,
                  body=paragraph(f'Hello {escape(first)},')
                  + paragraph(f'Thank you for applying to partner with ADRAM Technologies on behalf of <strong style="color:{INK};">{escape(app.organisation)}</strong>. '
                              'Our partnerships team will review your application and get back to you within two working days.')
                  + paragraph('Here is a copy of your message:', 14, MUTED, '0 0 6px') + quote(app.message))
    text = _plain(title, [f'Hello {first},', 'Thank you for applying to partner with ADRAM Technologies. We will get back to you within two working days.',
                          f'Your message:\n{app.message}'], reason)
    _send(app.email, 'We received your partnership application – ADRAM Technologies', text, html)


# ---------------------------------------------------------------- admin: partners

TEXT = {'name': 120, 'logo': 500, 'website': 300, 'description': 400, 'quote': 600, 'quote_author': 120, 'quote_role': 120}


def apply_partner(p, data):
    errors = {}
    for field, limit in TEXT.items():
        if field in data:
            setattr(p, field, str(data[field] or '').strip()[:limit])
    if not p.name:
        errors['name'] = 'Enter the partner’s name.'
    if p.logo and not p.logo.startswith(('/', 'https://')):
        errors['logo'] = 'Use an uploaded image or a full https:// address.'
    if p.website:
        if not p.website.startswith('http'):
            p.website = f'https://{p.website}'
        try:
            URLValidator(schemes=['http', 'https'])(p.website)
        except ValidationError:
            errors['website'] = 'Enter a valid web address.'
    if 'group_id' in data:
        p.group = PartnerGroup.objects.filter(pk=data['group_id']).first() if data['group_id'] else None
    for flag in ('featured', 'visible'):
        if flag in data:
            setattr(p, flag, bool(data[flag]))
    if 'since' in data:
        try:
            year = int(data['since']) if data['since'] not in (None, '') else None
            if year is not None and not 1950 <= year <= 2100:
                raise ValueError
            p.since = year
        except (TypeError, ValueError):
            errors['since'] = 'Enter a year, e.g. 2023.'
    if p.featured and not p.quote:
        errors['quote'] = 'A featured partner needs a quote to show in the spotlight.'
    return errors


class ManagePartnersView(APIView):
    permission_classes = [IsAdmin]

    def get(self, request):
        return Response([partner_data(p, admin=True) for p in Partner.objects.select_related('group')])

    def post(self, request):
        p = Partner(sort_order=Partner.objects.count())
        errors = apply_partner(p, request.data)
        if errors:
            return Response(errors, status=status.HTTP_400_BAD_REQUEST)
        p.save()
        return Response(partner_data(p, admin=True), status=status.HTTP_201_CREATED)


class ManagePartnerView(APIView):
    permission_classes = [IsAdmin]

    def patch(self, request, pk):
        p = get_object_or_404(Partner, pk=pk)
        errors = apply_partner(p, request.data)
        if errors:
            return Response(errors, status=status.HTTP_400_BAD_REQUEST)
        p.save()
        return Response(partner_data(p, admin=True))

    def delete(self, request, pk):
        get_object_or_404(Partner, pk=pk).delete()
        return Response(status=status.HTTP_204_NO_CONTENT)


class ReorderView(APIView):
    permission_classes = [IsAdmin]

    def post(self, request):
        ids = [i for i in request.data.get('ids', []) if isinstance(i, int)]
        for position, pk in enumerate(ids):
            Partner.objects.filter(pk=pk).update(sort_order=position)
        return Response({'detail': 'Order saved.'})


# ---------------------------------------------------------------- admin: groups

class ManageGroupsView(APIView):
    permission_classes = [IsAdmin]

    def get(self, request):
        counts = dict(Partner.objects.filter(group__isnull=False).values_list('group').annotate(n=Count('id')))
        return Response([group_data(g, counts.get(g.id, 0)) for g in PartnerGroup.objects.all()])

    def post(self, request):
        name = str(request.data.get('name', '')).strip()[:80]
        if not name:
            return Response({'name': 'Name the group.'}, status=status.HTTP_400_BAD_REQUEST)
        if PartnerGroup.objects.filter(name__iexact=name).exists():
            return Response({'name': 'This group already exists.'}, status=status.HTTP_400_BAD_REQUEST)
        g = PartnerGroup.objects.create(name=name, description=str(request.data.get('description', '')).strip()[:240],
                                        sort_order=PartnerGroup.objects.count())
        return Response(group_data(g, 0), status=status.HTTP_201_CREATED)


class ManageGroupView(APIView):
    permission_classes = [IsAdmin]

    def patch(self, request, pk):
        g = get_object_or_404(PartnerGroup, pk=pk)
        if 'name' in request.data:
            name = str(request.data['name'] or '').strip()[:80]
            if not name:
                return Response({'name': 'Name the group.'}, status=status.HTTP_400_BAD_REQUEST)
            if PartnerGroup.objects.filter(name__iexact=name).exclude(pk=pk).exists():
                return Response({'name': 'This group already exists.'}, status=status.HTTP_400_BAD_REQUEST)
            g.name = name
        if 'description' in request.data:
            g.description = str(request.data['description'] or '').strip()[:240]
        if 'sort_order' in request.data:
            try:
                g.sort_order = max(0, int(request.data['sort_order']))
            except (TypeError, ValueError):
                pass
        g.save()
        return Response(group_data(g, g.partners.count()))

    def delete(self, request, pk):
        get_object_or_404(PartnerGroup, pk=pk).delete()  # its partners stay, without a group
        return Response(status=status.HTTP_204_NO_CONTENT)


# ---------------------------------------------------------------- admin: applications

def application_data(a):
    return {'id': a.id, 'organisation': a.organisation, 'contact_name': a.contact_name, 'email': a.email, 'phone': a.phone,
            'website': a.website, 'partnership_type': a.partnership_type, 'message': a.message, 'status': a.status,
            'status_display': a.get_status_display(), 'notes': a.notes, 'created_at': a.created_at, 'updated_at': a.updated_at}


class ApplicationsView(APIView):
    permission_classes = [IsAdmin]

    def get(self, request):
        apps = PartnerApplication.objects.all()
        if request.query_params.get('status') in dict(PartnerApplication.STATUSES):
            apps = apps.filter(status=request.query_params['status'])
        counts = dict(PartnerApplication.objects.values_list('status').annotate(n=Count('id')))
        return Response({'results': [application_data(a) for a in apps[:300]],
                         'counts': {k: counts.get(k, 0) for k, _ in PartnerApplication.STATUSES}})


class ApplicationView(APIView):
    permission_classes = [IsAdmin]

    def patch(self, request, pk):
        a = get_object_or_404(PartnerApplication, pk=pk)
        if request.data.get('status') in dict(PartnerApplication.STATUSES):
            a.status = request.data['status']
        if 'notes' in request.data:
            a.notes = str(request.data['notes'] or '')[:3000]
        a.save()
        return Response(application_data(a))

    def delete(self, request, pk):
        get_object_or_404(PartnerApplication, pk=pk).delete()
        return Response(status=status.HTTP_204_NO_CONTENT)
