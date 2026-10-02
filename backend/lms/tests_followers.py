"""Following instructors (and hearing about their new courses) and the sales funnel."""
from decimal import Decimal

from django.utils import timezone

from accounts.models import User
from catalog.models import Course
from portal.models import TrainingEnrollment

from .models import CartItem, Certificate, CourseViewDay, Notification, Order, OrderItem, Progress, Wishlist
from .tests import API, LmsCase


class InstructorCase(LmsCase):
    """The course belongs to an instructor account."""

    @classmethod
    def setUpTestData(cls):
        super().setUpTestData()
        cls.teacher = User.objects.create_user(email='teach@example.com', password='Str0ng!Pass', role=User.INSTRUCTOR, is_verified=True,
                                               first_name='Musa', last_name='Bangura')

    def setUp(self):
        super().setUp()
        Course.objects.filter(pk=self.course.pk).update(instructor=self.teacher)


class FollowerTests(InstructorCase):
    def test_follow_unfollow_and_profile(self):
        self.as_(self.student)
        resp = self.client.post(f'{API}/instructors/{self.teacher.id}/follow/')
        self.assertEqual((resp.status_code, resp.data['followers'], resp.data['following']), (201, 1, True))
        self.assertEqual(self.client.post(f'{API}/instructors/{self.teacher.id}/follow/').status_code, 200)  # again: no change
        profile = self.client.get(f'{API}/instructors/{self.teacher.id}/').data
        self.assertEqual((profile['followers'], profile['following']), (1, True))
        self.assertEqual([r['name'] for r in self.client.get(f'{API}/me/following/').data], ['Musa Bangura'])
        self.assertTrue(Notification.objects.filter(user=self.teacher, title__contains='following you').exists())
        self.assertEqual(self.client.delete(f'{API}/instructors/{self.teacher.id}/follow/').data['followers'], 0)
        # not yourself, and not someone who isn't an instructor
        self.as_(self.teacher)
        self.assertEqual(self.client.post(f'{API}/instructors/{self.teacher.id}/follow/').status_code, 400)
        self.assertEqual(self.client.post(f'{API}/instructors/{self.other.id}/follow/').status_code, 404)

    def test_followers_hear_about_new_courses_once(self):
        self.as_(self.student)
        self.client.post(f'{API}/instructors/{self.teacher.id}/follow/')
        with self.captureOnCommitCallbacks(execute=True):
            course = Course.objects.create(slug='new-one', title='Brand New', summary='x', instructor=self.teacher, is_published=False)
        self.assertFalse(Notification.objects.filter(kind='new_course').exists())  # a draft: nobody told
        with self.captureOnCommitCallbacks(execute=True):
            course.is_published = True
            course.save()
        with self.captureOnCommitCallbacks(execute=True):  # unpublished and published again: not told twice
            course.is_published = False
            course.save()
            course.is_published = True
            course.save()
        told = Notification.objects.filter(kind='new_course')
        self.assertEqual([(n.user_id, n.link) for n in told], [(self.student.id, '/courses/new-one')])

    def test_instructor_sees_followers(self):
        for user in (self.student, self.other):
            self.as_(user)
            self.client.post(f'{API}/instructors/{self.teacher.id}/follow/')
        self.as_(self.teacher)
        data = self.client.get(f'{API}/instructor/followers/?days=7').data
        self.assertEqual((data['total'], data['new'], data['series'][-1]['value'], len(data['latest'])), (2, 2, 2, 2))


class FunnelTests(InstructorCase):
    def test_funnel_steps(self):
        Course.objects.filter(pk=self.course.pk).update(price=Decimal('500'))
        self.course.refresh_from_db()
        CourseViewDay.objects.create(course=self.course, date=timezone.localdate(), views=10)
        Wishlist.objects.create(student=self.student, course=self.course)
        CartItem.objects.create(student=self.student, course=self.course)
        CartItem.objects.create(student=self.other, course=self.course)
        order = Order.objects.create(student=self.student, subtotal=500, total=500, status=Order.SUCCESSFUL, paid_at=timezone.now())
        OrderItem.objects.create(order=order, course=self.course, title='Web', price=500, amount=500, instructor_share=350)
        enrollment = TrainingEnrollment.objects.create(student=self.student, course=self.course, status=TrainingEnrollment.ACTIVE)
        Progress.objects.create(enrollment=enrollment, lesson=self.intro, last_viewed_at=timezone.now())
        Certificate.objects.create(enrollment=enrollment)

        self.as_(self.teacher)
        data = self.client.get(f'{API}/instructor/funnel/?days=30').data
        steps = {s['key']: s for s in data['steps']}
        self.assertEqual([s['key'] for s in data['steps']], ['views', 'cart', 'checkouts', 'paid', 'enrolled', 'started', 'finished'])
        self.assertEqual({k: s['value'] for k, s in steps.items()},
                         {'views': 10, 'cart': 2, 'checkouts': 1, 'paid': 1, 'enrolled': 1, 'started': 1, 'finished': 1})
        self.assertEqual((data['wishlist'], data['courses'][0]['wishlist']), (1, 1))  # beside the funnel
        self.assertEqual((steps['cart']['of_first'], steps['checkouts']['of_previous']), (20.0, 50.0))
        self.assertEqual(data['courses'][0]['conversion'], 10.0)
        # someone else's courses aren't in it
        self.as_(self.admin)
        self.assertEqual(self.client.get(f'{API}/instructor/funnel/').status_code, 200)

    def test_free_course_skips_buying_steps(self):
        self.as_(self.teacher)
        keys = [s['key'] for s in self.client.get(f'{API}/instructor/funnel/').data['steps']]
        self.assertEqual(keys, ['views', 'enrolled', 'started', 'finished'])


class IntroVideoTests(InstructorCase):
    def test_intro_video_on_profile(self):
        self.as_(self.teacher)
        bad = self.client.put(f'{API}/me/profile/', {'intro_video_url': 'https://example.com/video.mp4'}, format='json')
        self.assertEqual(bad.status_code, 400)
        self.client.put(f'{API}/me/profile/', {'intro_video_url': 'https://youtu.be/dQw4w9WgXcQ'}, format='json')
        self.assertEqual(self.client.get(f'{API}/instructors/{self.teacher.id}/').data['intro_video'],
                         'https://www.youtube-nocookie.com/embed/dQw4w9WgXcQ')
