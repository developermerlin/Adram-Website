"""
Affiliates: partners (bloggers, YouTubers, schools…) who promote courses with their own link and earn a commission.

A partner applies; an administrator approves them (and may change their rate). Links carry ?aff=CODE; the site
remembers it for LmsSettings.affiliate_cookie_days and sends it with the order. The order keeps the partner and the
commission (a share of what the student paid, paid by the platform: instructors' earnings are unchanged). Commission
counts once the order is paid, can be paid out after the same holding period as instructor earnings, and a refund
takes it away.

  POST /lms/affiliates/<code>/click/          counts a visit through a link (anyone)
  GET  /lms/me/affiliate/                     my application or my dashboard (clicks, orders, earnings, payouts)
  POST /lms/me/affiliate/                     apply {website, audience, payout_details}; PATCH: update payout details
  GET  /lms/manage/affiliates/                administrators: partners with their numbers
  POST /lms/manage/affiliates/<id>/           {action: approve|reject|suspend|reinstate, note, commission_percent}
  POST /lms/manage/affiliates/<id>/payouts/   {amount, reference}  record a payment to the partner
"""
from datetime import timedelta
from decimal import Decimal, InvalidOperation

from django.conf import settings
from django.db.models import F, Sum
from django.shortcuts import get_object_or_404
from django.utils import timezone
from rest_framework import status
from rest_framework.permissions import AllowAny, IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView

from accounts.permissions import IsAdmin

from . import analytics
from .models import Affiliate, AffiliateClickDay, AffiliatePayout, LmsSettings, Order
from .notify import notify

ZERO = Decimal('0')


def money(value):
    return f'{Decimal(value or 0):.2f}'


def balance(partner):
    """earned (paid orders), on_hold (inside the refund window), paid out, and available to pay now."""
    rates = LmsSettings.load()
    paid_orders = partner.orders.filter(status=Order.SUCCESSFUL)
    earned = paid_orders.aggregate(t=Sum('affiliate_commission'))['t'] or ZERO
    on_hold = paid_orders.filter(paid_at__gte=timezone.now() - timedelta(days=rates.payout_hold_days)).aggregate(t=Sum('affiliate_commission'))['t'] or ZERO
    paid = partner.payouts.aggregate(t=Sum('amount'))['t'] or ZERO
    return {'earned': money(earned), 'on_hold': money(on_hold), 'paid': money(paid),
            'available': money(max(ZERO, earned - on_hold - paid)), 'hold_days': rates.payout_hold_days}


def stats(partner, days=None):
    orders = partner.orders.exclude(status=Order.CANCELLED)
    clicks = partner.click_days.all()
    if days:
        since = timezone.now() - timedelta(days=days)
        orders = orders.filter(created_at__gte=since)
        clicks = clicks.filter(date__gte=since.date())
    paid = orders.filter(status=Order.SUCCESSFUL)
    n_clicks = clicks.aggregate(t=Sum('clicks'))['t'] or 0
    return {'clicks': n_clicks, 'orders': orders.count(), 'paid_orders': paid.count(),
            'sales': money(paid.aggregate(t=Sum('total'))['t']), 'commission': money(paid.aggregate(t=Sum('affiliate_commission'))['t']),
            'conversion': round(100 * paid.count() / n_clicks, 1) if n_clicks else None}


def partner_data(partner, full=False):
    data = {'id': partner.id, 'code': partner.code, 'status': partner.status, 'status_display': partner.get_status_display(),
            'commission_percent': f'{partner.commission_percent:.2f}', 'website': partner.website, 'audience': partner.audience,
            'note': partner.note, 'created_at': partner.created_at, 'approved_at': partner.approved_at,
            'link': f'{settings.FRONTEND_URL.rstrip("/")}/courses?aff={partner.code}'}
    if full:
        data['payout_details'] = partner.payout_details
    return data


class ClickView(APIView):
    permission_classes = [AllowAny]
    authentication_classes = []

    def post(self, request, code):
        partner = Affiliate.objects.filter(code=code.strip().upper(), status=Affiliate.APPROVED).first()
        if partner:
            row, _ = AffiliateClickDay.objects.get_or_create(affiliate=partner, date=timezone.localdate())
            AffiliateClickDay.objects.filter(pk=row.pk).update(clicks=F('clicks') + 1)
        # always the same answer, so codes can't be probed; the browser keeps the code for this long
        return Response({'days': LmsSettings.load().affiliate_cookie_days})


class MyAffiliateView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request):
        rates = LmsSettings.load()
        partner = Affiliate.objects.filter(user=request.user).first()
        data = {'enabled': rates.affiliates_enabled, 'default_percent': f'{rates.affiliate_percent:.2f}',
                'cookie_days': rates.affiliate_cookie_days, 'affiliate': partner_data(partner, full=True) if partner else None}
        if partner and partner.status == Affiliate.APPROVED:
            days = analytics.period(request)
            data.update({
                'days': days, 'period': stats(partner, days), 'all_time': stats(partner), 'balance': balance(partner),
                'clicks': [{'date': d.isoformat(), 'value': c} for d, c in self._clicks(partner, days)],
                'orders': [{'number': o.number, 'date': o.created_at, 'status': o.status, 'status_display': o.get_status_display(),
                            'total': money(o.total), 'commission': money(o.affiliate_commission)}
                           for o in partner.orders.exclude(status=Order.CANCELLED).order_by('-created_at')[:20]],
                'payouts': [{'amount': money(p.amount), 'reference': p.reference, 'date': p.created_at} for p in partner.payouts.all()[:20]],
            })
        return Response(data)

    @staticmethod
    def _clicks(partner, days):
        found = dict(partner.click_days.filter(date__gte=timezone.localdate() - timedelta(days=days - 1)).values_list('date', 'clicks'))
        return [(d, found.get(d, 0)) for d in analytics.days_back(days)]

    def post(self, request):
        rates = LmsSettings.load()
        if not rates.affiliates_enabled:
            return Response({'detail': 'The affiliate programme is closed at the moment.'}, status=status.HTTP_400_BAD_REQUEST)
        partner = Affiliate.objects.filter(user=request.user).first()
        if partner and partner.status != Affiliate.REJECTED:
            return Response({'detail': 'You have already applied.'}, status=status.HTTP_400_BAD_REQUEST)
        audience = str(request.data.get('audience', '')).strip()[:1000]
        if len(audience) < 20:
            return Response({'audience': 'Tell us where and to whom you will share the courses (a few sentences).'}, status=status.HTTP_400_BAD_REQUEST)
        partner = partner or Affiliate(user=request.user)
        partner.status, partner.note, partner.commission_percent = Affiliate.PENDING, '', rates.affiliate_percent
        partner.website = str(request.data.get('website', '')).strip()[:300]
        partner.audience = audience
        partner.payout_details = str(request.data.get('payout_details', '')).strip()[:500]
        partner.save()
        from .notify import notify_admins
        notify_admins('system', f'New affiliate application: {request.user.get_full_name() or request.user.email}', audience[:200],
                      '/admin/course-sales?tab=affiliates')
        return self.get(request)

    def patch(self, request):
        partner = get_object_or_404(Affiliate, user=request.user)
        if 'payout_details' in request.data:
            partner.payout_details = str(request.data['payout_details']).strip()[:500]
        if 'website' in request.data:
            partner.website = str(request.data['website']).strip()[:300]
        partner.save(update_fields=['payout_details', 'website'])
        return self.get(request)


class ManageAffiliatesView(APIView):
    permission_classes = [IsAdmin]

    def get(self, request):
        rows = Affiliate.objects.select_related('user')
        return Response([{**partner_data(p, full=True), 'name': p.user.get_full_name() or p.user.email, 'email': p.user.email,
                          **({'stats': stats(p), 'balance': balance(p)} if p.status != Affiliate.PENDING else {})} for p in rows])


class ManageAffiliateView(APIView):
    permission_classes = [IsAdmin]
    MOVES = {'approve': ([Affiliate.PENDING, Affiliate.REJECTED], Affiliate.APPROVED),
             'reject': ([Affiliate.PENDING], Affiliate.REJECTED),
             'suspend': ([Affiliate.APPROVED], Affiliate.SUSPENDED),
             'reinstate': ([Affiliate.SUSPENDED], Affiliate.APPROVED)}

    def post(self, request, pk):
        partner = get_object_or_404(Affiliate.objects.select_related('user'), pk=pk)
        action = request.data.get('action')
        if 'commission_percent' in request.data:
            try:
                percent = Decimal(str(request.data['commission_percent']))
            except InvalidOperation:
                percent = Decimal('-1')
            if not 0 <= percent <= 90:
                return Response({'commission_percent': 'Between 0 and 90%.'}, status=status.HTTP_400_BAD_REQUEST)
            partner.commission_percent = percent  # applies to new orders
        if action:
            allowed, target = self.MOVES.get(action, ([], None))
            if partner.status not in allowed:
                return Response({'action': 'That can’t be done to this affiliate now.'}, status=status.HTTP_400_BAD_REQUEST)
            partner.status, partner.note = target, str(request.data.get('note', '')).strip()[:300]
            if target == Affiliate.APPROVED and not partner.approved_at:
                partner.approved_at = timezone.now()
            message = {'approve': ('You’re an ADRAM affiliate!', 'Share your link and earn a commission on every course bought through it.'),
                       'reinstate': ('Your affiliate account is active again', partner.note),
                       'reject': ('Your affiliate application', partner.note or 'We couldn’t accept your application this time.'),
                       'suspend': ('Your affiliate account is suspended', partner.note or 'Your links no longer earn commission.')}[action]
            notify(partner.user, 'system', *message, '/student/affiliate')
        partner.save()
        return Response({**partner_data(partner, full=True), 'name': partner.user.get_full_name() or partner.user.email,
                         'email': partner.user.email, 'stats': stats(partner), 'balance': balance(partner)})


class AffiliatePayoutsView(APIView):
    permission_classes = [IsAdmin]

    def post(self, request, pk):
        partner = get_object_or_404(Affiliate, pk=pk)
        try:
            amount = Decimal(str(request.data.get('amount'))).quantize(Decimal('0.01'))
        except InvalidOperation:
            amount = ZERO
        available = Decimal(balance(partner)['available'])
        if amount <= 0 or amount > available:
            return Response({'amount': f'Enter an amount up to the available NLe {available:,.2f}.'}, status=status.HTTP_400_BAD_REQUEST)
        AffiliatePayout.objects.create(affiliate=partner, amount=amount, reference=str(request.data.get('reference', '')).strip()[:120],
                                       paid_by=request.user)
        notify(partner.user, 'payment', f'You’ve been paid NLe {amount:,.2f}', 'Your affiliate commission was sent.', '/student/affiliate')
        return Response(balance(partner), status=status.HTTP_201_CREATED)
