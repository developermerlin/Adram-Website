"""
Referrals: students invite friends with a personal link (…/?ref=CODE).

The friend gets a personal welcome coupon when they join; the student who invited them gets a reward coupon once the
friend's first paid order is confirmed. Both coupons only work for their owner, once, for LmsSettings.referral_valid_days.
Rates and the on/off switch are in LmsSettings (Orders & coupons → Settings).

  GET  /lms/me/referrals/          my code and link, the rates, friends who joined, my coupons from referrals
  POST /lms/me/referrals/claim/    {code}  joined without the link? use a friend's code within 7 days of joining
  GET  /lms/manage/referrals/      administrators: every referral and what it earned
"""
import secrets
from datetime import timedelta

from django.conf import settings
from django.db import IntegrityError, transaction
from django.utils import timezone
from rest_framework import status
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView

from accounts.permissions import IsAdmin

from .briefs import public_name
from .models import Coupon, LmsSettings, Order, Referral, ReferralCode
from .notify import notify

CLAIM_DAYS = 7


def code_for(user):
    return ReferralCode.objects.get_or_create(user=user)[0]


def personal_coupon(owner, percent, prefix, description):
    days = LmsSettings.load().referral_valid_days
    for _ in range(5):
        try:
            with transaction.atomic():
                return Coupon.objects.create(
                    code=f'{prefix}-{secrets.token_hex(3).upper()}', description=description, kind=Coupon.PERCENT,
                    value=percent, owner=owner, max_uses=1, per_user_limit=1, ends_at=timezone.now() + timedelta(days=days))
        except IntegrityError:
            continue  # the random code was taken: try another
    return None


def attach(user, code):
    """`user` joined with a friend's `code`: record it and give them their welcome coupon. Returns the Referral or None."""
    rates = LmsSettings.load()
    code = (code or '').strip().upper()
    if not rates.referrals_enabled or not code:
        return None
    owner = ReferralCode.objects.filter(code=code).select_related('user').first()
    if not owner or owner.user_id == user.id or Referral.objects.filter(referred=user).exists():
        return None
    welcome = personal_coupon(user, rates.referral_friend_percent, 'WELCOME',
                              f'Welcome discount: invited by {public_name(owner.user)}') if rates.referral_friend_percent else None
    referral = Referral.objects.create(referrer=owner.user, referred=user, welcome_coupon=welcome)
    if welcome:
        notify(user, 'coupon', f'{rates.referral_friend_percent}% off your first course',
               f'A welcome gift from {public_name(owner.user)}: use code {welcome.code} at checkout.', '/student/referrals')
    notify(owner.user, 'system', f'{public_name(user)} joined with your invitation',
           'You’ll get your reward when they buy their first course.', '/student/referrals')
    return referral


def reward(order):
    """A paid order: if it is a referred student's first purchase, reward the friend who invited them (once)."""
    if order.total <= 0:
        return
    referral = Referral.objects.filter(referred_id=order.student_id, rewarded_at__isnull=True).select_related('referrer').first()
    if not referral:
        return
    if Order.objects.filter(student_id=order.student_id, status=Order.SUCCESSFUL, total__gt=0).exclude(pk=order.pk).exists():
        return  # not their first paid order (an earlier one was before rewards existed)
    rates = LmsSettings.load()
    coupon = personal_coupon(referral.referrer, rates.referral_reward_percent, 'THANKS',
                             f'Referral reward: {public_name(order.student)} bought a course') if rates.referral_reward_percent else None
    referral.reward_coupon, referral.rewarded_order, referral.rewarded_at = coupon, order, timezone.now()
    referral.save(update_fields=['reward_coupon', 'rewarded_order', 'rewarded_at'])
    if coupon:
        notify(referral.referrer, 'coupon', f'You earned {rates.referral_reward_percent}% off',
               f'{public_name(order.student)} bought their first course. Your code: {coupon.code}', '/student/referrals')


def coupon_data(coupon):
    if not coupon:
        return None
    used = coupon.uses() > 0
    expired = bool(coupon.ends_at and coupon.ends_at < timezone.now())
    return {'code': coupon.code, 'percent': int(coupon.value), 'ends_at': coupon.ends_at,
            'status': 'used' if used else 'expired' if expired else 'ready'}


class MyReferralsView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request):
        rates = LmsSettings.load()
        code = code_for(request.user).code
        made = Referral.objects.filter(referrer=request.user).select_related('referred', 'reward_coupon')
        mine = Referral.objects.filter(referred=request.user).select_related('referrer', 'welcome_coupon').first()
        joined_recently = request.user.created_at >= timezone.now() - timedelta(days=CLAIM_DAYS)
        return Response({
            'enabled': rates.referrals_enabled, 'code': code,
            'link': f'{settings.FRONTEND_URL.rstrip("/")}/courses?ref={code}',
            'friend_percent': rates.referral_friend_percent, 'reward_percent': rates.referral_reward_percent,
            'valid_days': rates.referral_valid_days,
            'friends': [{'name': public_name(r.referred), 'joined_at': r.created_at, 'rewarded': bool(r.rewarded_at),
                         'reward': coupon_data(r.reward_coupon)} for r in made],
            'invited_by': {'name': public_name(mine.referrer), 'welcome': coupon_data(mine.welcome_coupon)} if mine else None,
            'can_claim': rates.referrals_enabled and not mine and joined_recently
                         and not Order.objects.filter(student=request.user, status=Order.SUCCESSFUL, total__gt=0).exists(),
        })


class ClaimReferralView(APIView):
    permission_classes = [IsAuthenticated]

    def post(self, request):
        if Referral.objects.filter(referred=request.user).exists():
            return Response({'detail': 'You already joined through a friend’s invitation.'}, status=status.HTTP_400_BAD_REQUEST)
        if request.user.created_at < timezone.now() - timedelta(days=CLAIM_DAYS):
            return Response({'detail': f'Invitation codes can be added in your first {CLAIM_DAYS} days only.'}, status=status.HTTP_400_BAD_REQUEST)
        if Order.objects.filter(student=request.user, status=Order.SUCCESSFUL, total__gt=0).exists():
            return Response({'detail': 'Invitation codes are for new students, before their first purchase.'}, status=status.HTTP_400_BAD_REQUEST)
        referral = attach(request.user, request.data.get('code'))
        if not referral:
            return Response({'code': 'That code isn’t valid.'}, status=status.HTTP_400_BAD_REQUEST)
        return MyReferralsView().get(request)


class ManageReferralsView(APIView):
    permission_classes = [IsAdmin]

    def get(self, request):
        rows = Referral.objects.select_related('referrer', 'referred', 'welcome_coupon', 'reward_coupon', 'rewarded_order')[:300]
        total = Referral.objects.count()
        rewarded = Referral.objects.filter(rewarded_at__isnull=False).count()
        return Response({
            'total': total, 'rewarded': rewarded, 'conversion': round(100 * rewarded / total) if total else 0,
            'referrals': [{'referrer': r.referrer.get_full_name() or r.referrer.email, 'referred': r.referred.get_full_name() or r.referred.email,
                           'joined_at': r.created_at, 'rewarded_at': r.rewarded_at,
                           'order': r.rewarded_order.number if r.rewarded_order else None,
                           'welcome': coupon_data(r.welcome_coupon), 'reward': coupon_data(r.reward_coupon)} for r in rows],
        })
