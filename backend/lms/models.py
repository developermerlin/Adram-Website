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
    ACCEPT, PENALTY, CLOSED = 'accept', 'penalty', 'closed'
    LATE_POLICIES = [(ACCEPT, 'Accept late work (marked late)'), (PENALTY, 'Accept late work with a penalty'), (CLOSED, 'Close at the deadline')]
    due_at = models.DateTimeField(null=True, blank=True, help_text='Assignment: the deadline for everyone.')
    due_days = models.PositiveSmallIntegerField(default=0, help_text='Assignment: or, due this many days after the student enrols (0 = not used).')
    late_policy = models.CharField(max_length=8, choices=LATE_POLICIES, default=ACCEPT)
    late_penalty_percent = models.PositiveSmallIntegerField(default=10, help_text='Penalty: the share of the grade taken off late work.')
    max_files = models.PositiveSmallIntegerField(default=1, help_text='Assignment: how many files may be handed in at once.')
    rubric = models.JSONField(default=list, blank=True, help_text='Assignment: grading criteria [{title, description, points}].')
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


class QuestionBank(models.Model):
    """A reusable set of questions an instructor keeps. Quizzes copy questions from it or draw random ones (QuizRule)."""
    owner = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name='question_banks')
    course = models.ForeignKey(Course, on_delete=models.SET_NULL, null=True, blank=True, related_name='question_banks')
    title = models.CharField(max_length=200)
    description = models.CharField(max_length=500, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ['title', 'id']

    def __str__(self):
        return self.title


class QuestionCategory(models.Model):
    bank = models.ForeignKey(QuestionBank, on_delete=models.CASCADE, related_name='categories')
    name = models.CharField(max_length=120)

    class Meta:
        ordering = ['name', 'id']
        constraints = [models.UniqueConstraint(fields=['bank', 'name'], name='unique_bank_category')]

    def __str__(self):
        return self.name


class Question(models.Model):
    """
    A quiz question: one right answer, several right answers, true/false, a short typed answer, fill in the blanks
    (the text holds the answers in square brackets: "The capital is [Freetown]") or matching pairs.
    It belongs to a quiz lesson, or to a question bank.
    """
    SINGLE, MULTIPLE, TRUE_FALSE, SHORT, FILL_BLANK, MATCHING = 'single', 'multiple', 'true_false', 'short', 'fill_blank', 'matching'
    KINDS = [(SINGLE, 'Multiple choice'), (MULTIPLE, 'Multiple answers'), (TRUE_FALSE, 'True / false'), (SHORT, 'Short answer'),
             (FILL_BLANK, 'Fill in the blanks'), (MATCHING, 'Matching')]
    EASY, MEDIUM, HARD = 'easy', 'medium', 'hard'
    DIFFICULTIES = [(EASY, 'Easy'), (MEDIUM, 'Medium'), (HARD, 'Hard')]

    lesson = models.ForeignKey(Lesson, on_delete=models.CASCADE, related_name='questions', null=True, blank=True)
    bank = models.ForeignKey(QuestionBank, on_delete=models.CASCADE, related_name='questions', null=True, blank=True)
    category = models.ForeignKey(QuestionCategory, on_delete=models.SET_NULL, related_name='questions', null=True, blank=True)
    kind = models.CharField(max_length=12, choices=KINDS, default=SINGLE)
    difficulty = models.CharField(max_length=6, choices=DIFFICULTIES, default=MEDIUM)
    text = models.CharField(max_length=1000)
    accepted_answers = models.JSONField(default=list, blank=True, help_text='Short answer: the answers marked right (case and spacing ignored).')
    data = models.JSONField(default=dict, blank=True, help_text='Fill in the blanks: {blanks: [[answers]]}. Matching: {pairs: [{left, right}]}.')
    points = models.PositiveSmallIntegerField(default=1)
    explanation = models.CharField(max_length=500, blank=True, help_text='Shown after the student answers.')
    sort_order = models.PositiveIntegerField(default=0)
    times_answered = models.PositiveIntegerField(default=0)
    times_correct = models.PositiveIntegerField(default=0)
    created_at = models.DateTimeField(auto_now_add=True, null=True)

    class Meta:
        ordering = ['sort_order', 'id']


class QuizRule(models.Model):
    """A quiz draws `count` random questions from a bank, optionally only one category and/or difficulty."""
    lesson = models.ForeignKey(Lesson, on_delete=models.CASCADE, related_name='quiz_rules')
    bank = models.ForeignKey(QuestionBank, on_delete=models.CASCADE, related_name='rules')
    category = models.ForeignKey(QuestionCategory, on_delete=models.SET_NULL, null=True, blank=True)
    difficulty = models.CharField(max_length=6, choices=Question.DIFFICULTIES, blank=True)
    count = models.PositiveSmallIntegerField(default=5)
    sort_order = models.PositiveIntegerField(default=0)

    class Meta:
        ordering = ['sort_order', 'id']

    def pool(self):
        questions = self.bank.questions.all()
        if self.category_id:
            questions = questions.filter(category_id=self.category_id)
        if self.difficulty:
            questions = questions.filter(difficulty=self.difficulty)
        return questions


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
    position_seconds = models.PositiveIntegerField(null=True, blank=True, help_text='The moment in the lesson video it is about.')
    is_pinned = models.BooleanField(default=False, help_text='Pinned by the instructor: shown first.')
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ['-updated_at', '-id']


class ThreadVote(models.Model):
    """A student who has the same question (an upvote)."""
    thread = models.ForeignKey(Thread, on_delete=models.CASCADE, related_name='votes')
    user = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name='+')

    class Meta:
        constraints = [models.UniqueConstraint(fields=['thread', 'user'], name='one_vote_per_thread')]


class Reply(models.Model):
    thread = models.ForeignKey(Thread, on_delete=models.CASCADE, related_name='replies')
    author = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name='+')
    body = models.TextField(max_length=2000)
    is_staff = models.BooleanField(default=False, help_text='Written by the instructor or an administrator.')
    is_instructor_answer = models.BooleanField(default=False, help_text='Marked by the instructor as the answer.')
    is_accepted = models.BooleanField(default=False, help_text='Accepted by the student who asked: it solved their question.')
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
    owner = models.ForeignKey(settings.AUTH_USER_MODEL, null=True, blank=True, on_delete=models.CASCADE, related_name='personal_coupons',
                              help_text='A personal code (e.g. a referral reward): only this person can use it.')
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
        if self.owner_id and self.owner_id != getattr(student, 'id', None):
            return 'This code belongs to someone else.'
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


class CertificateTemplate(models.Model):
    """How certificates look: the layout, colours and wording. One template is the default; courses can pick another."""
    CLASSIC, MODERN, MINIMAL = 'classic', 'modern', 'minimal'
    LAYOUTS = [(CLASSIC, 'Classic (framed)'), (MODERN, 'Modern (coloured band)'), (MINIMAL, 'Minimal')]

    name = models.CharField(max_length=120)
    layout = models.CharField(max_length=10, choices=LAYOUTS, default=CLASSIC)
    accent_color = models.CharField(max_length=7, default='#1d4ed8', help_text='A colour like #1d4ed8.')
    title = models.CharField(max_length=80, default='Certificate of completion')
    heading = models.CharField(max_length=80, default='Congratulations', blank=True)
    lead = models.CharField(max_length=160, default='has successfully completed the course')
    footer_note = models.CharField(max_length=200, blank=True, help_text='A line under the signatures, e.g. an accreditation.')
    show_hours = models.BooleanField(default=True)
    show_instructor = models.BooleanField(default=True)
    show_qr = models.BooleanField(default=True, help_text='A QR code that opens the verification page.')
    signer_name = models.CharField(max_length=120, blank=True, help_text='Leave empty to use the LMS settings.')
    signer_title = models.CharField(max_length=120, blank=True)
    is_default = models.BooleanField(default=False)
    courses = models.ManyToManyField(Course, blank=True, related_name='certificate_templates')
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ['-is_default', 'name']

    def __str__(self):
        return self.name

    @classmethod
    def for_course(cls, course):
        return cls.objects.filter(courses=course).first() or cls.objects.filter(is_default=True).first()


class Certificate(models.Model):
    """Issued once, when the student finishes every lesson. Anyone can check its code on the website."""
    enrollment = models.OneToOneField(TrainingEnrollment, on_delete=models.CASCADE, related_name='certificate')
    code = models.CharField(max_length=30, unique=True, default=new_certificate_code)
    issued_at = models.DateTimeField(auto_now_add=True)
    revoked_at = models.DateTimeField(null=True, blank=True)
    revoke_reason = models.CharField(max_length=300, blank=True)
    template = models.ForeignKey(CertificateTemplate, null=True, blank=True, on_delete=models.SET_NULL, related_name='certificates',
                                 help_text='The look it was issued with (none: the built-in design).')

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
    is_late = models.BooleanField(default=False)
    penalty_percent = models.PositiveSmallIntegerField(default=0, help_text='Taken off the grade because the work was late.')
    raw_grade = models.PositiveSmallIntegerField(null=True, blank=True, help_text='The grade before any late penalty.')
    rubric_scores = models.JSONField(default=list, blank=True, help_text='Points given for each rubric criterion, in order.')
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ['-created_at', '-id']


class SubmissionFile(models.Model):
    """One of the files handed in with a submission."""
    submission = models.ForeignKey(Submission, on_delete=models.CASCADE, related_name='files')
    file = models.FileField(upload_to=submission_upload_to, storage=lms_storage)
    filename = models.CharField(max_length=200)
    size = models.PositiveBigIntegerField(default=0)
    sort_order = models.PositiveSmallIntegerField(default=0)

    class Meta:
        ordering = ['sort_order', 'id']


# ================================================================ shopping

class CartItem(models.Model):
    student = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name='cart_items')
    course = models.ForeignKey(Course, on_delete=models.CASCADE, related_name='in_carts')
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ['created_at']
        constraints = [models.UniqueConstraint(fields=['student', 'course'], name='one_cart_entry')]


def new_affiliate_code():
    return 'P' + secrets.token_hex(3).upper()


class Affiliate(models.Model):
    """A partner who promotes courses with their own link (?aff=CODE) and earns a commission on the orders it brings."""
    PENDING, APPROVED, REJECTED, SUSPENDED = 'pending', 'approved', 'rejected', 'suspended'
    STATUSES = [(PENDING, 'Waiting for approval'), (APPROVED, 'Approved'), (REJECTED, 'Not accepted'), (SUSPENDED, 'Suspended')]

    user = models.OneToOneField(settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name='affiliate')
    code = models.CharField(max_length=12, unique=True, default=new_affiliate_code)
    status = models.CharField(max_length=10, choices=STATUSES, default=PENDING)
    commission_percent = models.DecimalField(max_digits=5, decimal_places=2, default=Decimal('10'))
    website = models.URLField(max_length=300, blank=True)
    audience = models.TextField(blank=True, max_length=1000, help_text='Where and to whom they will promote the courses.')
    payout_details = models.TextField(blank=True, max_length=500, help_text='Private: how they want to be paid.')
    note = models.CharField(max_length=300, blank=True, help_text='From ADRAM: why it was not accepted or suspended.')
    created_at = models.DateTimeField(auto_now_add=True)
    approved_at = models.DateTimeField(null=True, blank=True)

    class Meta:
        ordering = ['-created_at']


class AffiliateClickDay(models.Model):
    affiliate = models.ForeignKey(Affiliate, on_delete=models.CASCADE, related_name='click_days')
    date = models.DateField()
    clicks = models.PositiveIntegerField(default=0)

    class Meta:
        constraints = [models.UniqueConstraint(fields=['affiliate', 'date'], name='one_click_row_per_day')]


class AffiliatePayout(models.Model):
    affiliate = models.ForeignKey(Affiliate, on_delete=models.CASCADE, related_name='payouts')
    amount = models.DecimalField(max_digits=12, decimal_places=2)
    reference = models.CharField(max_length=120, blank=True)
    paid_by = models.ForeignKey(settings.AUTH_USER_MODEL, null=True, blank=True, on_delete=models.SET_NULL, related_name='+')
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ['-created_at']


class Plan(models.Model):
    """A Premium subscription: while it is active, every Premium course is open (single purchases still exist)."""
    MONTH, YEAR = 'month', 'year'
    INTERVALS = [(MONTH, 'Monthly'), (YEAR, 'Yearly')]

    name = models.CharField(max_length=80)
    interval = models.CharField(max_length=5, choices=INTERVALS, default=MONTH)
    price = models.DecimalField(max_digits=10, decimal_places=2)
    description = models.CharField(max_length=300, blank=True)
    is_active = models.BooleanField(default=True)
    sort_order = models.PositiveSmallIntegerField(default=0)

    class Meta:
        ordering = ['sort_order', 'price']

    def __str__(self):
        return self.name

    @property
    def days(self):
        return 365 if self.interval == self.YEAR else 30


class Subscription(models.Model):
    """One paid period of a plan. A student's Premium lasts until the latest ends_at."""
    user = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name='subscriptions')
    plan = models.ForeignKey(Plan, on_delete=models.PROTECT, related_name='subscriptions')
    order = models.OneToOneField('Order', null=True, blank=True, on_delete=models.SET_NULL, related_name='subscription')
    starts_at = models.DateTimeField()
    ends_at = models.DateTimeField()
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ['-ends_at']


class PremiumEnrollment(models.Model):
    """Marks a place taken through Premium: it is open only while the student's Premium is active."""
    enrollment = models.OneToOneField(TrainingEnrollment, on_delete=models.CASCADE, related_name='premium')
    created_at = models.DateTimeField(auto_now_add=True)


class InstalmentPlan(models.Model):
    """A course paid in parts: the first part opens it; each later part is an order with a due date."""
    ACTIVE, COMPLETED, CANCELLED = 'active', 'completed', 'cancelled'
    STATUSES = [(ACTIVE, 'Paying'), (COMPLETED, 'Paid in full'), (CANCELLED, 'Cancelled')]

    student = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name='instalment_plans')
    course = models.ForeignKey(Course, on_delete=models.CASCADE, related_name='instalment_plans')
    total = models.DecimalField(max_digits=12, decimal_places=2)
    parts = models.PositiveSmallIntegerField()
    paid_parts = models.PositiveSmallIntegerField(default=0)
    status = models.CharField(max_length=10, choices=STATUSES, default=ACTIVE)
    next_due_at = models.DateTimeField(null=True, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ['-created_at']


class Bundle(models.Model):
    """Several courses sold together for one (lower) price. Courses the student already owns come off the price."""
    slug = models.SlugField(max_length=120, unique=True)
    title = models.CharField(max_length=200)
    summary = models.CharField(max_length=300, blank=True)
    description = models.TextField(blank=True, max_length=5000)
    courses = models.ManyToManyField(Course, related_name='bundles')
    price = models.DecimalField(max_digits=10, decimal_places=2, help_text='The price of the whole bundle (NLe).')
    is_published = models.BooleanField(default=False)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ['-created_at']

    def __str__(self):
        return self.title


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
    bundle = models.ForeignKey(Bundle, null=True, blank=True, on_delete=models.SET_NULL, related_name='orders')
    is_gift = models.BooleanField(default=False, help_text='Bought for someone else: the courses go to whoever redeems the gift.')
    affiliate = models.ForeignKey('Affiliate', null=True, blank=True, on_delete=models.SET_NULL, related_name='orders')
    plan = models.ForeignKey(Plan, null=True, blank=True, on_delete=models.SET_NULL, related_name='orders', help_text='A Premium subscription order.')
    instalment_plan = models.ForeignKey(InstalmentPlan, null=True, blank=True, on_delete=models.SET_NULL, related_name='orders')
    instalment_number = models.PositiveSmallIntegerField(null=True, blank=True)
    due_at = models.DateTimeField(null=True, blank=True, help_text='Instalments: pay by this date.')
    affiliate_commission = models.DecimalField(max_digits=12, decimal_places=2, default=0, help_text='Earned by the affiliate once paid (fixed when ordered).')
    provider = models.CharField(max_length=30, default='manual', help_text='The payment provider handling this order.')
    method = models.CharField(max_length=30, blank=True)
    transaction_id = models.CharField(max_length=100, blank=True)
    payer = models.CharField(max_length=100, blank=True, help_text='The number paid from, or the name on the card.')
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


def new_gift_code():
    return 'GIFT-' + secrets.token_hex(5).upper()


class Gift(models.Model):
    """A course (or bundle) bought for someone. Once the order is paid, the recipient redeems the code to enrol."""
    order = models.OneToOneField('Order', on_delete=models.CASCADE, related_name='gift')
    code = models.CharField(max_length=20, unique=True, default=new_gift_code)
    recipient_name = models.CharField(max_length=120)
    recipient_email = models.EmailField()
    message = models.TextField(blank=True, max_length=1000)
    sent_at = models.DateTimeField(null=True, blank=True)
    redeemed_by = models.ForeignKey(settings.AUTH_USER_MODEL, null=True, blank=True, on_delete=models.SET_NULL, related_name='gifts_received')
    redeemed_at = models.DateTimeField(null=True, blank=True)
    revoked_at = models.DateTimeField(null=True, blank=True)


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
    # Instructor withdrawals
    payout_hold_days = models.PositiveSmallIntegerField(default=14, help_text='Days a sale is held before its earnings can be withdrawn (refund window).')
    min_withdrawal = models.DecimalField(max_digits=12, decimal_places=2, default=Decimal('100'), help_text='The smallest withdrawal an instructor can ask for.')
    # Referrals: a friend who joins through a student's link gets a welcome discount; the student is rewarded after the friend's first purchase
    referrals_enabled = models.BooleanField(default=True)
    referral_friend_percent = models.PositiveSmallIntegerField(default=10, help_text='Welcome discount for the friend who joins (%).')
    referral_reward_percent = models.PositiveSmallIntegerField(default=15, help_text='Reward for the student who invited them (%).')
    referral_valid_days = models.PositiveSmallIntegerField(default=90, help_text='How long the referral codes can be used.')
    # Affiliates: approved partners earn a share of the orders their links bring in (paid by the platform, not instructors)
    affiliates_enabled = models.BooleanField(default=True)
    affiliate_percent = models.DecimalField(max_digits=5, decimal_places=2, default=Decimal('10'), help_text='Default commission for new affiliates (%).')
    affiliate_cookie_days = models.PositiveSmallIntegerField(default=30, help_text='A purchase this many days after clicking a link still counts.')
    # Premium plan (alongside single purchases) and paying in instalments
    premium_enabled = models.BooleanField(default=True, help_text='Students can subscribe to a plan that opens every Premium course.')
    instalments_enabled = models.BooleanField(default=True)
    instalment_min_price = models.DecimalField(max_digits=10, decimal_places=2, default=Decimal('300'), help_text='Courses from this price can be paid in parts.')
    instalment_max_parts = models.PositiveSmallIntegerField(default=3, help_text='2 or 3.')
    instalment_grace_days = models.PositiveSmallIntegerField(default=7, help_text='Lessons lock when a part is this many days overdue.')
    # Mobile apps
    push_enabled = models.BooleanField(default=True, help_text='Send notifications to the mobile apps too.')
    app_min_version = models.CharField(max_length=20, blank=True, help_text='Older app versions are asked to update (e.g. 1.2.0).')
    offline_days = models.PositiveSmallIntegerField(default=30, help_text='Saved lessons play offline this long before the app must check in.')
    offline_devices = models.PositiveSmallIntegerField(default=3, help_text='Devices a student can keep saved lessons on.')
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
    intro_video_url = models.URLField(max_length=500, blank=True, help_text='Instructors: a YouTube or Vimeo video introducing themselves.')
    marketing_emails = models.BooleanField(default=True, help_text='News and offers by email (campaigns). Account emails are always sent.')
    payout_details = models.TextField(blank=True, max_length=1000, help_text='Private: how the instructor wants to be paid.')
    # Private tax information (instructors), for ADRAM's records and statements
    legal_name = models.CharField(max_length=150, blank=True)
    tax_id = models.CharField('tax ID (TIN / NIN)', max_length=60, blank=True)
    tax_address = models.CharField(max_length=300, blank=True)
    updated_at = models.DateTimeField(auto_now=True)

    @classmethod
    def for_user(cls, user):
        return cls.objects.get_or_create(user=user)[0]


class Notification(models.Model):
    """Something to tell a user in their notification centre (the bell)."""
    KINDS = [(k, k.replace('_', ' ').capitalize()) for k in (
        'enrollment', 'purchase', 'payment', 'course_approved', 'course_rejected', 'course_review', 'new_lecture',
        'announcement', 'quiz_result', 'assignment_submitted', 'assignment_graded', 'assignment_due', 'certificate', 'coupon', 'question',
        'answer', 'review', 'report', 'refund', 'new_course', 'system')]
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
    """A course's day: page views, and the steps towards buying it (for the sales funnel)."""
    course = models.ForeignKey(Course, on_delete=models.CASCADE, related_name='view_days')
    date = models.DateField()
    views = models.PositiveIntegerField(default=0)
    wishlist_adds = models.PositiveIntegerField(default=0)
    cart_adds = models.PositiveIntegerField(default=0)
    checkouts = models.PositiveIntegerField(default=0, help_text='Orders placed that include the course (paid or not yet).')

    class Meta:
        constraints = [models.UniqueConstraint(fields=['course', 'date'], name='one_view_row_per_day')]


def new_referral_code():
    return secrets.token_hex(4).upper()


class ReferralCode(models.Model):
    """A student's personal invitation code (adram.../?ref=CODE)."""
    user = models.OneToOneField(settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name='referral_code')
    code = models.CharField(max_length=12, unique=True, default=new_referral_code)
    created_at = models.DateTimeField(auto_now_add=True)


class Referral(models.Model):
    """Someone who joined through a friend's invitation, and the coupons it earned."""
    referrer = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name='referrals_made')
    referred = models.OneToOneField(settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name='referred_by')
    welcome_coupon = models.ForeignKey(Coupon, null=True, blank=True, on_delete=models.SET_NULL, related_name='+')
    reward_coupon = models.ForeignKey(Coupon, null=True, blank=True, on_delete=models.SET_NULL, related_name='+')
    rewarded_order = models.ForeignKey('Order', null=True, blank=True, on_delete=models.SET_NULL, related_name='+')
    created_at = models.DateTimeField(auto_now_add=True)
    rewarded_at = models.DateTimeField(null=True, blank=True)

    class Meta:
        ordering = ['-created_at']


class InstructorFollow(models.Model):
    """A student following an instructor: told when the instructor publishes a new course."""
    user = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name='following')
    instructor = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name='followers')
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ['-created_at']
        constraints = [models.UniqueConstraint(fields=['user', 'instructor'], name='follow_once')]


class RecentlyViewed(models.Model):
    """The courses a signed-in person looked at (for recommendations)."""
    user = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name='viewed_courses')
    course = models.ForeignKey(Course, on_delete=models.CASCADE, related_name='+')
    viewed_at = models.DateTimeField()

    class Meta:
        ordering = ['-viewed_at']
        constraints = [models.UniqueConstraint(fields=['user', 'course'], name='one_recent_view')]


class SearchQuery(models.Model):
    """A search someone ran in the catalogue: their recent searches, and popular searches for everyone."""
    user = models.ForeignKey(settings.AUTH_USER_MODEL, null=True, blank=True, on_delete=models.CASCADE, related_name='course_searches')
    text = models.CharField(max_length=120)
    normalized = models.CharField(max_length=120, db_index=True)
    results = models.PositiveIntegerField(default=0)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ['-created_at']
        indexes = [models.Index(fields=['user', '-created_at'])]


class SavedSearch(models.Model):
    """A search with its filters that a student kept, to run again with one click."""
    user = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name='saved_searches')
    name = models.CharField(max_length=80)
    params = models.JSONField(default=dict, help_text='The catalogue filters: q, category, level, price…')
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ['-created_at']



class WithdrawalRequest(models.Model):
    """An instructor asks to be paid (part of) their available earnings; an administrator pays it or says why not."""
    REQUESTED, PAID, REJECTED, CANCELLED = 'requested', 'paid', 'rejected', 'cancelled'
    STATUSES = [(REQUESTED, 'Requested'), (PAID, 'Paid'), (REJECTED, 'Rejected'), (CANCELLED, 'Cancelled')]
    METHODS = [('orange_money', 'Orange Money'), ('afrimoney', 'Afrimoney'), ('bank', 'Bank transfer'), ('other', 'Other')]

    instructor = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name='withdrawals')
    amount = models.DecimalField(max_digits=12, decimal_places=2)
    method = models.CharField(max_length=20, choices=METHODS)
    account = models.CharField(max_length=120, help_text='Phone number or bank account number.')
    account_name = models.CharField(max_length=120)
    bank_name = models.CharField(max_length=120, blank=True)
    note = models.CharField(max_length=300, blank=True)
    status = models.CharField(max_length=12, choices=STATUSES, default=REQUESTED, db_index=True)
    admin_note = models.CharField(max_length=300, blank=True, help_text='Why it was rejected, or a note with the payment.')
    payout = models.OneToOneField(Payout, null=True, blank=True, on_delete=models.SET_NULL, related_name='request')
    decided_by = models.ForeignKey(settings.AUTH_USER_MODEL, null=True, blank=True, on_delete=models.SET_NULL, related_name='+')
    decided_at = models.DateTimeField(null=True, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ['-created_at']


class LearningDay(models.Model):
    """How much a student learned on one day: minutes in lessons and lessons finished (streaks, goals, charts)."""
    user = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name='learning_days')
    date = models.DateField()
    seconds = models.PositiveIntegerField(default=0)
    lessons_completed = models.PositiveIntegerField(default=0)

    class Meta:
        ordering = ['-date']
        constraints = [models.UniqueConstraint(fields=['user', 'date'], name='one_learning_day')]


class LearningGoal(models.Model):
    """A student's daily target, in minutes of learning."""
    user = models.OneToOneField(settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name='learning_goal')
    daily_minutes = models.PositiveSmallIntegerField(default=15)
    updated_at = models.DateTimeField(auto_now=True)


# ================================================================ email campaigns

class Segment(models.Model):
    """A saved audience: rules that pick users (see lms/campaigns.py for what the rules mean)."""
    name = models.CharField(max_length=120)
    rules = models.JSONField(default=dict, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ['name']


class Campaign(models.Model):
    """An email (and in-app notification) to an audience."""
    DRAFT, SENDING, SENT = 'draft', 'sending', 'sent'
    STATUSES = [(DRAFT, 'Draft'), (SENDING, 'Sending'), (SENT, 'Sent')]

    name = models.CharField(max_length=120, help_text='For your own reference.')
    subject = models.CharField(max_length=150)
    title = models.CharField(max_length=150, blank=True, help_text='The heading inside the email (defaults to the subject).')
    body = models.TextField(max_length=5000, help_text='A blank line starts a new paragraph.')
    button_label = models.CharField(max_length=60, blank=True)
    button_link = models.CharField(max_length=300, blank=True, help_text='A page of this website (e.g. /courses/web) or a full https:// link.')
    rules = models.JSONField(default=dict, blank=True, help_text='The audience.')
    notify_in_app = models.BooleanField(default=True)
    status = models.CharField(max_length=8, choices=STATUSES, default=DRAFT)
    created_by = models.ForeignKey(settings.AUTH_USER_MODEL, null=True, blank=True, on_delete=models.SET_NULL, related_name='+')
    created_at = models.DateTimeField(auto_now_add=True)
    sent_at = models.DateTimeField(null=True, blank=True)

    class Meta:
        ordering = ['-created_at']


class CampaignRecipient(models.Model):
    campaign = models.ForeignKey(Campaign, on_delete=models.CASCADE, related_name='recipients')
    user = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name='+')
    sent_at = models.DateTimeField(null=True, blank=True)
    failed = models.BooleanField(default=False)
    clicked_at = models.DateTimeField(null=True, blank=True)
    unsubscribed_at = models.DateTimeField(null=True, blank=True)

    class Meta:
        constraints = [models.UniqueConstraint(fields=['campaign', 'user'], name='one_send_per_user')]


class ActiveDay(models.Model):
    """A user used the site (any signed-in request) on this day: the basis of daily/monthly active users."""
    user = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name='active_days')
    date = models.DateField()

    class Meta:
        constraints = [models.UniqueConstraint(fields=['user', 'date'], name='one_active_row_per_day')]
        indexes = [models.Index(fields=['date'])]


# ================================================================ mobile apps

class PushDevice(models.Model):
    """A phone that receives push notifications (an Expo or Firebase token from the mobile app)."""
    EXPO, FCM = 'expo', 'fcm'
    user = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name='push_devices')
    token = models.CharField(max_length=300, unique=True)
    kind = models.CharField(max_length=6, choices=[(EXPO, 'Expo'), (FCM, 'Firebase')], default=EXPO)
    platform = models.CharField(max_length=10, blank=True, help_text='android or ios')
    app_version = models.CharField(max_length=20, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)
    last_seen_at = models.DateTimeField(auto_now=True)


class OfflineLicence(models.Model):
    """Permission to keep a lesson on a device for offline learning, until expires_at (renewed when the app checks in)."""
    user = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name='offline_licences')
    lesson = models.ForeignKey(Lesson, on_delete=models.CASCADE, related_name='offline_licences')
    device_id = models.CharField(max_length=100)
    issued_at = models.DateTimeField(auto_now_add=True)
    expires_at = models.DateTimeField()
    revoked_at = models.DateTimeField(null=True, blank=True)

    class Meta:
        constraints = [models.UniqueConstraint(fields=['user', 'lesson', 'device_id'], name='one_licence_per_device_lesson')]


# ================================================================ study groups

def new_group_code():
    return secrets.token_hex(3).upper()


class StudyGroup(models.Model):
    """Students on the same course learning together: a board for posts and everyone's progress side by side."""
    course = models.ForeignKey(Course, on_delete=models.CASCADE, related_name='study_groups')
    name = models.CharField(max_length=80)
    description = models.CharField(max_length=300, blank=True)
    is_private = models.BooleanField(default=False, help_text='Private groups are joined with the invite code only.')
    invite_code = models.CharField(max_length=12, unique=True, default=new_group_code)
    max_members = models.PositiveSmallIntegerField(default=30)
    created_by = models.ForeignKey(settings.AUTH_USER_MODEL, null=True, on_delete=models.SET_NULL, related_name='+')
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ['-created_at']


class GroupMember(models.Model):
    OWNER, MEMBER = 'owner', 'member'
    group = models.ForeignKey(StudyGroup, on_delete=models.CASCADE, related_name='members')
    user = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name='study_groups')
    role = models.CharField(max_length=6, choices=[(OWNER, 'Owner'), (MEMBER, 'Member')], default=MEMBER)
    joined_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ['joined_at']
        constraints = [models.UniqueConstraint(fields=['group', 'user'], name='join_group_once')]


class GroupPost(models.Model):
    group = models.ForeignKey(StudyGroup, on_delete=models.CASCADE, related_name='posts')
    author = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name='+')
    body = models.TextField(max_length=2000)
    is_pinned = models.BooleanField(default=False)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ['-is_pinned', '-created_at']

