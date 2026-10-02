"""The Premium plan (alongside buying) and paying for a course in instalments."""
from datetime import timedelta
from decimal import Decimal

from django.utils import timezone

from catalog.models import Course
from portal.models import TrainingEnrollment

from .models import InstalmentPlan, LmsSettings, Notification, Order, OrderItem, Plan, PremiumEnrollment, Subscription
from .premium import remind_instalments
from .tests import API
from .tests_marketplace import MarketCase


class PayMixin:
    def pay(self, order_id, user=None):
        self.as_(user or self.student)
        self.client.post(f'{API}/orders/{order_id}/payment/', {'method': 'afrimoney', 'transaction_id': f'TX{order_id}',
                                                               'receipt': self.receipt()}, format='multipart')
        self.as_(self.admin)
        return self.client.post(f'{API}/manage/orders/{order_id}/decision/', {'action': 'confirm'}, format='json').data


class PremiumTests(PayMixin, MarketCase):
    def setUp(self):
        super().setUp()
        Course.objects.filter(pk=self.course.pk).update(is_premium=True)
        self.monthly = Plan.objects.create(name='Premium monthly', interval=Plan.MONTH, price=Decimal('150'))

    def subscribe(self):
        self.as_(self.student)
        order = self.client.post(f'{API}/premium/plans/{self.monthly.id}/subscribe/').data
        self.assertEqual((order['total'], order['plan']['name'], order['items']), ('150.00', 'Premium monthly', []))
        self.pay(order['id'])
        return order

    def test_subscribe_and_start_premium_courses(self):
        self.as_(self.student)
        self.assertEqual(self.client.post(f'{API}/courses/web/premium-enrol/').data['code'], 'no_premium')
        self.subscribe()
        self.as_(self.student)
        info = self.client.get(f'{API}/premium/').data
        self.assertIsNotNone(info['active_until'])
        self.assertEqual(self.client.get(f'{API}/courses/web/').data['premium']['included'], True)
        self.assertTrue(self.client.post(f'{API}/courses/web/premium-enrol/').data['enrolled'])
        self.assertTrue(self.client.get(f'{API}/courses/web/').data['enrolled'])
        self.assertEqual(self.client.post(f'{API}/courses/python/premium-enrol/').status_code, 400)  # not a Premium course
        # no instructor earnings from subscriptions
        self.assertFalse(OrderItem.objects.filter(order__plan__isnull=False).exists())

    def test_access_ends_with_premium_unless_bought(self):
        self.subscribe()
        self.as_(self.student)
        self.client.post(f'{API}/courses/web/premium-enrol/')
        Subscription.objects.update(ends_at=timezone.now() - timedelta(minutes=1))
        data = self.client.get(f'{API}/courses/web/').data
        self.assertEqual((data['enrolled'], data['blocked']['reason']), (False, 'premium_ended'))
        self.assertEqual(self.client.get(f'{API}/lessons/{self.reading.id}/').status_code, 403)
        # buying it outright keeps it for good
        order = self.client.post(f'{API}/courses/web/buy/', {}, format='json').data
        self.pay(order['id'])
        self.assertFalse(PremiumEnrollment.objects.exists())
        self.as_(self.student)
        self.assertTrue(self.client.get(f'{API}/courses/web/').data['enrolled'])

    def test_renewing_extends_and_refund_ends(self):
        first = self.subscribe()
        self.subscribe()
        periods = list(Subscription.objects.order_by('starts_at'))
        self.assertEqual(periods[1].starts_at, periods[0].ends_at)  # the second month follows the first
        self.as_(self.admin)
        self.client.post(f'{API}/manage/orders/{first["id"]}/refund/', {'reason': 'x'}, format='json')
        self.assertLessEqual(Subscription.objects.get(order_id=first['id']).ends_at, timezone.now())

    def test_admin_plans(self):
        self.as_(self.admin)
        plan = self.client.post(f'{API}/manage/plans/', {'name': 'Yearly', 'interval': 'year', 'price': '1200'}, format='json').data
        self.assertEqual(plan['days'], 365)
        self.assertEqual(self.client.post(f'{API}/manage/plans/', {'name': '', 'price': 0}, format='json').status_code, 400)
        self.subscribe()
        self.as_(self.admin)
        data = self.client.get(f'{API}/manage/plans/').data
        self.assertEqual((data['active_subscribers'], data['premium_courses']), (1, 1))
        # a plan someone paid for is retired, not deleted
        self.assertFalse(self.client.delete(f'{API}/manage/plans/{self.monthly.id}/').data['is_active'])
        self.assertEqual(self.client.delete(f'{API}/manage/plans/{plan["id"]}/').status_code, 204)


class InstalmentTests(PayMixin, MarketCase):
    def start(self, parts=2):
        self.as_(self.student)
        resp = self.client.post(f'{API}/courses/web/instalments/', {'parts': parts}, format='json')
        self.assertEqual(resp.status_code, 201, resp.data)
        return resp.data

    def test_offer(self):
        self.as_(self.student)
        offer = self.client.get(f'{API}/courses/web/').data['instalments']
        self.assertEqual([(o['parts'], o['first'], o['each']) for o in offer['options']], [(2, '250.00', '250.00'), (3, '166.66', '166.67')])
        self.assertEqual(len(self.client.get(f'{API}/courses/python/').data['instalments']['options']), 2)  # 300 is the minimum
        LmsSettings.objects.filter(pk=1).update(instalment_min_price=Decimal('600'))
        self.assertIsNone(self.client.get(f'{API}/courses/web/').data['instalments'])
        self.assertEqual(self.client.post(f'{API}/courses/web/instalments/', {'parts': 2}, format='json').status_code, 400)

    def test_pay_in_parts(self):
        first = self.start(2)
        self.assertEqual((first['total'], first['instalment']['number'], first['can_cancel']), ('250.00', 1, True))
        self.pay(first['id'])
        self.assertTrue(TrainingEnrollment.objects.filter(student=self.student, course=self.course, status=TrainingEnrollment.ACTIVE).exists())
        plan = InstalmentPlan.objects.get()
        second = plan.orders.get(instalment_number=2)
        self.assertEqual((second.total, second.status, plan.paid_parts), (Decimal('250.00'), Order.PENDING, 1))
        self.assertAlmostEqual((second.due_at - timezone.now()).days, 29, delta=1)
        # the instructor earns their share of each part
        self.assertEqual(OrderItem.objects.get(order=second).instructor_share, Decimal('175.00'))
        self.as_(self.student)
        self.assertEqual(self.client.post(f'{API}/orders/{second.id}/cancel/').status_code, 400)  # later parts can't be cancelled
        schedule = self.client.get(f'{API}/me/instalments/').data[0]
        self.assertEqual(([s['status'] for s in schedule['schedule']], schedule['locked']), (['successful', 'pending'], False))

        # overdue beyond the grace period: lessons lock; paying opens them again
        Order.objects.filter(pk=second.pk).update(due_at=timezone.now() - timedelta(days=8))
        data = self.client.get(f'{API}/courses/web/').data
        self.assertEqual((data['enrolled'], data['blocked']['reason'], data['blocked']['order_id']), (False, 'instalment_overdue', second.id))
        self.pay(second.id)
        plan.refresh_from_db()
        self.assertEqual((plan.status, plan.paid_parts), (InstalmentPlan.COMPLETED, 2))
        self.as_(self.student)
        self.assertTrue(self.client.get(f'{API}/courses/web/').data['enrolled'])

    def test_refund_cancels_plan_and_place(self):
        first = self.start(3)
        self.pay(first['id'])
        self.as_(self.admin)
        self.client.post(f'{API}/manage/orders/{first["id"]}/refund/', {'reason': 'x'}, format='json')
        plan = InstalmentPlan.objects.get()
        self.assertEqual(plan.status, InstalmentPlan.CANCELLED)
        self.assertEqual(plan.orders.get(instalment_number=2).status, Order.CANCELLED)
        self.assertEqual(TrainingEnrollment.objects.get(student=self.student, course=self.course).status, TrainingEnrollment.CANCELLED)

    def test_reminder_once(self):
        first = self.start(2)
        self.pay(first['id'])
        Order.objects.filter(instalment_number=2).update(due_at=timezone.now() + timedelta(days=2))
        self.assertEqual((remind_instalments(), remind_instalments()), (1, 0))
        self.assertTrue(Notification.objects.filter(user=self.student, title__startswith='Reminder: part 2').exists())

    def test_cancelling_first_part_cancels_plan(self):
        first = self.start(2)
        self.as_(self.student)
        self.client.post(f'{API}/orders/{first["id"]}/cancel/')
        self.assertEqual(InstalmentPlan.objects.get().status, InstalmentPlan.CANCELLED)
        self.assertEqual(self.client.post(f'{API}/courses/web/instalments/', {'parts': 2}, format='json').status_code, 201)  # can start again
