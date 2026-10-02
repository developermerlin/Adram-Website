"""Admin insights: active users, cohorts, course quality, fraud flags and the revenue forecast."""
from datetime import timedelta
from decimal import Decimal

from django.core.cache import cache
from django.utils import timezone

from accounts.models import ActivityLog, User
from portal.models import TrainingEnrollment

from .insights import mark_active
from .models import ActiveDay, LearningDay, Order, OrderItem, Referral, Review
from .tests import API
from .tests_marketplace import MarketCase

URL = f'{API}/admin/insights/'


class InsightsTests(MarketCase):
    def setUp(self):
        super().setUp()
        cache.clear()

    def test_active_days_are_recorded_once(self):
        mark_active(self.student)
        mark_active(self.student)
        self.assertEqual(ActiveDay.objects.filter(user=self.student).count(), 1)

    def test_signed_in_requests_count_as_active(self):
        from rest_framework_simplejwt.tokens import RefreshToken
        token = RefreshToken.for_user(self.student)
        token['sid'] = ''
        self.client.credentials(HTTP_AUTHORIZATION=f'Bearer {token.access_token}')
        self.client.get(f'{API}/me/analytics/')
        self.assertTrue(ActiveDay.objects.filter(user=self.student, date=timezone.localdate()).exists())

    def test_activity_and_cohorts(self):
        today = timezone.localdate()
        ActiveDay.objects.create(user=self.student, date=today)
        LearningDay.objects.create(user=self.other, date=max(today.replace(day=1), today - timedelta(days=3)), seconds=600)
        self.as_(self.admin)
        data = self.client.get(f'{URL}?days=7').data
        a = data['activity']
        self.assertEqual((a['dau'], a['wau'], a['mau'], len(a['series'])), (1, 2, 2, 7))
        cohort = data['cohorts'][-1]
        self.assertEqual((cohort['size'], cohort['retention'][0]), (2, 100))  # both joined this month, both active
        self.as_(self.student)
        self.assertEqual(self.client.get(URL).status_code, 403)

    def test_quality_score_flags_problems(self):
        for user in (self.student, self.other):
            TrainingEnrollment.objects.create(student=user, course=self.course, status=TrainingEnrollment.ACTIVE)
        extra = [User.objects.create_user(email=f'r{i}@example.com', password='x', role=User.STUDENT) for i in range(3)]
        for i, user in enumerate([self.student, self.other, *extra]):
            Review.objects.create(course=self.course, student=user, rating=2 if i < 4 else 3)
        self.as_(self.admin)
        row = next(r for r in self.client.get(URL).data['quality'] if r['slug'] == 'web')
        self.assertLess(row['score'], 60)
        self.assertIn('Low rating (2.2★)', row['issues'])

    def test_fraud_flags(self):
        for user in (self.student, self.other):
            Order.objects.create(student=user, total=100, status=Order.PROCESSING, transaction_id='OM-777')
        for _ in range(3):
            Order.objects.create(student=self.student, total=100, status=Order.FAILED)
        ActivityLog.objects.create(user=self.other, action=ActivityLog.REGISTRATION, ip_address='10.0.0.5')
        ActivityLog.objects.create(user=self.student, action=ActivityLog.LOGIN, ip_address='10.0.0.5')
        Referral.objects.create(referrer=self.student, referred=self.other)
        for i in range(5):
            ActivityLog.objects.create(user=self.other, action=ActivityLog.LOGIN, ip_address=f'10.1.0.{i}')
        self.as_(self.admin)
        kinds = {f['kind']: f for f in self.client.get(URL).data['fraud']}
        self.assertEqual(kinds['reused_reference']['severity'], 'high')  # two different people, one reference
        self.assertIn('failed_payments', kinds)
        self.assertIn('self_referral', kinds)
        self.assertIn('shared_account', kinds)

    def test_forecast(self):
        now = timezone.now()
        for i in range(1, 29):
            order = Order.objects.create(student=self.student, total=Decimal('100'), status=Order.SUCCESSFUL, paid_at=now - timedelta(days=i))
            OrderItem.objects.create(order=order, course=self.course, title='x', price=100, amount=100)
        self.as_(self.admin)
        f = self.client.get(URL).data['forecast']
        self.assertEqual((f['daily_average'], f['next_30']), (100.0, 3000.0))
        self.assertEqual(f['next_30_range'], [3000.0, 3000.0])  # perfectly steady sales: no spread
        self.assertEqual(len(f['weeks']), 16)
        self.assertTrue(f['weeks'][-1]['forecast'])
