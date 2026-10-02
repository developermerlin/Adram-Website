"""Referrals: invitation links, the friend's welcome coupon, the referrer's reward, and personal coupons."""
from datetime import timedelta

from django.utils import timezone

from accounts.models import User

from .models import Coupon, LmsSettings, Order, Referral
from .orders import quote
from .tests import API
from .tests_marketplace import MarketCase

PASSWORD = 'Str0ng!Passw0rd#'


class ReferralTests(MarketCase):
    def my_code(self, user):
        self.as_(user)
        return self.client.get(f'{API}/me/referrals/').data['code']

    def sign_up(self, code, email='newbie@example.com'):
        self.client.force_authenticate(None)
        resp = self.client.post('/api/v1/auth/register/', {
            'email': email, 'first_name': 'New', 'last_name': 'Friend', 'country': 'Sierra Leone',
            'password': PASSWORD, 'password_confirm': PASSWORD, 'track': 'training', 'referral': code}, format='json')
        self.assertIn(resp.status_code, (200, 201), resp.data)
        return User.objects.get(email=email)

    def buy(self, user):
        self.as_(user)
        order = self.client.post(f'{API}/courses/python/buy/', {}, format='json').data
        self.client.post(f'{API}/orders/{order["id"]}/payment/', {'method': 'afrimoney', 'transaction_id': f'T{user.id}',
                                                                  'receipt': self.receipt()}, format='multipart')
        self.as_(self.admin)
        self.client.post(f'{API}/manage/orders/{order["id"]}/decision/', {'action': 'confirm'}, format='json')
        return Order.objects.get(pk=order['id'])

    def test_invite_join_and_reward(self):
        code = self.my_code(self.student)
        data = self.client.get(f'{API}/me/referrals/').data
        self.assertTrue(data['link'].endswith(f'?ref={code}'))
        self.assertEqual((data['friend_percent'], data['reward_percent']), (10, 15))

        friend = self.sign_up(code.lower())  # codes aren't case sensitive
        referral = Referral.objects.get(referred=friend)
        self.assertEqual(referral.referrer, self.student)
        welcome = referral.welcome_coupon
        self.assertEqual((welcome.owner, int(welcome.value), welcome.max_uses), (friend, 10, 1))
        # only the friend can use their welcome code
        self.assertEqual(quote(self.other, [self.second], welcome.code)['coupon_error'], 'This code belongs to someone else.')
        self.assertEqual(quote(friend, [self.second], welcome.code)['discount'], 30)
        self.as_(friend)
        self.assertEqual([c['code'] for c in self.client.get(f'{API}/cart/').data['my_codes']], [welcome.code])

        self.buy(friend)
        referral.refresh_from_db()
        self.assertIsNotNone(referral.rewarded_at)
        self.assertEqual((referral.reward_coupon.owner, int(referral.reward_coupon.value)), (self.student, 15))
        self.as_(self.student)
        friends = self.client.get(f'{API}/me/referrals/').data['friends']
        self.assertEqual((len(friends), friends[0]['rewarded'], friends[0]['reward']['status']), (1, True, 'ready'))
        # a second purchase doesn't reward again
        Order.objects.filter(student=friend).update(status=Order.REFUNDED)
        self.assertEqual(Coupon.objects.filter(owner=self.student).count(), 1)

    def test_bad_codes_and_self_referral_are_ignored(self):
        self.assertFalse(Referral.objects.filter(referred=self.sign_up('NOPE', 'a@example.com')).exists())
        code = self.my_code(self.student)
        self.as_(self.student)
        self.assertEqual(self.client.post(f'{API}/me/referrals/claim/', {'code': code}, format='json').status_code, 400)  # own code

    def test_claim_later_within_seven_days(self):
        code = self.my_code(self.student)
        newcomer = User.objects.create_user(email='late@example.com', password=PASSWORD, role=User.STUDENT, is_verified=True)
        self.as_(newcomer)
        self.assertTrue(self.client.get(f'{API}/me/referrals/').data['can_claim'])
        self.assertEqual(self.client.post(f'{API}/me/referrals/claim/', {'code': 'WRONG'}, format='json').status_code, 400)
        data = self.client.post(f'{API}/me/referrals/claim/', {'code': code}, format='json').data
        self.assertEqual((data['invited_by']['welcome']['percent'], data['can_claim']), (10, False))
        self.assertEqual(self.client.post(f'{API}/me/referrals/claim/', {'code': code}, format='json').status_code, 400)  # once
        User.objects.filter(pk=self.other.pk).update(created_at=timezone.now() - timedelta(days=30))
        self.as_(User.objects.get(pk=self.other.pk))
        self.assertIn('first 7 days', self.client.post(f'{API}/me/referrals/claim/', {'code': code}, format='json').data['detail'])

    def test_switched_off(self):
        LmsSettings.objects.filter(pk=1).update(referrals_enabled=False)
        code = self.my_code(self.student)
        self.assertFalse(Referral.objects.filter(referred=self.sign_up(code)).exists())

    def test_admin_overview_and_settings(self):
        code = self.my_code(self.student)
        self.sign_up(code)
        self.as_(self.admin)
        data = self.client.get(f'{API}/manage/referrals/').data
        self.assertEqual((data['total'], data['rewarded'], data['referrals'][0]['referrer']), (1, 0, 'Amina Kamara'))
        self.assertEqual(self.client.put(f'{API}/manage/settings/', {'referral_friend_percent': 20}, format='json').data['referral_friend_percent'], 20)
        # personal codes stay out of the shared coupons list
        self.assertFalse(any(c['code'].startswith('WELCOME') for c in self.client.get(f'{API}/manage/coupons/').data))
