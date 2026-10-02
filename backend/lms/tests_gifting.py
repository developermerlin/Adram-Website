"""Course bundles and gifts."""
from decimal import Decimal

from django.core import mail

from portal.models import TrainingEnrollment

from .models import Bundle, Gift, Notification, Order, OrderItem
from .tests import API
from .tests_marketplace import MarketCase


class GiftingCase(MarketCase):
    def make_bundle(self, price='600'):
        self.as_(self.admin)
        resp = self.client.post(f'{API}/manage/bundles/', {'title': 'Web and Python', 'price': price, 'courses': ['web', 'python'],
                                                           'is_published': True}, format='json')
        self.assertEqual(resp.status_code, 201, resp.data)
        return resp.data

    def pay(self, order_id):
        self.client.post(f'{API}/orders/{order_id}/payment/', {'method': 'afrimoney', 'transaction_id': f'TX{order_id}',
                                                               'receipt': self.receipt()}, format='multipart')
        self.as_(self.admin)
        with self.captureOnCommitCallbacks(execute=True):
            return self.client.post(f'{API}/manage/orders/{order_id}/decision/', {'action': 'confirm'}, format='json').data


class BundleTests(GiftingCase):
    def test_admin_builds_bundles(self):
        self.as_(self.admin)
        bad = self.client.post(f'{API}/manage/bundles/', {'title': 'x', 'price': 0, 'courses': ['web']}, format='json')
        self.assertEqual(set(bad.data), {'price', 'courses'})
        bundle = self.make_bundle()
        self.assertEqual((bundle['slug'], bundle['separate_price'], bundle['savings'], bundle['savings_percent']),
                         ('web-and-python', '800.00', '200.00', 25))
        self.assertEqual(self.client.patch(f'{API}/manage/bundles/{bundle["id"]}/', {'price': '650'}, format='json').data['price'], '650.00')
        self.as_(self.student)
        self.assertEqual(self.client.get(f'{API}/manage/bundles/').status_code, 403)
        self.assertEqual([b['slug'] for b in self.client.get(f'{API}/bundles/?course=python').data], ['web-and-python'])

    def test_buying_a_bundle_shares_its_price(self):
        self.make_bundle()
        self.as_(self.student)
        order = self.client.post(f'{API}/bundles/web-and-python/buy/', {}, format='json').data
        self.assertEqual(order['total'], '600.00')
        amounts = sorted(i['amount'] for i in order['items'])
        self.assertEqual(amounts, ['225.00', '375.00'])  # 600 split 500:300
        self.assertEqual(order['bundle']['slug'], 'web-and-python')
        self.assertEqual(self.client.post(f'{API}/bundles/web-and-python/buy/', {}, format='json').status_code, 201)  # replaces the unpaid one
        self.assertEqual(Order.objects.filter(student=self.student, status=Order.PENDING).count(), 1)
        self.pay(Order.objects.get(student=self.student, status=Order.PENDING).id)
        self.assertEqual(TrainingEnrollment.objects.filter(student=self.student, status=TrainingEnrollment.ACTIVE).count(), 2)
        # the instructor's share follows the course's part of the bundle price
        self.assertEqual(OrderItem.objects.get(course=self.course, order__status=Order.SUCCESSFUL).instructor_share, Decimal('262.50'))

    def test_owned_courses_come_off_the_price(self):
        self.make_bundle()
        TrainingEnrollment.objects.create(student=self.student, course=self.course, status=TrainingEnrollment.ACTIVE)
        self.as_(self.student)
        page = self.client.get(f'{API}/bundles/web-and-python/').data
        self.assertEqual((page['owned'], page['your_price']), (['web'], '225.00'))
        order = self.client.post(f'{API}/bundles/web-and-python/buy/', {}, format='json').data
        self.assertEqual(([i['course_slug'] for i in order['items']], order['total']), (['python'], '225.00'))
        TrainingEnrollment.objects.create(student=self.student, course=self.second, status=TrainingEnrollment.ACTIVE)
        self.assertEqual(self.client.post(f'{API}/bundles/web-and-python/buy/', {}, format='json').status_code, 400)

    def test_no_coupons_on_bundles(self):
        from .orders import quote
        bundle = Bundle.objects.get(pk=self.make_bundle()['id'])
        self.assertIn('Coupons', quote(self.student, [self.course], 'ANY', bundle)['coupon_error'])


class GiftTests(GiftingCase):
    def test_gift_a_course(self):
        self.as_(self.student)
        bad = self.client.post(f'{API}/gifts/', {'course': 'web', 'name': 'Bob', 'email': 'not-an-email'}, format='json')
        self.assertEqual(bad.status_code, 400)
        order = self.client.post(f'{API}/gifts/', {'course': 'web', 'name': 'Bob Smith', 'email': 'bob@example.com',
                                                   'message': 'Happy birthday!'}, format='json').data
        self.assertEqual((order['gift']['recipient_name'], order['gift']['code']), ('Bob Smith', None))  # no code until paid
        code = Gift.objects.get().code
        self.as_(self.other)
        self.assertEqual(self.client.post(f'{API}/gifts/{code}/redeem/').status_code, 400)  # not paid yet
        self.as_(self.student)
        mail.outbox.clear()
        self.pay(order['id'])
        # the buyer is not enrolled; the recipient is emailed (and told in-app: bob@example.com is self.other)
        self.assertFalse(TrainingEnrollment.objects.filter(student=self.student, course=self.course).exists())
        self.assertEqual([m.to for m in mail.outbox if 'sent you a course' in m.subject], [['bob@example.com']])
        self.assertIn(code, mail.outbox[-1].body)
        self.assertTrue(Notification.objects.filter(user=self.other, title__contains='sent you a course').exists())
        self.as_(self.student)
        self.assertEqual(self.client.get(f'{API}/orders/{order["id"]}/').data['gift']['code'], code)

        self.as_(self.other)
        page = self.client.get(f'{API}/gifts/{code.lower()}/').data
        self.assertEqual((page['from'], page['message'], page['ready']), ('Amina Kamara', 'Happy birthday!', True))
        done = self.client.post(f'{API}/gifts/{code}/redeem/').data
        self.assertTrue(done['redeemed_by_you'])
        self.assertTrue(TrainingEnrollment.objects.filter(student=self.other, course=self.course, status=TrainingEnrollment.ACTIVE).exists())
        self.assertEqual(self.client.post(f'{API}/gifts/{code}/redeem/').data['detail'], 'You already opened this gift.')
        self.assertTrue(Notification.objects.filter(user=self.student, title__contains='opened your gift').exists())

    def test_refunding_a_gift_takes_the_courses_back(self):
        self.as_(self.student)
        order = self.client.post(f'{API}/gifts/', {'course': 'web', 'name': 'Bob', 'email': 'someone@example.com'}, format='json').data
        self.pay(order['id'])
        code = Gift.objects.get().code
        self.as_(self.other)
        self.client.post(f'{API}/gifts/{code}/redeem/')
        self.as_(self.admin)
        self.assertEqual(self.client.post(f'{API}/manage/orders/{order["id"]}/refund/', {'reason': 'Changed mind'}, format='json').status_code, 200)
        self.assertEqual(TrainingEnrollment.objects.get(student=self.other, course=self.course).status, TrainingEnrollment.CANCELLED)
        self.as_(self.other)
        self.assertTrue(self.client.get(f'{API}/gifts/{code}/').data['revoked'])

    def test_gift_a_bundle_even_if_you_own_it(self):
        self.make_bundle()
        TrainingEnrollment.objects.create(student=self.student, course=self.course, status=TrainingEnrollment.ACTIVE)
        self.as_(self.student)
        order = self.client.post(f'{API}/bundles/web-and-python/buy/', {'gift': {'name': 'Bob', 'email': 'b@example.com'}}, format='json').data
        self.assertEqual((order['total'], len(order['items'])), ('600.00', 2))  # the whole bundle for them

    def test_free_courses_are_not_gifts(self):
        from catalog.models import Course
        Course.objects.create(slug='free', title='Free one', summary='x', is_published=True, price=0)
        self.as_(self.student)
        resp = self.client.post(f'{API}/gifts/', {'course': 'free', 'name': 'Bob', 'email': 'b@example.com'}, format='json')
        self.assertIn('Free courses', str(resp.data))
