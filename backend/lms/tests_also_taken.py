"""'Students also took': courses shared by this course's students."""
from decimal import Decimal

from django.core.cache import cache

from accounts.models import User
from catalog.models import Course
from portal.models import TrainingEnrollment

from .tests import API, LmsCase


class AlsoTakenTests(LmsCase):
    def test_ranked_by_shared_students(self):
        cache.clear()
        python = Course.objects.create(slug='python', title='Python', summary='x', is_published=True, price=Decimal('100'))
        design = Course.objects.create(slug='design', title='Design', summary='x', is_published=True)
        hidden = Course.objects.create(slug='hidden', title='Hidden', summary='x', is_published=False)
        third = User.objects.create_user(email='c@example.com', password='x', role=User.STUDENT)
        for user in (self.student, self.other, third):
            TrainingEnrollment.objects.create(student=user, course=self.course, status=TrainingEnrollment.ACTIVE)
        for user in (self.student, self.other):
            TrainingEnrollment.objects.create(student=user, course=python, status=TrainingEnrollment.COMPLETED)
        TrainingEnrollment.objects.create(student=third, course=design, status=TrainingEnrollment.ACTIVE)
        TrainingEnrollment.objects.create(student=third, course=hidden, status=TrainingEnrollment.ACTIVE)
        TrainingEnrollment.objects.create(student=self.student, course=design, status=TrainingEnrollment.CANCELLED)  # doesn't count
        rows = self.client.get(f'{API}/courses/web/also-taken/').data
        self.assertEqual([(r['slug'], r['shared_students']) for r in rows], [('python', 2), ('design', 1)])
