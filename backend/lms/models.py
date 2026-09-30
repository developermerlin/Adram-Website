"""
The course portal ("LMS"): every training programme (catalog.Course) can have a curriculum of sections and lessons.
Lessons are video (an embedded YouTube/Vimeo link or an uploaded file), text, or a quiz. Students who are enrolled
(portal.TrainingEnrollment, status active or completed) work through them and their progress is saved; finishing every
lesson completes the programme and issues a certificate.
"""
import secrets
import uuid
from decimal import Decimal
from pathlib import Path

from django.conf import settings
from django.core.files.storage import FileSystemStorage
from django.db import models

from catalog.models import Course
from portal.models import TrainingEnrollment

# Videos and resources are private: they are only sent through the API, to people allowed to see the lesson.
lms_storage = FileSystemStorage(location=settings.PRIVATE_MEDIA_ROOT)


def video_upload_to(instance, filename):
    return f'lms/videos/{uuid.uuid4().hex}{Path(filename).suffix.lower()}'


def resource_upload_to(instance, filename):
    return f'lms/resources/{uuid.uuid4().hex}{Path(filename).suffix.lower()}'


def document_upload_to(instance, filename):
    return f'lms/documents/{uuid.uuid4().hex}{Path(filename).suffix.lower()}'


def submission_upload_to(instance, filename):
    return f'lms/submissions/{uuid.uuid4().hex}{Path(filename).suffix.lower()}'


class Section(models.Model):
    """A group of lessons ("Week 1: Getting started")."""
    course = models.ForeignKey(Course, on_delete=models.CASCADE, related_name='lms_sections')
    title = models.CharField(max_length=200)
    sort_order = models.PositiveIntegerField(default=0)

    class Meta:
        ordering = ['sort_order', 'id']

    def __str__(self):
        return f'{self.course.title}: {self.title}'


class Lesson(models.Model):
    """
    One item of the curriculum. Kinds: a video, a reading, a document (PDF, slides...) shown or downloaded, a quiz,
    or an assignment students hand work in for. New kinds only need a value here and a way to open/complete them.
    """
    VIDEO, TEXT, DOCUMENT, QUIZ, ASSIGNMENT = 'video', 'text', 'document', 'quiz', 'assignment'
    KINDS = [(VIDEO, 'Video'), (TEXT, 'Reading'), (DOCUMENT, 'Document'), (QUIZ, 'Quiz'), (ASSIGNMENT, 'Assignment')]
    EMBED, UPLOAD, NONE = 'embed', 'upload', ''
    SOURCES = [(NONE, 'No video yet'), (EMBED, 'YouTube or Vimeo link'), (UPLOAD, 'Uploaded file')]

    section = models.ForeignKey(Section, on_delete=models.CASCADE, related_name='lessons')
    title = models.CharField(max_length=200)
    kind = models.CharField(max_length=10, choices=KINDS, default=VIDEO)
    sort_order = models.PositiveIntegerField(default=0)
    summary = models.CharField(max_length=300, blank=True, help_text='One line shown under the title.')
    body = models.TextField(blank=True, help_text='The lesson text or notes. A blank line starts a new paragraph.')
    video_source = models.CharField(max_length=10, choices=SOURCES, blank=True, default=NONE)
    video_url = models.URLField(max_length=500, blank=True, help_text='A YouTube or Vimeo link.')
    video_file = models.FileField(upload_to=video_upload_to, storage=lms_storage, blank=True)
    video_name = models.CharField(max_length=200, blank=True, help_text='Original name of the uploaded file.')
    duration_seconds = models.PositiveIntegerField(default=0)
    is_preview = models.BooleanField(default=False, help_text='Anyone can watch this lesson without enrolling.')
    is_published = models.BooleanField(default=False, help_text='Only published lessons are shown to students.')
    pass_mark = models.PositiveSmallIntegerField(default=70, help_text='Quiz: the percentage needed to pass.')
    is_required = models.BooleanField(default=True, help_text='Needed to complete the course and earn the certificate.')
    # document lessons
    document_file = models.FileField(upload_to=document_upload_to, storage=lms_storage, blank=True)
    document_name = models.CharField(max_length=200, blank=True)
    # quiz settings
    time_limit_minutes = models.PositiveSmallIntegerField(default=0, help_text='0 = no time limit.')
    max_attempts = models.PositiveSmallIntegerField(default=0, help_text='0 = unlimited attempts.')
    questions_per_attempt = models.PositiveSmallIntegerField(default=0, help_text='Ask a random selection of this many questions; 0 = all.')
    shuffle_questions = models.BooleanField(default=False)
    shuffle_choices = models.BooleanField(default=False)
    show_answers = models.BooleanField(default=True, help_text='Show the correct answers after each attempt.')
    # assignment settings
    max_points = models.PositiveSmallIntegerField(default=100, help_text='Assignment: the grade is out of this.')
    allow_resubmit = models.BooleanField(default=True, help_text='Assignment: students may hand in again until it is approved.')
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ['sort_order', 'id']

    def __str__(self):
        return self.title

    @property
    def course(self):
        return self.section.course


class Resource(models.Model):
    """A file students can download from a lesson (slides, a PDF, a starter project)."""
    lesson = models.ForeignKey(Lesson, on_delete=models.CASCADE, related_name='resources')
    title = models.CharField(max_length=200)
    file = models.FileField(upload_to=resource_upload_to, storage=lms_storage)
    filename = models.CharField(max_length=200, blank=True)
    size = models.PositiveBigIntegerField(default=0)
    sort_order = models.PositiveIntegerField(default=0)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ['sort_order', 'id']


class Question(models.Model):
    """A quiz question: one right answer, several right answers, true/false, or a short typed answer."""
    SINGLE, MULTIPLE, TRUE_FALSE, SHORT = 'single', 'multiple', 'true_false', 'short'
    KINDS = [(SINGLE, 'Multiple choice'), (MULTIPLE, 'Multiple answers'), (TRUE_FALSE, 'True / false'), (SHORT, 'Short answer')]

    lesson = models.ForeignKey(Lesson, on_delete=models.CASCADE, related_name='questions')
    kind = models.CharField(max_length=12, choices=KINDS, default=SINGLE)
    text = models.CharField(max_length=500)
    accepted_answers = models.JSONField(default=list, blank=True, help_text='Short answer: the answers marked right (case and spacing ignored).')
    points = models.PositiveSmallIntegerField(default=1)
    explanation = models.CharField(max_length=500, blank=True, help_text='Shown after the student answers.')
    sort_order = models.PositiveIntegerField(default=0)

    class Meta:
        ordering = ['sort_order', 'id']


class Choice(models.Model):
    question = models.ForeignKey(Question, on_delete=models.CASCADE, related_name='choices')
    text = models.CharField(max_length=300)
    is_correct = models.BooleanField(default=False)
    sort_order = models.PositiveIntegerField(default=0)

    class Meta:
        ordering = ['sort_order', 'id']


class Progress(models.Model):
    """One student's place in one lesson: whether it is done, and where they stopped in the video."""
    enrollment = models.ForeignKey(TrainingEnrollment, on_delete=models.CASCADE, related_name='lesson_progress')
    lesson = models.ForeignKey(Lesson, on_delete=models.CASCADE, related_name='progress')
    completed_at = models.DateTimeField(null=True, blank=True)
    position_seconds = models.PositiveIntegerField(default=0)
    watched_seconds = models.PositiveIntegerField(default=0, help_text='The furthest point of the video reached.')
    time_spent_seconds = models.PositiveIntegerField(default=0, help_text='Time spent on this lesson.')
    last_viewed_at = models.DateTimeField(null=True, blank=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        constraints = [models.UniqueConstraint(fields=['enrollment', 'lesson'], name='unique_lesson_progress')]

    @property
    def watch_percent(self):
        seconds = self.lesson.duration_seconds
        return min(100, round(100 * self.watched_seconds / seconds)) if seconds else 0


class QuizAttempt(models.Model):
    """One go at a quiz. It is started (the questions asked, and their order, are kept) and then submitted."""
    IN_PROGRESS, SUBMITTED = 'in_progress', 'submitted'
    enrollment = models.ForeignKey(TrainingEnrollment, on_delete=models.CASCADE, related_name='quiz_attempts')
    lesson = models.ForeignKey(Lesson, on_delete=models.CASCADE, related_name='attempts')
    status = models.CharField(max_length=12, choices=[(IN_PROGRESS, 'In progress'), (SUBMITTED, 'Submitted')], default=SUBMITTED)
    question_ids = models.JSONField(default=list, blank=True, help_text='The questions asked, in the order shown.')
    choice_order = models.JSONField(default=dict, blank=True)
    score_percent = models.PositiveSmallIntegerField(default=0)
    points = models.PositiveIntegerField(default=0)
    max_points = models.PositiveIntegerField(default=0)
    passed = models.BooleanField(default=False)
    answers = models.JSONField(default=dict)
    created_at = models.DateTimeField(auto_now_add=True)
    finished_at = models.DateTimeField(null=True, blank=True)

    class Meta:
        ordering = ['-created_at']


class Review(models.Model):
    """A student's star rating and comment on a programme. One per student; only enrolled students can leave one."""
    course = models.ForeignKey(Course, on_delete=models.CASCADE, related_name='reviews')
    student = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name='course_reviews')
    rating = models.PositiveSmallIntegerField()
    comment = models.TextField(blank=True, max_length=1500)
    is_hidden = models.BooleanField(default=False, help_text='Hidden by a moderator: not shown or counted.')
    moderation_note = models.CharField(max_length=300, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ['-created_at', '-id']
        constraints = [models.UniqueConstraint(fields=['course', 'student'], name='one_review_per_student')]


def receipt_upload_to(instance, filename):
    return f'lms/receipts/{uuid.uuid4().hex}{Path(filename).suffix.lower()}'


class Wishlist(models.Model):
    """A course a student saved to look at later."""
    student = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name='course_wishlist')
    course = models.ForeignKey(Course, on_delete=models.CASCADE, related_name='wishlisted')
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ['-created_at']
        constraints = [models.UniqueConstraint(fields=['student', 'course'], name='one_wishlist_entry')]


class Announcement(models.Model):
    """A message from the instructor to everyone enrolled on a course."""
    course = models.ForeignKey(Course, on_delete=models.CASCADE, related_name='announcements')
    author = models.ForeignKey(settings.AUTH_USER_MODEL, null=True, blank=True, on_delete=models.SET_NULL, related_name='+')
    title = models.CharField(max_length=200)
    body = models.TextField(max_length=5000)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ['-created_at', '-id']


class Thread(models.Model):
    """A question a student asked in a course's Q&A (optionally about one lesson); administrators answer."""
    course = models.ForeignKey(Course, on_delete=models.CASCADE, related_name='threads')
    lesson = models.ForeignKey(Lesson, null=True, blank=True, on_delete=models.SET_NULL, related_name='threads')
    author = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name='course_threads')
    title = models.CharField(max_length=200)
    body = models.TextField(max_length=2000, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ['-updated_at', '-id']


class Reply(models.Model):
    thread = models.ForeignKey(Thread, on_delete=models.CASCADE, related_name='replies')
    author = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name='+')
    body = models.TextField(max_length=2000)
    is_staff = models.BooleanField(default=False, help_text='Written by the instructor or an administrator.')
    is_instructor_answer = models.BooleanField(default=False, help_text='Marked by the instructor as the answer.')
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ['created_at', 'id']


class ReplyLike(models.Model):
    reply = models.ForeignKey(Reply, on_delete=models.CASCADE, related_name='likes')
    user = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name='+')

    class Meta:
        constraints = [models.UniqueConstraint(fields=['reply', 'user'], name='one_like_per_reply')]


class Coupon(models.Model):
    """A discount code students can enter when they enrol on a paid course."""
    PERCENT, AMOUNT = 'percent', 'amount'
    KINDS = [(PERCENT, 'Percent off'), (AMOUNT, 'Fixed amount off (NLe)')]

    code = models.CharField(max_length=40, unique=True)
    description = models.CharField(max_length=200, blank=True, help_text='For your own reference.')
    kind = models.CharField(max_length=10, choices=KINDS, default=PERCENT)
    value = models.DecimalField(max_digits=10, decimal_places=2, help_text='A percentage (1-100), or an amount in NLe.')
    courses = models.ManyToManyField(Course, blank=True, related_name='coupon_set', help_text='Leave empty to work on every course.')
    max_uses = models.PositiveIntegerField(null=True, blank=True, help_text='Leave empty for unlimited uses.')
    per_user_limit = models.PositiveIntegerField(default=1, help_text='How many orders one student may use it on (0 = no limit).')
    min_purchase = models.DecimalField(max_digits=12, decimal_places=2, default=0, help_text='The basket must be worth at least this.')
    starts_at = models.DateTimeField(null=True, blank=True)
    ends_at = models.DateTimeField(null=True, blank=True)
    is_active = models.BooleanField(default=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ['-created_at']

    def save(self, *args, **kwargs):
        self.code = self.code.strip().upper()
        super().save(*args, **kwargs)

    def __str__(self):
        return self.code

    def uses(self, student=None):
        """Orders that used the code (orders waiting to be checked count, so a limited code can't be over-used)."""
        orders = self.orders.filter(status__in=['processing', 'successful'])
        return (orders.filter(student=student) if student else orders).count()

    def eligible(self, courses):
        """The courses (of those given) the code takes money off."""
        allowed = set(self.courses.values_list('id', flat=True))
        return [c for c in courses if not allowed or c.id in allowed]

    def problem(self, courses, student, subtotal, now):
        """Why this code can't be used by this student on these courses right now, or None."""
        if not self.is_active:
            return 'This code is no longer active.'
        if self.starts_at and now < self.starts_at:
            return 'This code is not active yet.'
        if self.ends_at and now > self.ends_at:
            return 'This code has expired.'
        if not self.eligible(courses):
            return 'This code does not work on the courses in your cart.'
        if subtotal < self.min_purchase:
            return f'Spend at least NLe {self.min_purchase:,.2f} to use this code.'
        if self.max_uses is not None and self.uses() >= self.max_uses:
            return 'This code has been used the maximum number of times.'
        if self.per_user_limit and self.uses(student) >= self.per_user_limit:
            return 'You have already used this code.'
        return None

    def discount(self, price):
        """The amount taken off a price (never more than the price)."""
        off = price * self.value / 100 if self.kind == self.PERCENT else self.value
        return max(Decimal('0'), min(price, off)).quantize(Decimal('0.01'))


def new_certificate_code():
    raw = secrets.token_hex(6).upper()
    return f'ADR-{raw[:4]}-{raw[4:8]}-{raw[8:]}'


class Certificate(models.Model):
    """Issued once, when the student finishes every lesson. Anyone can check its code on the website."""
    enrollment = models.OneToOneField(TrainingEnrollment, on_delete=models.CASCADE, related_name='certificate')
    code = models.CharField(max_length=30, unique=True, default=new_certificate_code)
    issued_at = models.DateTimeField(auto_now_add=True)
    revoked_at = models.DateTimeField(null=True, blank=True)
    revoke_reason = models.CharField(max_length=300, blank=True)

    def __str__(self):
        return self.code


# ================================================================ learning

class Note(models.Model):
    """A student's private note on a lesson, optionally pinned to a moment of the video."""
    student = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name='lesson_notes')
    lesson = models.ForeignKey(Lesson, on_delete=models.CASCADE, related_name='notes')
    position_seconds = models.PositiveIntegerField(null=True, blank=True)
    body = models.TextField(max_length=5000)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ['position_seconds', 'created_at']


class Submission(models.Model):
    """Work a student handed in for an assignment lesson. Each hand-in is kept; the latest one counts."""
    SUBMITTED, APPROVED, REJECTED = 'submitted', 'approved', 'rejected'
    STATUSES = [(SUBMITTED, 'Waiting for grading'), (APPROVED, 'Approved'), (REJECTED, 'Needs more work')]

    lesson = models.ForeignKey(Lesson, on_delete=models.CASCADE, related_name='submissions')
    enrollment = models.ForeignKey(TrainingEnrollment, on_delete=models.CASCADE, related_name='submissions')
    text = models.TextField(blank=True, max_length=20000)
    file = models.FileField(upload_to=submission_upload_to, storage=lms_storage, blank=True)
    filename = models.CharField(max_length=200, blank=True)
    status = models.CharField(max_length=10, choices=STATUSES, default=SUBMITTED)
    grade = models.PositiveSmallIntegerField(null=True, blank=True)
    feedback = models.TextField(blank=True, max_length=5000)
    graded_by = models.ForeignKey(settings.AUTH_USER_MODEL, null=True, blank=True, on_delete=models.SET_NULL, related_name='+')
    graded_at = models.DateTimeField(null=True, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ['-created_at', '-id']


# ================================================================ shopping

class CartItem(models.Model):
    student = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name='cart_items')
    course = models.ForeignKey(Course, on_delete=models.CASCADE, related_name='in_carts')
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ['created_at']
        constraints = [models.UniqueConstraint(fields=['student', 'course'], name='one_cart_entry')]


class Order(models.Model):
    """
    A purchase of one or more courses. The payment provider moves it along:
    pending (placed) -> processing (payment sent, being checked) -> successful (courses unlocked) | failed;
    a student can cancel an unpaid order; an administrator can refund a paid one.
    """
    PENDING, PROCESSING, SUCCESSFUL, FAILED, CANCELLED, REFUNDED = 'pending', 'processing', 'successful', 'failed', 'cancelled', 'refunded'
    STATUSES = [(PENDING, 'Waiting for payment'), (PROCESSING, 'Payment being checked'), (SUCCESSFUL, 'Paid'),
                (FAILED, 'Payment failed'), (CANCELLED, 'Cancelled'), (REFUNDED, 'Refunded')]
    OPEN = (PENDING, PROCESSING, FAILED)  # orders that can still be paid

    number = models.CharField(max_length=20, unique=True, null=True, blank=True)
    student = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name='course_orders')
    status = models.CharField(max_length=12, choices=STATUSES, default=PENDING, db_index=True)
    currency = models.CharField(max_length=8, default='NLe')
    subtotal = models.DecimalField(max_digits=12, decimal_places=2, default=0)
    discount = models.DecimalField(max_digits=12, decimal_places=2, default=0)
    total = models.DecimalField(max_digits=12, decimal_places=2, default=0)
    coupon = models.ForeignKey(Coupon, null=True, blank=True, on_delete=models.SET_NULL, related_name='orders')
    provider = models.CharField(max_length=30, default='manual', help_text='The payment provider handling this order.')
    method = models.CharField(max_length=30, blank=True)
    transaction_id = models.CharField(max_length=100, blank=True)
    receipt = models.FileField(upload_to=receipt_upload_to, storage=lms_storage, blank=True)
    receipt_name = models.CharField(max_length=200, blank=True)
    decision_note = models.TextField(blank=True)
    refund_reason = models.TextField(blank=True)
    created_at = models.DateTimeField(auto_now_add=True)
    submitted_at = models.DateTimeField(null=True, blank=True)
    paid_at = models.DateTimeField(null=True, blank=True)
    refunded_at = models.DateTimeField(null=True, blank=True)
    verified_by = models.ForeignKey(settings.AUTH_USER_MODEL, null=True, blank=True, on_delete=models.SET_NULL, related_name='+')

    class Meta:
        ordering = ['-created_at', '-id']

    def save(self, *args, **kwargs):
        super().save(*args, **kwargs)
        if not self.number:
            self.number = f'ORD-{self.pk:05d}'
            type(self).objects.filter(pk=self.pk).update(number=self.number)

    @property
    def reference(self):
        return self.number

    def __str__(self):
        return f'{self.number} ({self.get_status_display()})'


class OrderItem(models.Model):
    """One course in an order, with what was paid for it and the instructor's share (fixed when the order is placed)."""
    order = models.ForeignKey(Order, on_delete=models.CASCADE, related_name='items')
    course = models.ForeignKey(Course, null=True, on_delete=models.SET_NULL, related_name='order_items')
    title = models.CharField(max_length=200)
    instructor = models.ForeignKey(settings.AUTH_USER_MODEL, null=True, blank=True, on_delete=models.SET_NULL, related_name='sold_items')
    price = models.DecimalField(max_digits=12, decimal_places=2)
    discount = models.DecimalField(max_digits=12, decimal_places=2, default=0)
    amount = models.DecimalField(max_digits=12, decimal_places=2)
    commission_percent = models.DecimalField(max_digits=5, decimal_places=2, default=0)
    instructor_share = models.DecimalField(max_digits=12, decimal_places=2, default=0)

    class Meta:
        ordering = ['id']


class Transaction(models.Model):
    """A money movement reported by a payment provider (a payment or a refund), kept for the record."""
    PAYMENT, REFUND = 'payment', 'refund'
    PENDING, SUCCESS, FAILED = 'pending', 'success', 'failed'
    order = models.ForeignKey(Order, on_delete=models.CASCADE, related_name='transactions')
    provider = models.CharField(max_length=30)
    kind = models.CharField(max_length=10, choices=[(PAYMENT, 'Payment'), (REFUND, 'Refund')], default=PAYMENT)
    amount = models.DecimalField(max_digits=12, decimal_places=2)
    status = models.CharField(max_length=10, choices=[(PENDING, 'Pending'), (SUCCESS, 'Successful'), (FAILED, 'Failed')], default=PENDING)
    reference = models.CharField(max_length=120, blank=True)
    data = models.JSONField(default=dict, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ['-created_at', '-id']


class LmsSettings(models.Model):
    """Platform-wide settings for the course marketplace (one row)."""
    commission_percent = models.DecimalField(max_digits=5, decimal_places=2, default=Decimal('30'),
                                             help_text='The platform keeps this share of each sale; instructors earn the rest.')
    certificate_signer_name = models.CharField(max_length=120, blank=True)
    certificate_signer_title = models.CharField(max_length=120, blank=True, default='Director of Training')
    certificate_signature = models.CharField(max_length=300, blank=True, help_text='An uploaded image of the signature.')
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        verbose_name = 'LMS settings'
        verbose_name_plural = 'LMS settings'

    @classmethod
    def load(cls):
        return cls.objects.get_or_create(pk=1)[0]


class Payout(models.Model):
    """Money paid out to an instructor from their earnings."""
    instructor = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name='payouts')
    amount = models.DecimalField(max_digits=12, decimal_places=2)
    method = models.CharField(max_length=60, blank=True)
    reference = models.CharField(max_length=120, blank=True)
    note = models.CharField(max_length=300, blank=True)
    paid_at = models.DateTimeField()
    created_by = models.ForeignKey(settings.AUTH_USER_MODEL, null=True, blank=True, on_delete=models.SET_NULL, related_name='+')
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ['-paid_at', '-id']


# ================================================================ people

class Profile(models.Model):
    """The public side of a learner or instructor: headline, biography, expertise, interests and links."""
    user = models.OneToOneField(settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name='lms_profile')
    headline = models.CharField(max_length=160, blank=True)
    bio = models.TextField(blank=True, max_length=5000)
    expertise = models.JSONField(default=list, blank=True)
    interests = models.JSONField(default=list, blank=True, help_text='Topics the student wants to learn; used for recommendations.')
    website = models.URLField(max_length=300, blank=True)
    linkedin = models.URLField(max_length=300, blank=True)
    twitter = models.URLField(max_length=300, blank=True)
    youtube = models.URLField(max_length=300, blank=True)
    github = models.URLField(max_length=300, blank=True)
    facebook = models.URLField(max_length=300, blank=True)
    payout_details = models.TextField(blank=True, max_length=1000, help_text='Private: how the instructor wants to be paid.')
    updated_at = models.DateTimeField(auto_now=True)

    @classmethod
    def for_user(cls, user):
        return cls.objects.get_or_create(user=user)[0]


class Notification(models.Model):
    """Something to tell a user in their notification centre (the bell)."""
    KINDS = [(k, k.replace('_', ' ').capitalize()) for k in (
        'enrollment', 'purchase', 'payment', 'course_approved', 'course_rejected', 'course_review', 'new_lecture',
        'announcement', 'quiz_result', 'assignment_submitted', 'assignment_graded', 'certificate', 'coupon', 'question',
        'answer', 'review', 'report', 'refund', 'system')]
    user = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name='lms_notifications')
    kind = models.CharField(max_length=30, choices=KINDS, default='system')
    title = models.CharField(max_length=200)
    body = models.CharField(max_length=500, blank=True)
    link = models.CharField(max_length=300, blank=True, help_text='Where clicking it goes on the website.')
    is_read = models.BooleanField(default=False, db_index=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ['-created_at', '-id']


class AuditLog(models.Model):
    """Important administrative actions, for accountability."""
    actor = models.ForeignKey(settings.AUTH_USER_MODEL, null=True, blank=True, on_delete=models.SET_NULL, related_name='+')
    action = models.CharField(max_length=60, db_index=True)
    target_type = models.CharField(max_length=40, blank=True)
    target_id = models.CharField(max_length=40, blank=True)
    target_label = models.CharField(max_length=250, blank=True)
    details = models.JSONField(default=dict, blank=True)
    ip_address = models.GenericIPAddressField(null=True, blank=True)
    created_at = models.DateTimeField(auto_now_add=True, db_index=True)

    class Meta:
        ordering = ['-created_at', '-id']


class Report(models.Model):
    """Someone flagged content (a course, review, question or answer) for a moderator to look at."""
    COURSE, REVIEW, THREAD, REPLY, OTHER = 'course', 'review', 'thread', 'reply', 'other'
    TARGETS = [(COURSE, 'Course'), (REVIEW, 'Review'), (THREAD, 'Question'), (REPLY, 'Answer'), (OTHER, 'Other')]
    REASONS = [('spam', 'Spam or advertising'), ('abuse', 'Harassment or hate'), ('inappropriate', 'Inappropriate content'),
               ('copyright', 'Copyright problem'), ('misleading', 'Misleading or wrong'), ('other', 'Something else')]
    OPEN, RESOLVED, DISMISSED = 'open', 'resolved', 'dismissed'

    reporter = models.ForeignKey(settings.AUTH_USER_MODEL, null=True, on_delete=models.SET_NULL, related_name='lms_reports')
    target_type = models.CharField(max_length=10, choices=TARGETS)
    target_id = models.PositiveIntegerField(null=True, blank=True)
    target_label = models.CharField(max_length=250, blank=True)
    reason = models.CharField(max_length=20, choices=REASONS, default='other')
    details = models.TextField(blank=True, max_length=2000)
    status = models.CharField(max_length=10, choices=[(OPEN, 'Open'), (RESOLVED, 'Resolved'), (DISMISSED, 'Dismissed')], default=OPEN, db_index=True)
    resolution_note = models.CharField(max_length=500, blank=True)
    resolved_by = models.ForeignKey(settings.AUTH_USER_MODEL, null=True, blank=True, on_delete=models.SET_NULL, related_name='+')
    resolved_at = models.DateTimeField(null=True, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ['-created_at', '-id']


# ================================================================ analytics

class CourseViewDay(models.Model):
    """How many times a course page was opened on a day."""
    course = models.ForeignKey(Course, on_delete=models.CASCADE, related_name='view_days')
    date = models.DateField()
    views = models.PositiveIntegerField(default=0)

    class Meta:
        constraints = [models.UniqueConstraint(fields=['course', 'date'], name='one_view_row_per_day')]


class RecentlyViewed(models.Model):
    """The courses a signed-in person looked at (for recommendations)."""
    user = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name='viewed_courses')
    course = models.ForeignKey(Course, on_delete=models.CASCADE, related_name='+')
    viewed_at = models.DateTimeField()

    class Meta:
        ordering = ['-viewed_at']
        constraints = [models.UniqueConstraint(fields=['user', 'course'], name='one_recent_view')]
