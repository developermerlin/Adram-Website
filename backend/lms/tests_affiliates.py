"""Affiliates: applying, approval, link clicks, commission on orders, holding period, refunds and payouts."""
from datetime import timedelta
from decimal import Decimal

from django.utils import timezone

from accounts.models import User

from .models import Affiliate, AffiliateClickDay, LmsSettings, Order, OrderItem
from .tests import API
from .tests_marketplace import MarketCase


class AffiliateTests(MarketCase):
    @classmethod
    def setUpTestData(cls):
        super().setUpTestData()
        cls.partner_user = User.objects.create_user(email='blogger@example.com', password='Str0ng!Pass', role=User.STUDENT, is_verified=True,
                                                    first_name='Bintu', last_name='Blogger')

    def apply_and_approve(self):
        self.as_(self.partner_user)
        self.assertEqual(self.client.post(f'{API}/me/affiliate/', {'audience': 'short'}, format='json').status_code, 400)
        data = self.client.post(f'{API}/me/affiliate/', {'audience': 'I run a tech blog read by 5,000 students in Freetown.',
                                                         'payout_details': 'Orange Money 076 000 000'}, format='json').data
        self.assertEqual(data['affiliate']['status'], 'pending')
        partner = Affiliate.objects.get(user=self.partner_user)
        self.as_(self.admin)
        resp = self.client.post(f'{API}/manage/affiliates/{partner.id}/', {'action': 'approve', 'commission_percent': '20'}, format='json')
        self.assertEqual((resp.data['status'], resp.data['commission_percent']), ('approved', '20.00'))
        partner.refresh_from_db()
        return partner

    def buy(self, code, student=None, pay=True):
        self.as_(student or self.student)
        order = self.client.post(f'{API}/courses/python/buy/', {'affiliate': code}, format='json').data
        if pay:
            self.client.post(f'{API}/orders/{order["id"]}/payment/', {'method': 'afrimoney', 'transaction_id': f'T{order["id"]}',
                                                                      'receipt': self.receipt()}, format='multipart')
            self.as_(self.admin)
            self.client.post(f'{API}/manage/orders/{order["id"]}/decision/', {'action': 'confirm'}, format='json')
        return Order.objects.get(pk=order['id'])

    def test_apply_approve_and_earn(self):
        partner = self.apply_and_approve()
        self.client.force_authenticate(None)
        for _ in range(4):
            self.client.post(f'{API}/affiliates/{partner.code.lower()}/click/')
        self.assertEqual(AffiliateClickDay.objects.get(affiliate=partner).clicks, 4)

        self.second.instructor = self.teacher
        self.second.save(update_fields=['instructor'])
        order = self.buy(partner.code)
        self.assertEqual((order.affiliate, order.affiliate_commission), (partner, Decimal('60.00')))  # 20% of 300
        # instructor's share is unchanged: the platform pays the commission
        self.assertEqual(OrderItem.objects.get(order=order).instructor_share, Decimal('210.00'))

        self.as_(self.partner_user)
        data = self.client.get(f'{API}/me/affiliate/?days=7').data
        self.assertEqual((data['period']['clicks'], data['period']['paid_orders'], data['period']['conversion']), (4, 1, 25.0))
        self.assertEqual((data['balance']['earned'], data['balance']['on_hold'], data['balance']['available']), ('60.00', '60.00', '0.00'))
        self.assertEqual(data['clicks'][-1]['value'], 4)

        # after the holding period it can be paid out
        Order.objects.filter(pk=order.pk).update(paid_at=timezone.now() - timedelta(days=30))
        self.as_(self.admin)
        url = f'{API}/manage/affiliates/{partner.id}/payouts/'
        self.assertEqual(self.client.post(url, {'amount': '61'}, format='json').status_code, 400)
        self.assertEqual(self.client.post(url, {'amount': '60', 'reference': 'OM-123'}, format='json').data['available'], '0.00')
        self.as_(self.partner_user)
        self.assertEqual(self.client.get(f'{API}/me/affiliate/').data['payouts'][0]['amount'], '60.00')

    def test_no_commission_on_own_purchase_or_unknown_codes(self):
        partner = self.apply_and_approve()
        self.assertIsNone(self.buy(partner.code, student=self.partner_user, pay=False).affiliate)
        self.assertIsNone(self.buy('NOPE', pay=False).affiliate)

    def test_pending_suspended_and_switched_off_earn_nothing(self):
        self.as_(self.partner_user)
        self.client.post(f'{API}/me/affiliate/', {'audience': 'A long enough description of my audience.'}, format='json')
        partner = Affiliate.objects.get(user=self.partner_user)
        self.assertIsNone(self.buy(partner.code, pay=False).affiliate)  # not approved yet
        self.as_(self.admin)
        self.client.post(f'{API}/manage/affiliates/{partner.id}/', {'action': 'approve'}, format='json')
        self.client.post(f'{API}/manage/affiliates/{partner.id}/', {'action': 'suspend', 'note': 'Spam'}, format='json')
        self.assertIsNone(self.buy(partner.code, pay=False).affiliate)
        self.client.post(f'{API}/manage/affiliates/{partner.id}/', {'action': 'reinstate'}, format='json')
        LmsSettings.objects.filter(pk=1).update(affiliates_enabled=False)
        self.assertIsNone(self.buy(partner.code, pay=False).affiliate)

    def test_refund_removes_commission(self):
        partner = self.apply_and_approve()
        order = self.buy(partner.code)
        self.as_(self.admin)
        self.client.post(f'{API}/manage/orders/{order.id}/refund/', {'reason': 'x'}, format='json')
        self.as_(self.partner_user)
        self.assertEqual(self.client.get(f'{API}/me/affiliate/').data['balance']['earned'], '0.00')

    def test_admin_list_and_reapply_after_rejection(self):
        self.as_(self.partner_user)
        self.client.post(f'{API}/me/affiliate/', {'audience': 'A long enough description of my audience.'}, format='json')
        partner = Affiliate.objects.get(user=self.partner_user)
        self.assertEqual(self.client.post(f'{API}/me/affiliate/', {'audience': 'A long enough description again.'}, format='json').status_code, 400)
        self.as_(self.admin)
        self.assertEqual(self.client.get(f'{API}/manage/affiliates/').data[0]['email'], 'blogger@example.com')
        self.client.post(f'{API}/manage/affiliates/{partner.id}/', {'action': 'reject', 'note': 'Tell us more'}, format='json')
        self.as_(self.partner_user)
        self.assertEqual(self.client.post(f'{API}/me/affiliate/', {'audience': 'A longer and better description of my audience.'},
                                          format='json').data['affiliate']['status'], 'pending')
        self.as_(self.student)
        self.assertEqual(self.client.get(f'{API}/manage/affiliates/').status_code, 403)
