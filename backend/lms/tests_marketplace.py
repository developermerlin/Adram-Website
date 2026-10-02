"""The marketplace: instructors, course review, cart and orders, coupons, earnings, moderation and the audit trail."""
from datetime import timedelta
from decimal import Decimal

from django.core import mail
from django.core.files.uploadedfile import SimpleUploadedFile
from django.utils import timezone

from accounts.models import User
from catalog.models import Category, Course
from portal.models import PaymentSettings, TrainingEnrollment

from .models import (
    AuditLog, CartItem, Certificate, Coupon, LmsSettings, Notification, Order, OrderItem, Payout, Profile, Report, Review, Section,
    Wishlist,
)
from .models import Lesson
from .tests import API, LmsCase


class MarketCase(LmsCase):
    @classmethod
    def setUpTestData(cls):
        super().setUpTestData()
        cls.teacher = User.objects.create_user(email='teach@example.com', password='Str0ng!Pass', role=User.INSTRUCTOR, is_verified=True,
                                               first_name='Tia', last_name='Teacher')
        cls.rival = User.objects.create_user(email='rival@example.com', password='Str0ng!Pass', role=User.INSTRUCTOR, is_verified=True,
                                             first_name='Rob', last_name='Rival')
        cls.tech = Category.objects.create(name='Technology', slug='technology')
        cls.webcat = Category.objects.create(name='Web', slug='web-dev', parent=cls.tech)
        cls.design = Category.objects.create(name='Design', slug='design')

    def setUp(self):
        super().setUp()
        Course.objects.filter(pk=self.course.pk).update(price=Decimal('500'), instructor=self.teacher, category=self.tech, subcategory=self.webcat)
        self.course.refresh_from_db()
        self.second = Course.objects.create(slug='python', title='Python Basics', summary='Snakes.', is_published=True, price=Decimal('300'),
                                            topics=['python'], category=self.tech, level='beginner')
        s = Section.objects.create(course=self.second, title='One')
        Lesson.objects.create(section=s, title='Hello', kind=Lesson.TEXT, is_published=True, body='Hi')
        PaymentSettings.objects.all().delete()
        PaymentSettings.objects.create(afrimoney_number='030 111 222', afrimoney_name='ADRAM', terms='x')
        LmsSettings.objects.update_or_create(pk=1, defaults={'commission_percent': Decimal('30')})

    def receipt(self):
        return SimpleUploadedFile('receipt.pdf', b'%PDF-1.4 receipt')


# ---------------------------------------------------------------- access control

class AccessControlTests(MarketCase):
    def test_students_cannot_reach_instructor_or_admin_tools(self):
        self.as_(self.student)
        for url in ('/instructor/dashboard/', '/instructor/courses/', '/instructor/earnings/', '/admin/dashboard/', '/admin/audit/',
                    '/manage/orders/', '/manage/settings/', '/manage/courses/web/curriculum/'):
            self.assertEqual(self.client.get(f'{API}{url}').status_code, 403, url)

    def test_instructors_cannot_reach_admin_tools_or_other_courses(self):
        self.as_(self.rival)
        for url in ('/admin/dashboard/', '/manage/orders/', '/manage/settings/', '/admin/categories/'):
            self.assertEqual(self.client.get(f'{API}{url}').status_code, 403, url)
        self.assertEqual(self.client.get(f'{API}/manage/courses/web/curriculum/').status_code, 404)
        self.assertEqual(self.client.patch(f'{API}/manage/lessons/{self.reading.id}/', {'title': 'Hacked'}, format='json').status_code, 404)
        self.assertEqual(self.client.patch(f'{API}/instructor/courses/web/', {'title': 'Hacked'}, format='json').status_code, 404)
        self.assertEqual(self.client.post(f'{API}/manage/courses/web/announcements/', {'title': 'x', 'body': 'y'}, format='json').status_code, 403)
        self.assertEqual(Lesson.objects.get(pk=self.reading.id).title, 'Notes')

    def test_the_owner_can_build_their_course(self):
        self.as_(self.teacher)
        self.assertEqual(self.client.get(f'{API}/manage/courses/web/curriculum/').status_code, 200)
        self.assertEqual(self.client.patch(f'{API}/manage/lessons/{self.reading.id}/', {'title': 'Reading'}, format='json').status_code, 200)

    def test_only_super_admins_hand_out_the_admin_role(self):
        self.as_(self.admin)
        resp = self.client.post(f'/api/v1/auth/users/{self.student.id}/action/', {'action': 'set_role', 'role': 'ADMIN'}, format='json')
        self.assertEqual(resp.status_code, 400)
        resp = self.client.post(f'/api/v1/auth/users/{self.student.id}/action/', {'action': 'set_role', 'role': 'INSTRUCTOR'}, format='json')
        self.assertEqual(resp.status_code, 200)
        self.assertTrue(AuditLog.objects.filter(action='user_role_changed').exists())


# ---------------------------------------------------------------- instructor workflow

class InstructorWorkflowTests(MarketCase):
    def test_create_edit_submit_review_and_publish(self):
        self.as_(self.teacher)
        created = self.client.post(f'{API}/instructor/courses/', {'title': 'Data Science'}, format='json')
        self.assertEqual((created.status_code, created.data['status'], created.data['is_published']), (201, 'draft', False))
        slug = created.data['slug']
        course = Course.objects.get(slug=slug)
        self.assertEqual(course.instructor, self.teacher)

        bad = self.client.patch(f'{API}/instructor/courses/{slug}/', {'category': self.tech.id, 'subcategory': self.design.id}, format='json')
        self.assertEqual(bad.status_code, 400)  # not a subcategory of that category
        bad = self.client.patch(f'{API}/instructor/courses/{slug}/', {'price': '100', 'discount_price': '150'}, format='json')
        self.assertIn('discount_price', bad.data)
        # Instructors can't publish themselves by editing fields
        self.client.patch(f'{API}/instructor/courses/{slug}/', {'is_published': True}, format='json')
        self.assertFalse(Course.objects.get(slug=slug).is_published)

        missing = self.client.post(f'{API}/instructor/courses/{slug}/submit/')
        self.assertEqual(missing.status_code, 400)
        self.assertTrue(missing.data['problems'])

        ok = self.client.patch(f'{API}/instructor/courses/{slug}/', {
            'summary': 'Everything about data science today.', 'description': 'x' * 120, 'learn_points': ['Pandas', 'Plots'],
            'category': self.tech.id, 'subcategory': self.webcat.id, 'thumbnail': '/media/site/x.png', 'price': '200', 'discount_price': '150',
            'faqs': [{'question': 'For beginners?', 'answer': 'Yes.'}]}, format='json')
        self.assertEqual(ok.status_code, 200, ok.data)
        section = self.client.post(f'{API}/manage/courses/{slug}/sections/', {'title': 'Start'}, format='json').data
        lesson = self.client.post(f'{API}/manage/sections/{section["id"]}/lessons/', {'title': 'Read me', 'kind': 'text'}, format='json').data
        self.client.patch(f'{API}/manage/lessons/{lesson["id"]}/', {'body': 'Text', 'is_published': True}, format='json')
        self.assertEqual(self.client.post(f'{API}/instructor/courses/{slug}/submit/').data['status'], 'submitted')
        self.assertTrue(Notification.objects.filter(user=self.admin, kind='course_review').exists())
        self.assertEqual(self.client.post(f'{API}/instructor/courses/{slug}/publish/').status_code, 400)  # not approved yet

        self.as_(self.admin)
        self.assertEqual(self.client.post(f'{API}/admin/courses/{slug}/review/', {'action': 'request_changes'}, format='json').status_code, 400)
        self.assertEqual(self.client.post(f'{API}/admin/courses/{slug}/review/', {'action': 'start'}, format='json').data['status'], 'in_review')
        self.assertEqual(self.client.post(f'{API}/admin/courses/{slug}/review/', {'action': 'approve', 'note': 'Great'}, format='json').data['status'], 'approved')
        self.assertTrue(Notification.objects.filter(user=self.teacher, kind='course_approved').exists())
        self.assertTrue(AuditLog.objects.filter(action='course_approved', target_label='Data Science').exists())

        self.as_(self.teacher)
        live = self.client.post(f'{API}/instructor/courses/{slug}/publish/').data
        self.assertEqual((live['status'], live['is_published']), ('published', True))
        public = self.client.get(f'{API}/courses/{slug}/').data['course']
        self.assertEqual((public['sale_price'], public['faqs'][0]['answer'], public['instructor']['name']), ('150.00', 'Yes.', 'Tia Teacher'))

    def test_drafts_are_private_and_deletable(self):
        self.as_(self.teacher)
        slug = self.client.post(f'{API}/instructor/courses/', {'title': 'Secret'}, format='json').data['slug']
        self.as_(self.student)
        self.assertEqual(self.client.get(f'{API}/courses/{slug}/').status_code, 404)
        self.as_(self.teacher)
        self.assertEqual(self.client.get(f'{API}/courses/{slug}/').status_code, 200)  # preview
        self.assertEqual(self.client.delete(f'{API}/instructor/courses/{slug}/').status_code, 204)
        self.assertEqual(self.client.delete(f'{API}/instructor/courses/web/').status_code, 400)  # live course

    def test_dashboard_analytics_and_qa(self):
        self.enroll()
        Review.objects.create(course=self.course, student=self.student, rating=4, comment='Good')
        self.as_(self.teacher)
        data = self.client.get(f'{API}/instructor/dashboard/').data
        self.assertEqual((data['totals']['courses'], data['totals']['students'], data['totals']['reviews']), (1, 1, 1))
        stats = self.client.get(f'{API}/instructor/analytics/?days=7').data
        self.assertEqual((len(stats['enrollments']), stats['totals']['students']), (7, 1))
        self.as_(self.student)
        self.client.post(f'{API}/courses/web/qa/', {'title': 'Help'}, format='json')
        self.assertTrue(Notification.objects.filter(user=self.teacher, kind='question').exists())
        self.as_(self.teacher)
        tid = self.client.get(f'{API}/instructor/questions/?filter=unanswered').data['threads'][0]['id']
        reply = self.client.post(f'{API}/qa/{tid}/replies/', {'body': 'Here'}, format='json').data
        self.assertTrue(reply['is_staff'])
        self.assertEqual(self.client.post(f'{API}/qa/replies/{reply["id"]}/mark/', {'answer': True}, format='json').data['is_instructor_answer'], True)
        self.assertEqual(self.client.get(f'{API}/instructor/questions/?filter=unanswered').data['unanswered'], 0)
        self.as_(self.student)
        self.assertEqual(self.client.post(f'{API}/qa/replies/{reply["id"]}/like/').data['likes'], 1)
        self.assertEqual(self.client.post(f'{API}/qa/replies/{reply["id"]}/mark/', {}, format='json').status_code, 403)


# ---------------------------------------------------------------- cart, orders and payments

class CartOrderTests(MarketCase):
    def test_cart_checkout_pay_confirm_and_refund(self):
        self.as_(self.student)
        Wishlist.objects.create(student=self.student, course=self.course)
        self.client.post(f'{API}/cart/', {'slug': 'web'}, format='json')
        cart = self.client.post(f'{API}/cart/', {'slug': 'python'}, format='json').data
        self.assertEqual((cart['count'], cart['subtotal'], cart['total']), (2, '800.00', '800.00'))
        self.assertFalse(Wishlist.objects.exists())  # moved to the cart
        self.client.post(f'{API}/cart/', {'slug': 'python'}, format='json')
        self.assertEqual(CartItem.objects.count(), 2)  # no duplicates

        order = self.client.post(f'{API}/cart/checkout/', {}, format='json').data
        self.assertEqual((order['status'], order['total'], len(order['items']), order['can_pay']), ('pending', '800.00', 2, True))
        self.assertEqual(order['how_to_pay']['methods'][0]['number'], '030 111 222')
        self.assertEqual(CartItem.objects.count(), 0)
        self.assertEqual(self.client.get(f'{API}/lessons/{self.reading.id}/').status_code, 403)

        paid = self.client.post(f'{API}/orders/{order["id"]}/payment/', {'method': 'afrimoney', 'transaction_id': 'TX1', 'receipt': self.receipt()}, format='multipart')
        self.assertEqual(paid.data['status'], 'processing')
        self.assertEqual(self.client.post(f'{API}/cart/', {'slug': 'web'}, format='json').status_code, 400)  # already being checked

        self.as_(self.admin)
        listing = self.client.get(f'{API}/manage/orders/?status=processing').data
        self.assertEqual(listing['counts']['processing'], 1)
        with self.captureOnCommitCallbacks(execute=True):
            done = self.client.post(f'{API}/manage/orders/{order["id"]}/decision/', {'action': 'confirm'}, format='json').data
        self.assertEqual(done['status'], 'successful')
        self.assertTrue(any('Payment confirmed' in m.subject for m in mail.outbox))
        item = OrderItem.objects.get(course=self.course)
        self.assertEqual((item.commission_percent, item.instructor_share), (Decimal('30.00'), Decimal('350.00')))
        self.assertEqual(OrderItem.objects.get(course=self.second).instructor_share, Decimal('0'))  # ADRAM's own course
        self.assertEqual(TrainingEnrollment.objects.filter(student=self.student, status='active').count(), 2)

        self.as_(self.student)
        self.assertEqual(self.client.get(f'{API}/lessons/{self.reading.id}/').status_code, 200)
        self.assertEqual(self.client.post(f'{API}/cart/', {'slug': 'web'}, format='json').status_code, 400)  # already owned
        history = self.client.get(f'{API}/me/orders/').data
        self.assertEqual((len(history), history[0]['status']), (1, 'successful'))

        self.as_(self.teacher)
        earnings = self.client.get(f'{API}/instructor/earnings/').data['summary']
        self.assertEqual((earnings['gross'], earnings['commission'], earnings['net'], earnings['pending']), ('500.00', '150.00', '350.00', '350.00'))

        self.as_(self.admin)
        self.client.post(f'{API}/manage/payouts/', {'instructor': self.teacher.id, 'amount': '100'}, format='json')
        refund = self.client.post(f'{API}/manage/orders/{order["id"]}/refund/', {'reason': 'Asked'}, format='json').data
        self.assertEqual(refund['status'], 'refunded')
        self.assertEqual(TrainingEnrollment.objects.filter(student=self.student, status='cancelled').count(), 2)
        self.assertTrue(AuditLog.objects.filter(action='payment_refunded').exists())
        self.as_(self.teacher)
        earnings = self.client.get(f'{API}/instructor/earnings/').data['summary']
        self.assertEqual((earnings['net'], earnings['refunds'], earnings['paid']), ('0.00', '500.00', '100.00'))

    def test_rejected_payment_can_be_sent_again_and_orders_cancelled(self):
        self.as_(self.student)
        order = self.client.post(f'{API}/courses/web/buy/', {}, format='json').data
        self.client.post(f'{API}/orders/{order["id"]}/payment/', {'method': 'afrimoney', 'transaction_id': 'TX1', 'receipt': self.receipt()}, format='multipart')
        self.as_(self.admin)
        self.client.post(f'{API}/manage/orders/{order["id"]}/decision/', {'action': 'reject', 'note': 'No match'}, format='json')
        self.as_(self.student)
        again = self.client.get(f'{API}/orders/{order["id"]}/').data
        self.assertEqual((again['status'], again['decision_note'], again['can_pay']), ('failed', 'No match', True))
        self.assertEqual(self.client.post(f'{API}/orders/{order["id"]}/cancel/').data['status'], 'cancelled')
        self.as_(self.other)
        self.assertEqual(self.client.get(f'{API}/orders/{order["id"]}/').status_code, 404)  # private

    def test_free_courses_cannot_be_bought_and_buy_now_replaces_old_orders(self):
        self.as_(self.student)
        free = Course.objects.create(slug='free', title='Free', summary='x', is_published=True)
        self.assertEqual(self.client.post(f'{API}/cart/', {'slug': free.slug}, format='json').data['code'], 'free_course')
        first = self.client.post(f'{API}/courses/web/buy/', {}, format='json').data
        second = self.client.post(f'{API}/courses/web/buy/', {}, format='json').data
        self.assertEqual(Order.objects.get(pk=first['id']).status, 'cancelled')
        self.assertEqual(Order.objects.get(pk=second['id']).status, 'pending')

    def test_sale_prices_are_used(self):
        Course.objects.filter(pk=self.course.pk).update(discount_price=Decimal('400'))
        self.as_(self.student)
        cart = self.client.post(f'{API}/cart/', {'slug': 'web'}, format='json').data
        self.assertEqual((cart['items'][0]['list_price'], cart['items'][0]['price'], cart['total']), ('500.00', '400.00', '400.00'))

    def test_the_instructor_cannot_buy_their_own_course(self):
        self.as_(self.teacher)
        self.assertEqual(self.client.post(f'{API}/cart/', {'slug': 'web'}, format='json').status_code, 400)


class CouponTests(MarketCase):
    def cart(self, *slugs, code=''):
        self.as_(self.student)
        for slug in slugs:
            self.client.post(f'{API}/cart/', {'slug': slug}, format='json')
        return self.client.get(f'{API}/cart/?coupon={code}').data

    def test_percent_codes_split_across_courses(self):
        Coupon.objects.create(code='HALF', kind='percent', value=Decimal('50'))
        cart = self.cart('web', 'python', code='half')
        self.assertEqual((cart['discount'], cart['total'], cart['items'][0]['discount'], cart['items'][1]['discount']), ('400.00', '400.00', '250.00', '150.00'))

    def test_course_restriction_minimum_and_limits(self):
        coupon = Coupon.objects.create(code='WEBONLY', kind='amount', value=Decimal('100'))
        coupon.courses.add(self.course)
        cart = self.cart('web', 'python', code='WEBONLY')
        self.assertEqual((cart['items'][0]['discount'], cart['items'][1]['discount']), ('100.00', '0.00'))
        Coupon.objects.create(code='BIG', kind='percent', value=Decimal('10'), min_purchase=Decimal('1000'))
        self.assertIn('at least', self.client.get(f'{API}/cart/?coupon=BIG').data['coupon_error'])
        Coupon.objects.create(code='OLD', kind='percent', value=Decimal('10'), ends_at=timezone.now() - timedelta(days=1))
        self.assertIn('expired', self.client.get(f'{API}/cart/?coupon=OLD').data['coupon_error'])
        Coupon.objects.create(code='OFF', kind='percent', value=Decimal('10'), is_active=False)
        self.assertIn('no longer active', self.client.get(f'{API}/cart/?coupon=OFF').data['coupon_error'])
        self.assertIn('not valid', self.client.get(f'{API}/cart/?coupon=NOPE').data['coupon_error'])

    def test_per_user_and_total_limits(self):
        Coupon.objects.create(code='ONCE', kind='percent', value=Decimal('10'), per_user_limit=1, max_uses=5)
        self.as_(self.student)
        order = self.client.post(f'{API}/courses/web/buy/', {'coupon': 'ONCE'}, format='json').data
        self.assertEqual(order['discount'], '50.00')
        self.client.post(f'{API}/orders/{order["id"]}/payment/', {'method': 'afrimoney', 'transaction_id': 'T', 'receipt': self.receipt()}, format='multipart')
        again = self.client.post(f'{API}/courses/python/buy/', {'coupon': 'ONCE'}, format='json')
        self.assertIn('already used', again.data['coupon'])

    def test_a_full_discount_enrols_straight_away(self):
        Coupon.objects.create(code='FREE', kind='percent', value=Decimal('100'))
        self.as_(self.student)
        order = self.client.post(f'{API}/courses/web/buy/', {'coupon': 'FREE'}, format='json').data
        self.assertEqual((order['status'], order['total'], order['provider']), ('successful', '0.00', 'free'))
        self.assertEqual(self.client.get(f'{API}/lessons/{self.reading.id}/').status_code, 200)

    def test_admins_manage_coupons_with_course_lists(self):
        self.as_(self.admin)
        resp = self.client.post(f'{API}/manage/coupons/', {'code': 'new-1', 'kind': 'percent', 'value': '20', 'courses': ['web'],
                                                           'per_user_limit': 2, 'min_purchase': '100'}, format='json')
        self.assertEqual((resp.status_code, resp.data['code'], resp.data['course_titles']), (201, 'NEW-1', ['Web Development']))
        self.assertEqual(self.client.post(f'{API}/manage/coupons/', {'code': 'X', 'kind': 'percent', 'value': '120'}, format='json').status_code, 400)


# ---------------------------------------------------------------- learning

class QuizTypeTests(MarketCase):
    def setUp(self):
        super().setUp()
        self.enroll()
        self.as_(self.student)
        from .models import Choice, Question
        self.lesson = Lesson.objects.create(section=self.section, title='Mixed', kind=Lesson.QUIZ, is_published=True, pass_mark=100,
                                            sort_order=5, max_attempts=2)
        self.multi = Question.objects.create(lesson=self.lesson, kind='multiple', text='Primes?')
        self.m1 = Choice.objects.create(question=self.multi, text='2', is_correct=True)
        self.m2 = Choice.objects.create(question=self.multi, text='3', is_correct=True)
        self.m3 = Choice.objects.create(question=self.multi, text='4')
        self.tf = Question.objects.create(lesson=self.lesson, kind='true_false', text='Water is wet')
        self.t_true = Choice.objects.create(question=self.tf, text='True', is_correct=True)
        Choice.objects.create(question=self.tf, text='False')
        self.short = Question.objects.create(lesson=self.lesson, kind='short', text='Capital of Sierra Leone?', accepted_answers=['Freetown'])

    def submit(self, answers):
        return self.client.post(f'{API}/lessons/{self.lesson.id}/quiz/', {'answers': answers}, format='json')

    def test_every_type_is_marked_and_attempts_are_limited(self):
        wrong = self.submit({str(self.multi.id): [self.m1.id], str(self.tf.id): self.t_true.id, str(self.short.id): 'bo'}).data
        self.assertEqual((wrong['passed'], wrong['points'], wrong['max_points']), (False, 1, 3))
        right = self.submit({str(self.multi.id): [self.m2.id, self.m1.id], str(self.tf.id): self.t_true.id, str(self.short.id): '  freetown. '}).data
        self.assertEqual((right['passed'], right['record']['attempts'], right['record']['best_score'], right['record']['attempts_left']), (True, 2, 100, 0))
        self.assertEqual(self.submit({}).data['code'], 'no_attempts')

    def test_timed_random_quizzes_are_started_first(self):
        Lesson.objects.filter(pk=self.lesson.pk).update(time_limit_minutes=1, questions_per_attempt=2, max_attempts=0)
        self.assertEqual(self.submit({}).data['code'], 'not_started')
        attempt = self.client.post(f'{API}/lessons/{self.lesson.id}/quiz/start/').data
        self.assertEqual(len(attempt['questions']), 2)
        self.assertIsNotNone(attempt['deadline'])
        self.assertEqual(self.client.post(f'{API}/lessons/{self.lesson.id}/quiz/start/').data['id'], attempt['id'])  # resumes
        from .models import QuizAttempt
        QuizAttempt.objects.filter(pk=attempt['id']).update(created_at=timezone.now() - timedelta(minutes=10))
        late = self.client.post(f'{API}/lessons/{self.lesson.id}/quiz/', {'attempt': attempt['id'], 'answers': {}}, format='json').data
        self.assertTrue(late['late'])

    def test_builder_validates_question_types(self):
        self.as_(self.teacher)
        url = f'{API}/manage/lessons/{self.lesson.id}/quiz/'
        bad = self.client.put(url, {'questions': [{'kind': 'short', 'text': 'x', 'accepted_answers': []}]}, format='json')
        self.assertEqual(bad.status_code, 400)
        ok = self.client.put(url, {'time_limit_minutes': 5, 'shuffle_choices': True, 'questions': [
            {'kind': 'true_false', 'text': 'Sky is blue', 'answer': True},
            {'kind': 'multiple', 'text': 'Even?', 'choices': [{'text': '2', 'is_correct': True}, {'text': '4', 'is_correct': True}, {'text': '5'}]},
            {'kind': 'short', 'text': 'Say hi', 'accepted_answers': ['hi', 'hello'], 'points': 2}]}, format='json').data
        self.assertEqual([q['kind'] for q in ok['questions']], ['true_false', 'multiple', 'short'])
        self.assertEqual((ok['time_limit_minutes'], ok['shuffle_choices'], ok['questions'][0]['choices'][0]['is_correct']), (5, True, True))


class AssignmentAndProgressTests(MarketCase):
    def setUp(self):
        super().setUp()
        self.enrollment = self.enroll()
        self.task = Lesson.objects.create(section=self.section, title='Build a page', kind=Lesson.ASSIGNMENT, is_published=True,
                                          body='Make it.', sort_order=6, allow_resubmit=True)

    def test_hand_in_grade_and_complete(self):
        self.as_(self.student)
        self.assertEqual(self.client.post(f'{API}/lessons/{self.task.id}/progress/', {'completed': True}, format='json').status_code, 400)
        self.assertEqual(self.client.post(f'{API}/lessons/{self.task.id}/submissions/', {}, format='multipart').status_code, 400)
        bad = self.client.post(f'{API}/lessons/{self.task.id}/submissions/', {'file': SimpleUploadedFile('x.exe', b'MZ')}, format='multipart')
        self.assertEqual(bad.status_code, 400)
        sub = self.client.post(f'{API}/lessons/{self.task.id}/submissions/', {'text': 'My work', 'file': SimpleUploadedFile('work.zip', b'PK')}, format='multipart').data
        self.assertEqual(sub['status'], 'submitted')
        self.assertTrue(Notification.objects.filter(user=self.teacher, kind='assignment_submitted').exists())

        self.as_(self.teacher)
        queue = self.client.get(f'{API}/manage/courses/web/submissions/?status=submitted').data
        self.assertEqual(queue['counts']['submitted'], 1)
        self.assertEqual(self.client.post(f'{API}/manage/submissions/{sub["id"]}/grade/', {'status': 'approved', 'grade': 500}, format='json').status_code, 400)
        self.client.post(f'{API}/manage/submissions/{sub["id"]}/grade/', {'status': 'rejected', 'feedback': 'More'}, format='json')

        self.as_(self.student)
        lesson = self.client.get(f'{API}/lessons/{self.task.id}/').data['assignment']
        self.assertEqual((lesson['latest']['status'], lesson['latest']['feedback'], lesson['can_submit']), ('rejected', 'More', True))
        again = self.client.post(f'{API}/lessons/{self.task.id}/submissions/', {'text': 'Better'}, format='multipart').data
        self.as_(self.teacher)
        self.client.post(f'{API}/manage/submissions/{again["id"]}/grade/', {'status': 'approved', 'grade': 90, 'feedback': 'Great'}, format='json')
        self.assertTrue(Notification.objects.filter(user=self.student, kind='assignment_graded').exists())
        self.as_(self.student)
        self.assertEqual(self.client.post(f'{API}/lessons/{self.task.id}/submissions/', {'text': 'x'}, format='multipart').status_code, 400)
        self.assertTrue(self.client.get(f'{API}/lessons/{self.task.id}/').data['completed'])

    def test_completion_needs_only_required_lessons_and_issues_a_certificate(self):
        Lesson.objects.filter(pk=self.task.pk).update(is_required=False)
        self.as_(self.student)
        for lesson in (self.intro, self.reading):
            self.client.post(f'{API}/lessons/{lesson.id}/progress/', {'completed': True}, format='json')
        result = self.client.post(f'{API}/lessons/{self.quiz.id}/quiz/', {'answers': {str(self.q1.id): self.q1_ok.id, str(self.q2.id): self.q2_ok.id}}, format='json').data
        self.assertTrue(result['certificate_code'])
        self.assertTrue(Notification.objects.filter(user=self.student, kind='certificate').exists())
        cert = self.client.get(f'{API}/certificates/{result["certificate_code"]}/').data
        self.assertEqual((cert['instructor_name'], cert['revoked']), ('Tia Teacher', False))
        self.assertEqual(len(self.client.get(f'{API}/me/certificates/').data), 1)

        self.as_(self.admin)
        self.client.post(f'{API}/admin/certificates/{result["certificate_code"]}/', {'action': 'revoke', 'reason': 'Cheating'}, format='json')
        self.assertTrue(self.client.get(f'{API}/certificates/{result["certificate_code"]}/').data['revoked'])
        self.as_(self.student)
        self.assertEqual(len(self.client.get(f'{API}/me/certificates/').data), 0)

    def test_heartbeats_track_time_watching_and_resume(self):
        self.as_(self.student)
        self.client.post(f'{API}/lessons/{self.intro.id}/progress/', {'position': 30, 'spent': 30}, format='json')
        data = self.client.post(f'{API}/lessons/{self.intro.id}/progress/', {'position': 60, 'spent': 9999}, format='json').data
        self.assertEqual((data['completed'], data['watch_percent']), (False, 50))
        data = self.client.post(f'{API}/lessons/{self.intro.id}/progress/', {'position': 110}, format='json').data
        self.assertTrue(data['completed'])  # watched over 90%
        self.assertEqual(data['progress']['sections'][0]['completed'], 1)
        self.client.get(f'{API}/lessons/{self.reading.id}/')
        mine = self.client.get(f'{API}/me/').data[0]
        self.assertEqual((mine['last_lesson']['title'], mine['time_spent_seconds']), ('Notes', 330))

    def test_notes(self):
        self.as_(self.student)
        note = self.client.post(f'{API}/lessons/{self.intro.id}/notes/', {'body': 'TCP three-way handshake', 'position': 755}, format='json').data
        self.assertEqual(note['position_seconds'], 755)
        self.client.post(f'{API}/lessons/{self.reading.id}/notes/', {'body': 'Other thing'}, format='json')
        self.assertEqual(len(self.client.get(f'{API}/courses/web/notes/?q=handshake').data), 1)
        self.client.patch(f'{API}/notes/{note["id"]}/', {'body': 'Edited'}, format='json')
        self.assertEqual(self.client.get(f'{API}/lessons/{self.intro.id}/notes/').data[0]['body'], 'Edited')
        self.as_(self.other)
        self.assertEqual(self.client.delete(f'{API}/notes/{note["id"]}/').status_code, 404)
        self.assertEqual(self.client.post(f'{API}/lessons/{self.reading.id}/notes/', {'body': 'x'}, format='json').status_code, 403)


# ---------------------------------------------------------------- notifications, moderation, discovery

class NotificationTests(MarketCase):
    def test_announcements_reach_the_notification_centre(self):
        self.enroll()
        self.as_(self.teacher)
        self.client.post(f'{API}/manage/courses/web/announcements/', {'title': 'New lesson', 'body': 'Watch it'}, format='json')
        self.as_(self.student)
        data = self.client.get(f'{API}/me/notifications/').data
        self.assertEqual((data['unread'], data['notifications'][0]['kind']), (1, 'announcement'))
        self.assertEqual(self.client.post(f'{API}/me/notifications/read/', {'all': True}, format='json').data['unread'], 0)

    def test_publishing_a_lesson_tells_students(self):
        self.enroll()
        self.as_(self.teacher)
        self.client.patch(f'{API}/manage/lessons/{self.draft.id}/', {'is_published': True}, format='json')
        self.assertTrue(Notification.objects.filter(user=self.student, kind='new_lecture').exists())


class ModerationTests(MarketCase):
    def test_reported_reviews_are_hidden_and_stop_counting(self):
        self.enroll()
        review = Review.objects.create(course=self.course, student=self.student, rating=1, comment='spam spam')
        self.as_(self.other)
        self.assertEqual(self.client.post(f'{API}/reports/', {'target_type': 'review', 'target_id': review.id, 'reason': 'spam'}, format='json').status_code, 201)
        self.as_(self.admin)
        report = self.client.get(f'{API}/admin/reports/').data['reports'][0]
        self.assertEqual(report['reason'], 'spam')
        self.client.post(f'{API}/admin/reports/{report["id"]}/', {'action': 'resolve', 'remove': True}, format='json')
        self.assertTrue(Review.objects.get(pk=review.pk).is_hidden)
        self.assertEqual(self.client.get(f'{API}/courses/web/reviews/').data['summary']['count'], 0)
        self.assertEqual(self.client.get(f'{API}/courses/web/').data['course']['stats']['rating_count'], 0)
        self.assertTrue(AuditLog.objects.filter(action='report_resolved').exists())
        self.assertEqual(Report.objects.get().status, 'resolved')

    def test_admins_moderate_reviews_directly(self):
        review = Review.objects.create(course=self.course, student=self.student, rating=5)
        self.as_(self.admin)
        self.assertTrue(self.client.post(f'{API}/admin/reviews/{review.id}/', {'action': 'hide'}, format='json').data['is_hidden'])
        self.assertEqual(self.client.post(f'{API}/admin/reviews/{review.id}/', {'action': 'delete'}, format='json').status_code, 204)


class DiscoveryTests(MarketCase):
    def test_search_filters_and_sorting(self):
        self.client.force_authenticate(None)
        self.assertEqual(self.client.get(f'{API}/catalog/?q=tia').data['count'], 1)  # instructor name
        self.assertEqual(self.client.get(f'{API}/catalog/?q=python').data['results'][0]['slug'], 'python')
        self.assertEqual(self.client.get(f'{API}/catalog/?category=technology').data['count'], 2)
        self.assertEqual(self.client.get(f'{API}/catalog/?subcategory=web-dev').data['count'], 1)
        self.assertEqual(self.client.get(f'{API}/catalog/?level=beginner').data['count'], 1)
        prices = [c['sale_price'] for c in self.client.get(f'{API}/catalog/?category=technology&sort=price_low').data['results']]
        self.assertEqual(prices, ['300.00', '500.00'])
        prices = [c['sale_price'] for c in self.client.get(f'{API}/catalog/?category=technology&sort=price_high').data['results']]
        self.assertEqual(prices, ['500.00', '300.00'])
        Course.objects.filter(pk=self.second.pk).update(discount_price=Decimal('200'))
        self.assertEqual(self.client.get(f'{API}/catalog/?price=discounted').data['count'], 1)
        facets = self.client.get(f'{API}/catalog/facets/').data
        tech = next(c for c in facets['categories'] if c['slug'] == 'technology')
        self.assertEqual((tech['count'], tech['children'][0]['count']), (2, 1))
        self.assertEqual(self.client.get(f'{API}/catalog/?instructor={self.teacher.id}').data['count'], 1)

    def test_views_recommendations_and_dashboard(self):
        self.as_(self.student)
        self.client.post(f'{API}/courses/python/view/')
        self.client.post(f'{API}/courses/python/view/')
        from .models import CourseViewDay
        self.assertEqual(CourseViewDay.objects.get(course=self.second).views, 2)
        self.enroll()
        home = self.client.get(f'{API}/catalog/home/').data
        self.assertNotIn('web', [c['slug'] for c in home['recommended']])  # owned
        self.assertIn('python', [c['slug'] for c in home['recommended']])
        dash = self.client.get(f'{API}/me/dashboard/').data
        self.assertEqual((dash['stats']['enrolled'], dash['recently_viewed'][0]['slug']), (1, 'python'))
        profile = self.client.put(f'{API}/me/profile/', {'headline': 'Learner', 'interests': ['design']}, format='json').data
        self.assertEqual(profile['profile']['interests'], ['design'])

    def test_instructor_profile_and_categories(self):
        data = self.client.get(f'{API}/instructors/{self.teacher.id}/').data
        self.assertEqual((data['name'], data['totals']['courses']), ('Tia Teacher', 1))
        self.assertEqual(self.client.get(f'{API}/instructors/{self.student.id}/').status_code, 404)
        tree = self.client.get(f'{API}/categories/').data
        self.assertEqual([c['name'] for c in tree], ['Design', 'Technology'])


class AdminToolsTests(MarketCase):
    def test_dashboard_categories_users_and_audit(self):
        self.as_(self.admin)
        data = self.client.get(f'{API}/admin/dashboard/?days=7').data
        self.assertEqual((data['totals']['instructors'], len(data['user_growth'])), (2, 7))
        cat = self.client.post(f'{API}/admin/categories/', {'name': 'Business'}, format='json').data
        sub = self.client.post(f'{API}/admin/categories/', {'name': 'Finance', 'parent': cat['id']}, format='json').data
        self.assertEqual(sub['parent'], cat['id'])
        self.assertEqual(self.client.post(f'{API}/admin/categories/', {'name': 'X', 'parent': sub['id']}, format='json').status_code, 400)
        made = self.client.post(f'{API}/admin/users/', {'email': 'new@x.com', 'first_name': 'N', 'last_name': 'U', 'role': 'INSTRUCTOR', 'password': 'Str0ng!Pass9'}, format='json')
        self.assertEqual(made.status_code, 201)
        self.assertEqual(self.client.post(f'{API}/admin/users/', {'email': 'a@x.com', 'first_name': 'N', 'last_name': 'U', 'role': 'ADMIN', 'password': 'Str0ng!Pass9'}, format='json').status_code, 400)
        self.client.post(f'{API}/admin/users/{self.other.id}/enroll/', {'slug': 'web'}, format='json')
        learning = self.client.get(f'{API}/admin/users/{self.other.id}/learning/').data
        self.assertEqual(learning['enrollments'][0]['status'], 'active')
        audit = self.client.get(f'{API}/admin/audit/').data
        self.assertTrue({'user_created', 'enrollment_granted', 'category_created'} <= set(audit['actions']))

    def test_commission_setting(self):
        self.as_(self.admin)
        self.assertEqual(self.client.put(f'{API}/manage/settings/', {'commission_percent': '150'}, format='json').status_code, 400)
        self.assertEqual(self.client.put(f'{API}/manage/settings/', {'commission_percent': '20'}, format='json').data['commission_percent'], '20.00')
        self.assertTrue(AuditLog.objects.filter(action='commission_changed').exists())


class CourseCardTests(MarketCase):
    def test_card_badges_and_library(self):
        self.as_(self.admin)
        resp = self.client.patch(f'/api/v1/catalog/manage/courses/{self.course.id}/', {'is_premium': True, 'highlight': 'bestseller', 'format_label': 'Bootcamp'}, format='json')
        self.assertEqual((resp.status_code, resp.data['highlight']), (200, 'bestseller'))
        card = next(c for c in self.client.get(f'{API}/catalog/?q=web').data['results'] if c['slug'] == 'web')
        self.assertEqual((card['is_premium'], card['highlight'], card['format_label']), (True, 'bestseller', 'Bootcamp'))
        self.as_(self.student)
        self.enroll()
        self.client.post(f'{API}/cart/', {'slug': 'python'}, format='json')
        lib = self.client.get(f'{API}/me/library/').data
        self.assertEqual((lib['owned'], lib['cart']), (['web'], ['python']))
        # instructors can't give their own course badges
        self.as_(self.teacher)
        self.client.patch(f'{API}/instructor/courses/web/', {'is_premium': False, 'highlight': ''}, format='json')
        self.course.refresh_from_db()
        self.assertTrue(self.course.is_premium)

    def test_course_page_player_does_not_move_progress(self):
        from .models import Progress
        self.as_(self.student)
        self.enroll()
        resp = self.client.get(f'{API}/lessons/{self.intro.id}/?peek=1')
        self.assertEqual(resp.status_code, 200)
        self.assertFalse(Progress.objects.filter(lesson=self.intro).exists())
        self.client.get(f'{API}/lessons/{self.intro.id}/')
        self.assertTrue(Progress.objects.filter(lesson=self.intro, last_viewed_at__isnull=False).exists())

    def test_course_page_extras(self):
        self.as_(self.admin)
        url = f'/api/v1/catalog/manage/courses/{self.course.id}/'
        page = {'caption_languages': ['French [Auto]', ''], 'includes': ['Access on mobile and TV'], 'premium_note': 'Part of ADRAM Premium.',
                'feature': {'title': 'Coding exercises', 'text': 'Practise as you go.', 'link_url': '/courses'}}
        self.assertEqual(self.client.patch(url, page, format='json').status_code, 200)
        course = self.client.get(f'{API}/courses/web/').data['course']
        self.assertEqual((course['caption_languages'], course['includes'], course['premium_note']), (['French [Auto]'], ['Access on mobile and TV'], 'Part of ADRAM Premium.'))
        self.assertEqual((course['feature']['title'], course['feature']['link_label']), ('Coding exercises', 'Learn more'))
        # unsafe links and pictures are refused; a box without a title is removed
        self.assertEqual(self.client.patch(url, {'feature': {'title': 'x', 'link_url': 'javascript:alert(1)'}}, format='json').status_code, 400)
        self.assertEqual(self.client.patch(url, {'feature': {'title': 'x', 'image': 'javascript:x'}}, format='json').status_code, 400)
        self.client.patch(url, {'feature': {'title': ''}}, format='json')
        self.course.refresh_from_db()
        self.assertEqual(self.course.feature, {})
        # instructors may fill in the page but not the Premium text
        self.as_(self.teacher)
        self.client.patch(f'{API}/instructor/courses/web/', {'premium_note': 'mine', 'includes': ['Closed captions']}, format='json')
        self.course.refresh_from_db()
        self.assertEqual((self.course.premium_note, self.course.includes), ('Part of ADRAM Premium.', ['Closed captions']))


class GapFillTests(MarketCase):
    def test_admin_edits_users_and_sends_notices(self):
        self.as_(self.admin)
        resp = self.client.patch(f'{API}/admin/users/{self.student.id}/', {'first_name': 'Aminata', 'country': 'Sierra Leone'}, format='json')
        self.assertEqual((resp.status_code, resp.data['first_name']), (200, 'Aminata'))
        self.assertEqual(self.client.patch(f'{API}/admin/users/{self.student.id}/', {'email': 'bob@example.com'}, format='json').status_code, 400)
        self.assertTrue(AuditLog.objects.filter(action='user_edited').exists())
        sent = self.client.post(f'{API}/admin/notify/', {'audience': 'students', 'title': 'Maintenance on Sunday'}, format='json')
        self.assertEqual(sent.status_code, 201)
        self.assertTrue(Notification.objects.filter(user=self.student, kind='system').exists())
        self.assertFalse(Notification.objects.filter(user=self.teacher, kind='system').exists())
        self.client.post(f'{API}/manage/coupons/', {'code': 'HELLO', 'kind': 'percent', 'value': '10', 'notify_students': True}, format='json')
        self.assertTrue(Notification.objects.filter(user=self.student, kind='coupon').exists())
        self.as_(self.student)
        self.assertEqual(self.client.post(f'{API}/admin/notify/', {'title': 'x'}, format='json').status_code, 403)

    def test_resources_can_be_reordered(self):
        from .models import Resource
        a = Resource.objects.create(lesson=self.reading, title='A', file='x/a.pdf', sort_order=0)
        b = Resource.objects.create(lesson=self.reading, title='B', file='x/b.pdf', sort_order=1)
        self.as_(self.teacher)
        data = self.client.post(f'{API}/manage/lessons/{self.reading.id}/resources/order/', {'ids': [b.id, a.id]}, format='json').data
        self.assertEqual([r['title'] for r in data['resources']], ['B', 'A'])
        self.as_(self.rival)
        self.assertEqual(self.client.post(f'{API}/manage/lessons/{self.reading.id}/resources/order/', {'ids': [a.id, b.id]}, format='json').status_code, 404)


class CardAndMobileMoneyTests(MarketCase):
    """Paying without a gateway: Orange Money, Afrimoney or card (a card-payment link), proof checked by ADRAM."""

    def setUp(self):
        super().setUp()
        PaymentSettings.objects.update(orange_money_number='076 000 111', orange_money_name='ADRAM',
                                       orange_money_steps='Dial the Orange Money menu\nChoose Send money',
                                       card_link='https://pay.example.com/adram', card_label='Visa / Mastercard',
                                       card_steps='Open the card payment page\nEnter the amount and your order number')

    def order(self):
        self.as_(self.student)
        self.client.post(f'{API}/cart/', {'slug': 'python'}, format='json')
        return self.client.post(f'{API}/cart/checkout/', {}, format='json').data

    def test_every_method_is_offered_with_its_steps(self):
        methods = self.order()['how_to_pay']['methods']
        self.assertEqual([m['id'] for m in methods], ['orange_money', 'afrimoney', 'card'])
        card = methods[2]
        self.assertEqual((card['kind'], card['link'], card['cards'], len(card['steps'])), ('card', 'https://pay.example.com/adram', 'Visa / Mastercard', 2))
        self.assertEqual(methods[0]['steps'], ['Dial the Orange Money menu', 'Choose Send money'])

    def test_card_payment_with_proof_and_a_duplicate_warning(self):
        first = self.order()
        sent = self.client.post(f'{API}/orders/{first["id"]}/payment/', {'method': 'card', 'transaction_id': 'AUTH-77', 'payer': 'Amina Kamara',
                                                                          'receipt': self.receipt()}, format='multipart')
        self.assertEqual((sent.data['status'], sent.data['method_label'], sent.data['payer']), ('processing', 'Card', 'Amina Kamara'))
        # someone sends the same transaction ID for another order: the admin is warned
        self.as_(self.other)
        self.client.post(f'{API}/cart/', {'slug': 'python'}, format='json')
        second = self.client.post(f'{API}/cart/checkout/', {}, format='json').data
        self.client.post(f'{API}/orders/{second["id"]}/payment/', {'method': 'orange_money', 'transaction_id': 'auth-77', 'receipt': self.receipt()}, format='multipart')
        self.as_(self.admin)
        seen = self.client.get(f'{API}/orders/{second["id"]}/').data
        self.assertEqual([o['number'] for o in seen['same_transaction']], [first['number']])

    def test_methods_adram_does_not_offer_are_refused(self):
        PaymentSettings.objects.update(card_link='', card_steps='')
        order = self.order()
        bad = self.client.post(f'{API}/orders/{order["id"]}/payment/', {'method': 'card', 'transaction_id': 'X', 'receipt': self.receipt()}, format='multipart')
        self.assertEqual(bad.status_code, 400)
        self.as_(self.admin)
        self.assertEqual(self.client.put('/api/v1/portal/staff/payment-settings/', {'card_link': 'http://not-secure.example'}, format='json').status_code, 400)


class FlashSaleTests(MarketCase):
    """Timed sale prices and flash sales: students pay the best deal running now, and orders keep their price."""

    def setUp(self):
        super().setUp()
        from django.core.cache import cache
        cache.clear()
        self.now = timezone.now()

    def card(self, slug):
        return next(c for c in self.client.get(f'{API}/catalog/?page_size=60').data['results'] if c['slug'] == slug)

    def test_a_timed_sale_price_only_applies_inside_its_window(self):
        Course.objects.filter(pk=self.course.pk).update(discount_price=Decimal('400'), sale_ends_at=self.now - timedelta(hours=1))
        self.assertEqual((self.card('web')['sale_price'], self.card('web')['discount_price']), ('500.00', None))  # ended
        Course.objects.filter(pk=self.course.pk).update(sale_starts_at=self.now + timedelta(days=1), sale_ends_at=None)
        self.assertEqual(self.card('web')['sale_price'], '500.00')  # not started yet
        Course.objects.filter(pk=self.course.pk).update(sale_starts_at=self.now - timedelta(hours=1), sale_ends_at=self.now + timedelta(days=2))
        web = self.card('web')
        self.assertEqual((web['sale_price'], web['discount_price'], web['sale_label']), ('400.00', '400.00', 'Sale'))
        self.assertIsNotNone(web['sale_ends_at'])
        page = self.client.get(f'{API}/courses/web/').data['course']
        self.assertEqual((page['sale_price'], page['sale_label']), ('400.00', 'Sale'))

    def test_a_flash_sale_gives_the_best_deal_and_orders_keep_their_price(self):
        from catalog.models import FlashSale
        Course.objects.filter(pk=self.course.pk).update(discount_price=Decimal('450'))
        sale = FlashSale.objects.create(name='Easter sale', percent_off=20, starts_at=self.now - timedelta(minutes=5), ends_at=self.now + timedelta(days=1))
        web, python = self.card('web'), self.card('python')
        self.assertEqual((web['sale_price'], web['sale_label']), ('400.00', 'Easter sale'))  # 20% off beats the 450 sale price
        self.assertEqual(python['sale_price'], '240.00')  # no courses chosen: every paid course
        self.assertIn('python', [c['slug'] for c in self.client.get(f'{API}/catalog/?price=discounted').data['results']])

        self.as_(self.student)
        self.client.post(f'{API}/cart/', {'slug': 'web'}, format='json')
        order = self.client.post(f'{API}/cart/checkout/', {}, format='json').data
        self.assertEqual(order['total'], '400.00')
        sale.ends_at = self.now - timedelta(minutes=1)
        sale.save()
        self.assertEqual(self.card('web')['sale_price'], '450.00')  # back to the course's own sale price
        self.assertEqual(self.client.get(f'{API}/orders/{order["id"]}/').data['total'], '400.00')  # the order keeps its price

    def test_a_flash_sale_on_chosen_courses(self):
        from catalog.models import FlashSale
        sale = FlashSale.objects.create(name='Python week', percent_off=50, starts_at=self.now - timedelta(minutes=5), ends_at=self.now + timedelta(days=1))
        sale.courses.set([self.second])
        from catalog.pricing import forget_flash_sales
        forget_flash_sales()
        self.assertEqual((self.card('python')['sale_price'], self.card('web')['sale_price']), ('150.00', '500.00'))

    def test_admins_manage_flash_sales(self):
        from .models import Notification
        payload = {'name': 'Weekend sale', 'percent_off': 25, 'starts_at': (self.now - timedelta(minutes=1)).isoformat(),
                   'ends_at': (self.now + timedelta(days=2)).isoformat(), 'course_ids': [self.second.id], 'notify_students': True}
        self.as_(self.student)
        self.assertEqual(self.client.post(f'{API}/manage/flash-sales/', payload, format='json').status_code, 403)
        self.as_(self.admin)
        made = self.client.post(f'{API}/manage/flash-sales/', payload, format='json')
        self.assertEqual((made.status_code, made.data['state'], made.data['course_titles']), (201, 'live', ['Python Basics']))
        self.assertEqual(self.card('python')['sale_price'], '225.00')
        self.assertTrue(Notification.objects.filter(user=self.student, title='Weekend sale: 25% off').exists())
        bad = self.client.post(f'{API}/manage/flash-sales/', {**payload, 'percent_off': 95}, format='json')
        self.assertEqual(bad.status_code, 400)
        backwards = self.client.post(f'{API}/manage/flash-sales/', {**payload, 'ends_at': (self.now - timedelta(days=1)).isoformat()}, format='json')
        self.assertEqual(backwards.status_code, 400)
        off = self.client.patch(f'{API}/manage/flash-sales/{made.data["id"]}/', {'is_enabled': False}, format='json')
        self.assertEqual(off.data['state'], 'off')
        self.assertEqual(self.card('python')['sale_price'], '300.00')
        self.assertEqual(self.client.delete(f'{API}/manage/flash-sales/{made.data["id"]}/').status_code, 204)


class WithdrawalTests(MarketCase):
    """Instructors ask to be paid what's available; administrators pay or reject; tax details and a sales report."""

    def sale(self, days_ago, share='350.00'):
        order = Order.objects.create(student=self.student, status=Order.SUCCESSFUL, subtotal=Decimal('500'), total=Decimal('500'),
                                     paid_at=timezone.now() - timedelta(days=days_ago))
        OrderItem.objects.create(order=order, course=self.course, title='Web Development', instructor=self.teacher, price=Decimal('500'),
                                 amount=Decimal('500'), commission_percent=Decimal('30'), instructor_share=Decimal(share))
        return order

    def ask(self, **extra):
        data = {'amount': '200', 'method': 'orange_money', 'account': '076 111 222', 'account_name': 'Tia Teacher', **extra}
        return self.client.post(f'{API}/instructor/withdrawals/', data, format='json')

    def test_balance_holds_recent_sales(self):
        self.sale(20)
        self.sale(2)  # inside the 14-day refund window
        self.as_(self.teacher)
        balance = self.client.get(f'{API}/instructor/withdrawals/').data['balance']
        self.assertEqual((balance['net'], balance['on_hold'], balance['available'], balance['hold_days']), ('700.00', '350.00', '350.00', 14))

    def test_request_then_admin_pays(self):
        self.sale(20)
        self.as_(self.teacher)
        self.assertIn('tax details', self.ask().data['form'])  # legal name first
        self.client.put(f'{API}/instructor/tax-info/', {'legal_name': 'Tia Teacher', 'tax_id': 'TIN-123'}, format='json')
        self.assertIn('up to', self.ask(amount='500').data['amount'])
        self.assertIn('smallest', self.ask(amount='50').data['amount'])
        made = self.ask()
        self.assertEqual((made.status_code, made.data['status']), (201, 'requested'))
        self.assertIn('already', self.ask(amount='100').data['form'])  # one at a time
        balance = self.client.get(f'{API}/instructor/withdrawals/').data['balance']
        self.assertEqual((balance['requested'], balance['available']), ('200.00', '150.00'))
        self.assertTrue(Notification.objects.filter(user=self.admin, title='Withdrawal request').exists())

        self.as_(self.admin)
        queue = self.client.get(f'{API}/manage/withdrawals/').data
        self.assertEqual((queue['waiting'], queue['results'][0]['instructor']['legal_name']), (1, 'Tia Teacher'))
        self.assertEqual(self.client.post(f'{API}/manage/withdrawals/{made.data["id"]}/pay/', {}, format='json').status_code, 400)  # reference needed
        paid = self.client.post(f'{API}/manage/withdrawals/{made.data["id"]}/pay/', {'reference': 'OM-55'}, format='json')
        self.assertEqual((paid.data['status'], paid.data['reference']), ('paid', 'OM-55'))
        self.assertTrue(Payout.objects.filter(instructor=self.teacher, amount=Decimal('200'), reference='OM-55').exists())
        self.assertTrue(Notification.objects.filter(user=self.teacher, title='Your withdrawal was paid').exists())

        self.as_(self.teacher)
        balance = self.client.get(f'{API}/instructor/withdrawals/').data['balance']
        self.assertEqual((balance['paid'], balance['requested'], balance['available']), ('200.00', '0.00', '150.00'))

    def test_reject_and_cancel(self):
        self.sale(20)
        Profile.objects.update_or_create(user=self.teacher, defaults={'legal_name': 'Tia Teacher'})
        self.as_(self.teacher)
        first = self.ask().data
        self.as_(self.rival)
        self.assertEqual(self.client.delete(f'{API}/instructor/withdrawals/{first["id"]}/').status_code, 404)  # not theirs
        self.as_(self.admin)
        self.assertEqual(self.client.post(f'{API}/manage/withdrawals/{first["id"]}/reject/', {}, format='json').status_code, 400)
        rejected = self.client.post(f'{API}/manage/withdrawals/{first["id"]}/reject/', {'reason': 'Account name does not match.'}, format='json')
        self.assertEqual(rejected.data['status'], 'rejected')
        self.as_(self.teacher)
        second = self.ask().data
        self.assertEqual(self.client.delete(f'{API}/instructor/withdrawals/{second["id"]}/').status_code, 204)
        self.assertEqual(self.client.get(f'{API}/instructor/withdrawals/').data['balance']['available'], '350.00')

    def test_sales_report_and_permissions(self):
        self.sale(20)
        self.as_(self.teacher)
        report = self.client.get(f'{API}/instructor/earnings/report/?year={timezone.now().year}')
        text = report.content.decode('utf-8-sig')
        self.assertIn('Web Development', text)
        self.assertIn('350.00', text)
        self.as_(self.student)
        self.assertEqual(self.client.get(f'{API}/instructor/withdrawals/').status_code, 403)
        self.assertEqual(self.client.get(f'{API}/manage/withdrawals/').status_code, 403)
