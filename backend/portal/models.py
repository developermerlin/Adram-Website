"""
The student portal: study goals, saved scholarships and tracked applications (with a documents
checklist), plus what staff see about a student: private notes and a timeline of portal activity.
"""
import os
import uuid
from pathlib import Path

from django.conf import settings
from django.core.files.storage import FileSystemStorage
from django.db import models

from catalog.models import Course, Scholarship

# Standard terms for the "ADRAM applies for you" service; admins can edit them in Payments & terms.
DEFAULT_TERMS = Path(__file__).with_name('default_terms.txt').read_text(encoding='utf-8').strip()

# Receipts and application documents are private: stored outside MEDIA_ROOT (which is served publicly)
# and only downloadable through the API by the student and administrators.
private_storage = FileSystemStorage(location=settings.PRIVATE_MEDIA_ROOT)


def _private_name(folder, filename):
    ext = os.path.splitext(filename)[1].lower()[:10]
    return f'{folder}/{uuid.uuid4().hex}{ext}'  # never reuse the student's file name on disk


def receipt_upload_to(instance, filename):
    return _private_name('receipts', filename)


def document_upload_to(instance, filename):
    return _private_name('documents', filename)


def result_upload_to(instance, filename):
    return _private_name('results', filename)


def message_upload_to(instance, filename):
    return _private_name('messages', filename)


def intake_upload_to(instance, filename):
    return _private_name('forms', filename)


def agreement_upload_to(instance, filename):
    return _private_name('agreements', filename)

# Checklist every new application starts with (staff and students can add or remove items).
DEFAULT_DOCUMENTS = [
    'Valid international passport',
    'Academic certificates and transcripts',
    'Statement of purpose / personal essays',
    'Reference letters',
    'CV / résumé',
    'English test results (IELTS / TOEFL), if required',
]


class StudyGoals(models.Model):
    """What the student is looking for; drives the recommended scholarships."""
    user = models.OneToOneField(settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name='study_goals')
    levels = models.JSONField(default=list, blank=True)
    destinations = models.JSONField(default=list, blank=True)
    field_of_study = models.CharField(max_length=200, blank=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        verbose_name_plural = 'study goals'


class SavedScholarship(models.Model):
    user = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name='saved_scholarships')
    scholarship = models.ForeignKey(Scholarship, on_delete=models.CASCADE, related_name='saved_by')
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ['-created_at']
        constraints = [models.UniqueConstraint(fields=['user', 'scholarship'], name='unique_saved_scholarship')]


class Application(models.Model):
    """One scholarship a student is pursuing, tracked by the student and by ADRAM staff."""
    INTERESTED, PREPARING, SUBMITTED, INTERVIEW, ACCEPTED, UNSUCCESSFUL, WITHDRAWN = (
        'interested', 'preparing', 'submitted', 'interview', 'accepted', 'unsuccessful', 'withdrawn')
    STAGE_CHOICES = [
        (INTERESTED, 'Interested'),
        (PREPARING, 'Preparing'),
        (SUBMITTED, 'Submitted'),
        (INTERVIEW, 'Interview'),
        (ACCEPTED, 'Accepted'),
        (UNSUCCESSFUL, 'Unsuccessful'),
        (WITHDRAWN, 'Withdrawn'),
    ]

    student = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name='applications')
    # Kept (with its name) even if the scholarship listing is later deleted.
    scholarship = models.ForeignKey(Scholarship, null=True, blank=True, on_delete=models.SET_NULL, related_name='applications')
    scholarship_name = models.CharField(max_length=200)
    stage = models.CharField(max_length=20, choices=STAGE_CHOICES, default=INTERESTED)
    deadline = models.DateField(null=True, blank=True)
    next_step = models.CharField(max_length=300, blank=True, help_text='Shown to the student as their next action.')
    counsellor_note = models.TextField(blank=True, help_text='Advice from ADRAM, shown to the student.')
    # The stage the next step and counsellor's note were written for. When the stage changes they are out of
    # date, so the student sees the standard message for the new outcome instead (see COUNSELLOR_DEFAULTS).
    advice_stage = models.CharField(max_length=20, blank=True)
    # ADRAM's message about the outcome: why it was unsuccessful, what happens after an award, etc.
    result_message = models.TextField(blank=True, help_text='Shown with the scholarship result.')
    result_expected_on = models.DateField(null=True, blank=True, help_text='When the provider will announce the results.')
    # Optional interview details, shown to the student at the interview stage.
    interview_at = models.DateTimeField(null=True, blank=True)
    interview_link = models.URLField(max_length=500, blank=True, help_text='Video-call or booking link the student opens.')
    interview_note = models.CharField(max_length=500, blank=True, help_text='e.g. what to prepare, dress code, who will attend.')
    # The student asked ADRAM to prepare and submit this application for them.
    service_requested_at = models.DateTimeField(null=True, blank=True)
    created_by = models.ForeignKey(settings.AUTH_USER_MODEL, null=True, blank=True, on_delete=models.SET_NULL, related_name='+')
    updated_by = models.ForeignKey(settings.AUTH_USER_MODEL, null=True, blank=True, on_delete=models.SET_NULL, related_name='+')
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ['-updated_at']
        constraints = [
            models.UniqueConstraint(fields=['student', 'scholarship'], condition=models.Q(scholarship__isnull=False),
                                    name='unique_application_per_scholarship'),
        ]

    def __str__(self):
        return f'{self.student} – {self.scholarship_name}'


# What the student reads "from your counsellor" when ADRAM hasn't written a note for the current outcome.
COUNSELLOR_DEFAULTS = {
    Application.PREPARING: 'We’re preparing your application. We’ll update you here as each step is completed.',
    Application.SUBMITTED: 'Your application has been submitted. We’re now waiting for the scholarship result and will let you know as soon as we hear.',
    Application.INTERVIEW: 'You’ve reached the interview stage, well done! Prepare carefully, and contact us if you’d like a practice session.',
    Application.ACCEPTED: 'Congratulations! Please contact us as soon as possible so we can help with the next steps: accepting the offer, your visa and travel.',
    Application.UNSUCCESSFUL: 'We’re sorry this application wasn’t successful. Don’t give up: talk to us about other scholarships you can apply for.',
    Application.WITHDRAWN: 'This application has been withdrawn. Contact us if you’d like help applying for another scholarship.',
}


class ApplicationDocument(models.Model):
    application = models.ForeignKey(Application, on_delete=models.CASCADE, related_name='documents')
    name = models.CharField(max_length=200)
    is_done = models.BooleanField(default=False)
    done_at = models.DateTimeField(null=True, blank=True)
    order = models.PositiveIntegerField(default=0)
    # The student's upload (private; see private_storage).
    file = models.FileField(upload_to=document_upload_to, storage=private_storage, blank=True)
    file_name = models.CharField(max_length=200, blank=True, help_text='Original file name, for display.')
    uploaded_at = models.DateTimeField(null=True, blank=True)

    # ADRAM's review of the upload. Blank = not reviewed yet (a re-upload goes back to blank).
    ACCEPTED, RETURNED = 'accepted', 'returned'
    REVIEW_CHOICES = [(ACCEPTED, 'Accepted'), (RETURNED, 'Returned for changes')]
    RETURN_TAGS = [
        ('unreadable', 'Unclear / unreadable'),
        ('wrong_document', 'Wrong document'),
        ('expired', 'Expired'),
        ('incomplete', 'Incomplete / pages missing'),
        ('needs_certification', 'Needs certification or stamp'),
        ('name_mismatch', 'Name doesn’t match'),
        ('needs_translation', 'Needs an English translation'),
        ('other', 'Other'),
    ]
    review_status = models.CharField(max_length=10, choices=REVIEW_CHOICES, blank=True)
    review_tag = models.CharField(max_length=30, choices=RETURN_TAGS, blank=True)
    review_note = models.CharField(max_length=500, blank=True, help_text='What the student should change.')
    reviewed_at = models.DateTimeField(null=True, blank=True)
    reviewed_by = models.ForeignKey(settings.AUTH_USER_MODEL, null=True, blank=True, on_delete=models.SET_NULL, related_name='+')
    resubmitted = models.BooleanField(default=False, help_text='Uploaded again after being returned.')

    class Meta:
        ordering = ['order', 'id']


class Milestone(models.Model):
    """One step of ADRAM's work on an application, set by the admin and shown to the student as a timeline."""
    TODO, IN_PROGRESS, DONE = 'todo', 'in_progress', 'done'
    STATUS_CHOICES = [(TODO, 'To do'), (IN_PROGRESS, 'In progress'), (DONE, 'Done')]

    application = models.ForeignKey(Application, on_delete=models.CASCADE, related_name='milestones')
    title = models.CharField(max_length=150)
    status = models.CharField(max_length=15, choices=STATUS_CHOICES, default=TODO)
    due_date = models.DateField('target date', null=True, blank=True)
    note = models.CharField(max_length=500, blank=True, help_text='Shown to the student.')
    completed_at = models.DateTimeField(null=True, blank=True)
    order = models.PositiveIntegerField(default=0)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ['order', 'id']


# The timeline every paid application starts with; the admin edits it per student.
DEFAULT_MILESTONES = [
    ('Payment confirmed', Milestone.DONE),
    ('Documents reviewed', Milestone.IN_PROGRESS),
    ('Essays and personal statements prepared', Milestone.TODO),
    ('Application reviewed with you', Milestone.TODO),
    ('Application submitted to the provider', Milestone.TODO),
    ('Waiting for the provider’s decision', Milestone.TODO),
]


class ServiceRequest(models.Model):
    """
    A student asked ADRAM to apply for them. The steps:
    requested -> approved (admin sets the amount and guidelines) -> student accepts the terms ->
    payment_submitted (receipt + documents uploaded) -> paid (admin confirms). The admin can also
    decline a request, or reject a payment so the student uploads it again.
    """
    REQUESTED, APPROVED, DECLINED, PAYMENT_SUBMITTED, PAYMENT_REJECTED, PAID = (
        'requested', 'approved', 'declined', 'payment_submitted', 'payment_rejected', 'paid')
    STATUS_CHOICES = [
        (REQUESTED, 'Waiting for ADRAM to review'),
        (APPROVED, 'Approved: read the guidelines and pay'),
        (DECLINED, 'Declined'),
        (PAYMENT_SUBMITTED, 'Payment submitted: being checked'),
        (PAYMENT_REJECTED, 'Payment not confirmed: upload again'),
        (PAID, 'Paid: ADRAM is working on the application'),
    ]
    AFRIMONEY, ORANGE_MONEY, CARD = 'afrimoney', 'orange_money', 'card'
    METHOD_CHOICES = [(AFRIMONEY, 'Afrimoney'), (ORANGE_MONEY, 'Orange Money'), (CARD, 'Card')]

    application = models.OneToOneField(Application, on_delete=models.CASCADE, related_name='service')
    status = models.CharField(max_length=20, choices=STATUS_CHOICES, default=REQUESTED)
    amount = models.DecimalField('amount (NLe)', max_digits=12, decimal_places=2, null=True, blank=True)
    guidelines = models.TextField(blank=True, help_text='Your guidelines for this student, shown once approved.')
    decision_note = models.TextField(blank=True, help_text='Why a request was declined or a payment was not confirmed.')
    requested_at = models.DateTimeField(auto_now_add=True)
    approved_at = models.DateTimeField(null=True, blank=True)
    approved_by = models.ForeignKey(settings.AUTH_USER_MODEL, null=True, blank=True, on_delete=models.SET_NULL, related_name='+')
    terms_accepted_at = models.DateTimeField(null=True, blank=True)
    payment_method = models.CharField(max_length=20, choices=METHOD_CHOICES, blank=True)
    transaction_id = models.CharField(max_length=100, blank=True)
    payer = models.CharField(max_length=100, blank=True, help_text='The number paid from, or the name on the card.')
    receipt = models.FileField(upload_to=receipt_upload_to, storage=private_storage, blank=True)
    receipt_name = models.CharField(max_length=200, blank=True)
    payment_submitted_at = models.DateTimeField(null=True, blank=True)
    verified_at = models.DateTimeField(null=True, blank=True)
    verified_by = models.ForeignKey(settings.AUTH_USER_MODEL, null=True, blank=True, on_delete=models.SET_NULL, related_name='+')
    updated_at = models.DateTimeField(auto_now=True)

    @property
    def reference(self):
        """Put on the mobile-money transfer so the payment can be matched to this application."""
        return f'ADR-{self.application_id:05d}'

    def __str__(self):
        return f'{self.reference} ({self.get_status_display()})'


class PaymentSettings(models.Model):
    """One row: where students pay and the terms they accept. Edited from Admin → Payments & terms."""
    afrimoney_number = models.CharField(max_length=30, blank=True)
    afrimoney_name = models.CharField('Afrimoney account name', max_length=100, blank=True)
    orange_money_number = models.CharField(max_length=30, blank=True)
    orange_money_name = models.CharField('Orange Money account name', max_length=100, blank=True)
    afrimoney_steps = models.TextField(blank=True, help_text='Step-by-step for Afrimoney, one step per line (optional).')
    orange_money_steps = models.TextField(blank=True, help_text='Step-by-step for Orange Money, one step per line (optional).')
    # Card: no gateway yet. A card-payment link from the bank or a payment service, and/or how to pay by card
    card_link = models.URLField('card payment link', max_length=500, blank=True,
                                help_text='A hosted card-payment page (from your bank or payment service). Students pay there, then upload the confirmation.')
    card_label = models.CharField(max_length=60, blank=True, default='Visa / Mastercard')
    card_steps = models.TextField(blank=True, help_text='How to pay by card, one step per line (e.g. at the ADRAM office).')
    instructions = models.TextField(blank=True, help_text='How to pay, shown on the payment page.')
    terms = models.TextField('terms and conditions', blank=True)
    updated_at = models.DateTimeField(auto_now=True)
    updated_by = models.ForeignKey(settings.AUTH_USER_MODEL, null=True, blank=True, on_delete=models.SET_NULL, related_name='+')

    class Meta:
        verbose_name = verbose_name_plural = 'payment settings'

    @classmethod
    def load(cls):
        return cls.objects.first() or cls.objects.create(terms=DEFAULT_TERMS)

    def methods(self):
        """The ways to pay that ADRAM has set up, for every payment page (courses and scholarship services)."""
        steps = lambda text: [line.strip() for line in (text or '').splitlines() if line.strip()]  # noqa: E731
        found = []
        if self.orange_money_number:
            found.append({'id': 'orange_money', 'kind': 'mobile', 'label': 'Orange Money', 'number': self.orange_money_number,
                          'name': self.orange_money_name, 'steps': steps(self.orange_money_steps)})
        if self.afrimoney_number:
            found.append({'id': 'afrimoney', 'kind': 'mobile', 'label': 'Afrimoney', 'number': self.afrimoney_number,
                          'name': self.afrimoney_name, 'steps': steps(self.afrimoney_steps)})
        if self.card_link or self.card_steps:
            found.append({'id': 'card', 'kind': 'card', 'label': 'Card', 'cards': self.card_label or 'Visa / Mastercard',
                          'link': self.card_link, 'steps': steps(self.card_steps)})
        return found


class StaffNote(models.Model):
    """Private to staff; the student never sees these."""
    student = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name='staff_notes')
    author = models.ForeignKey(settings.AUTH_USER_MODEL, null=True, on_delete=models.SET_NULL, related_name='+')
    body = models.TextField()
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ['-created_at']


class PortalEvent(models.Model):
    """What a student did on the website and in their portal (for the admin's activity timeline)."""
    VIEWED, OPENED_LINK, SAVED, UNSAVED, STARTED, STAGE, DOCUMENT, GOALS, SERVICE = (
        'viewed', 'opened_link', 'saved', 'unsaved', 'application_started', 'stage_changed', 'document_done', 'goals_updated',
        'service_requested')
    SERVICE_DECISION, TERMS, UPLOADED, PAYMENT = ('service_decision', 'terms_accepted', 'document_uploaded', 'payment_submitted')
    DOC_REVIEW, MILESTONE, TRAINING = 'document_reviewed', 'milestone_updated', 'training'
    KIND_CHOICES = [
        (VIEWED, 'Viewed a scholarship'),
        (OPENED_LINK, 'Opened an official website'),
        (SAVED, 'Saved a scholarship'),
        (UNSAVED, 'Removed a saved scholarship'),
        (STARTED, 'Started an application'),
        (STAGE, 'Application stage changed'),
        (DOCUMENT, 'Ticked off a document'),
        (GOALS, 'Updated study goals'),
        (SERVICE, 'Asked ADRAM to apply'),
        (SERVICE_DECISION, 'ADRAM updated the application request'),
        (TERMS, 'Accepted the terms and conditions'),
        (UPLOADED, 'Uploaded a document'),
        (PAYMENT, 'Submitted a payment receipt'),
        (DOC_REVIEW, 'ADRAM reviewed a document'),
        (MILESTONE, 'ADRAM updated the progress timeline'),
        (TRAINING, 'Training programme'),
    ]

    user = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name='portal_events')
    kind = models.CharField(max_length=30, choices=KIND_CHOICES)
    scholarship = models.ForeignKey(Scholarship, null=True, blank=True, on_delete=models.SET_NULL, related_name='+')
    label = models.CharField(max_length=200, blank=True, help_text='What it was about, e.g. the scholarship name.')
    detail = models.CharField(max_length=300, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ['-created_at']
        indexes = [models.Index(fields=['user', '-created_at'])]


class ResultFile(models.Model):
    """The scholarship result (award letter, screenshot…) that ADRAM uploads for the student to see."""
    application = models.ForeignKey(Application, on_delete=models.CASCADE, related_name='result_files')
    title = models.CharField(max_length=150, blank=True)
    file = models.FileField(upload_to=result_upload_to, storage=private_storage)
    file_name = models.CharField(max_length=200, blank=True)
    uploaded_at = models.DateTimeField(auto_now_add=True)
    uploaded_by = models.ForeignKey(settings.AUTH_USER_MODEL, null=True, blank=True, on_delete=models.SET_NULL, related_name='+')

    class Meta:
        ordering = ['uploaded_at']


class TrainingEnrollment(models.Model):
    """A student signed up for a training programme. Only enrolled programmes appear in their portal."""
    REQUESTED, ACTIVE, COMPLETED, CANCELLED, DECLINED = 'requested', 'active', 'completed', 'cancelled', 'declined'
    STATUS_CHOICES = [
        (REQUESTED, 'Enrollment requested'),
        (ACTIVE, 'Enrolled'),
        (COMPLETED, 'Completed'),
        (CANCELLED, 'Cancelled'),
        (DECLINED, 'Not accepted'),
    ]

    student = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name='training_enrollments')
    course = models.ForeignKey(Course, on_delete=models.CASCADE, related_name='enrollments')
    status = models.CharField(max_length=15, choices=STATUS_CHOICES, default=REQUESTED)
    start_date = models.DateField(null=True, blank=True)
    note = models.CharField(max_length=500, blank=True, help_text='Message from ADRAM, shown to the student (class times, what to bring…).')
    # Who confirmed or declined the request, and when (for the admin's records)
    decided_at = models.DateTimeField(null=True, blank=True)
    decided_by = models.ForeignKey(settings.AUTH_USER_MODEL, null=True, blank=True, on_delete=models.SET_NULL, related_name='+')
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ['-created_at']
        constraints = [models.UniqueConstraint(fields=['student', 'course'], name='unique_training_enrollment')]


class Conversation(models.Model):
    """
    A message thread between a person and ADRAM.
    - member empty: the thread with "the ADRAM team". Every administrator can read and reply, so a student never has
      to know who is on duty. One per person.
    - member set: a direct thread with one team member (started from their portfolio page). That member replies from
      their own inbox. One per person and member.
    """
    user = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name='conversations')
    member = models.ForeignKey(settings.AUTH_USER_MODEL, null=True, blank=True, on_delete=models.CASCADE,
                               related_name='member_conversations', help_text='Empty = the whole ADRAM team.')
    created_at = models.DateTimeField(auto_now_add=True)
    last_message_at = models.DateTimeField(null=True, blank=True, db_index=True)

    class Meta:
        ordering = ['-last_message_at']
        constraints = [
            models.UniqueConstraint(fields=['user', 'member'], name='one_thread_per_member'),
            models.UniqueConstraint(fields=['user'], condition=models.Q(member__isnull=True), name='one_team_thread_per_person'),
        ]

    def __str__(self):
        return f'Conversation with {self.user.email}' + (f' and {self.member.email}' if self.member_id else '')


class Message(models.Model):
    MAX_LENGTH = 4000
    FILE, IMAGE, AUDIO = 'file', 'image', 'audio'
    KIND_CHOICES = [(FILE, 'File'), (IMAGE, 'Image'), (AUDIO, 'Voice message')]

    conversation = models.ForeignKey(Conversation, on_delete=models.CASCADE, related_name='messages')
    # Kept if the sending admin's account is later deleted; `from_staff` still says which side wrote it.
    sender = models.ForeignKey(settings.AUTH_USER_MODEL, null=True, blank=True, on_delete=models.SET_NULL, related_name='+')
    from_staff = models.BooleanField(default=False)
    body = models.TextField(max_length=MAX_LENGTH, blank=True)  # optional when there's an attachment
    # One optional attachment: a file, an image or a recorded voice message. Private, like receipts.
    attachment = models.FileField(upload_to=message_upload_to, storage=private_storage, blank=True)
    attachment_name = models.CharField(max_length=200, blank=True)
    attachment_kind = models.CharField(max_length=10, choices=KIND_CHOICES, blank=True)
    attachment_size = models.PositiveIntegerField(null=True, blank=True)
    duration = models.PositiveSmallIntegerField(null=True, blank=True, help_text='Length of a voice message, in seconds.')
    # A call log entry ("Missed video call", "Voice call · 2:31") instead of text or a file.
    call = models.OneToOneField('Call', null=True, blank=True, on_delete=models.SET_NULL, related_name='log')
    created_at = models.DateTimeField(auto_now_add=True)
    # When the other side first opened it (for staff messages: the user; for user messages: any administrator).
    read_at = models.DateTimeField(null=True, blank=True)

    class Meta:
        ordering = ['created_at']
        indexes = [models.Index(fields=['conversation', 'created_at']), models.Index(fields=['from_staff', 'read_at'])]

    @property
    def preview(self):
        """A one-line summary for lists and emails."""
        if self.call_id:
            return call_summary(self.call)
        if self.body:
            return self.body
        if self.attachment_kind == self.AUDIO:
            return f'Voice message ({self.duration // 60}:{self.duration % 60:02d})' if self.duration else 'Voice message'
        if self.attachment_kind == self.IMAGE:
            return f'Photo: {self.attachment_name}'
        return f'File: {self.attachment_name}' if self.attachment_name else ''

    def __str__(self):
        return f'{"ADRAM" if self.from_staff else self.conversation.user.email}: {self.preview[:40]}'


class Call(models.Model):
    """
    A voice or video call inside a conversation. The browsers talk to each other directly (WebRTC);
    this row only carries the connection offer/answer and the ringing -> answered -> ended status.
    A person's call rings every administrator, and the first one to answer takes it.
    """
    AUDIO, VIDEO = 'audio', 'video'
    KIND_CHOICES = [(AUDIO, 'Voice call'), (VIDEO, 'Video call')]
    RINGING, ACCEPTED, DECLINED, ENDED, MISSED, CANCELLED = 'ringing', 'accepted', 'declined', 'ended', 'missed', 'cancelled'
    STATUS_CHOICES = [(RINGING, 'Ringing'), (ACCEPTED, 'In progress'), (DECLINED, 'Declined'), (ENDED, 'Ended'),
                      (MISSED, 'Missed'), (CANCELLED, 'Cancelled')]
    OPEN = (RINGING, ACCEPTED)
    RING_SECONDS = 45

    conversation = models.ForeignKey(Conversation, on_delete=models.CASCADE, related_name='calls')
    caller = models.ForeignKey(settings.AUTH_USER_MODEL, null=True, on_delete=models.SET_NULL, related_name='+')
    from_staff = models.BooleanField(default=False)
    kind = models.CharField(max_length=10, choices=KIND_CHOICES, default=AUDIO)
    status = models.CharField(max_length=10, choices=STATUS_CHOICES, default=RINGING, db_index=True)
    offer = models.TextField()                 # the caller's session description (with its network candidates)
    answer = models.TextField(blank=True)      # the answerer's
    answered_by = models.ForeignKey(settings.AUTH_USER_MODEL, null=True, blank=True, on_delete=models.SET_NULL, related_name='+')
    created_at = models.DateTimeField(auto_now_add=True)
    answered_at = models.DateTimeField(null=True, blank=True)
    ended_at = models.DateTimeField(null=True, blank=True)

    class Meta:
        ordering = ['-created_at']

    @property
    def duration(self):
        if self.answered_at and self.ended_at:
            return max(0, int((self.ended_at - self.answered_at).total_seconds()))
        return None

    def __str__(self):
        return f'{self.get_kind_display()} ({self.status}) with {self.conversation.user.email}'


def call_summary(call):
    """e.g. "Video call (2:31)", "Missed voice call", "Declined video call"."""
    kind = 'video call' if call.kind == Call.VIDEO else 'voice call'
    if call.status == Call.ENDED and call.duration is not None:
        return f'{kind.capitalize()} ({call.duration // 60}:{call.duration % 60:02d})'
    if call.status == Call.DECLINED:
        return f'Declined {kind}'
    if call.status in (Call.MISSED, Call.CANCELLED):
        return f'Missed {kind}'
    return kind.capitalize()


class IntakeForm(models.Model):
    """
    One row: the application form students fill in once ADRAM has confirmed their payment (portal/intake.py).
    `sections` is a list of {id, title, description, fields: [{id, type, label, help, required, options, width, prefill}]}.
    Edited from Admin → Application form.
    """
    title = models.CharField(max_length=150, default='Scholarship application form')
    intro = models.TextField(blank=True, max_length=2000)
    sections = models.JSONField(default=list, blank=True)
    declaration = models.TextField(blank=True, max_length=1000)
    # How students may complete it: online in the portal, and/or download, fill in by hand and upload a scan
    allow_online = models.BooleanField(default=True)
    allow_upload = models.BooleanField(default=True)
    updated_at = models.DateTimeField(auto_now=True)
    updated_by = models.ForeignKey(settings.AUTH_USER_MODEL, null=True, blank=True, on_delete=models.SET_NULL, related_name='+')

    class Meta:
        verbose_name = verbose_name_plural = 'application form'

    @classmethod
    def load(cls):
        form = cls.objects.first()
        if form is None:
            from .intake import DEFAULT_FORM
            form = cls.objects.create(**DEFAULT_FORM)
        return form


class IntakeSubmission(models.Model):
    """A student's answers to the application form, for one paid application."""
    DRAFT, SUBMITTED, RETURNED, REVIEWED = 'draft', 'submitted', 'returned', 'reviewed'
    STATUS_CHOICES = [(DRAFT, 'Not submitted yet'), (SUBMITTED, 'Submitted'), (RETURNED, 'Returned for changes'), (REVIEWED, 'Approved by ADRAM')]

    ONLINE, UPLOAD = 'online', 'upload'
    METHOD_CHOICES = [(ONLINE, 'Filled in online'), (UPLOAD, 'Scanned paper form')]

    application = models.OneToOneField(Application, on_delete=models.CASCADE, related_name='intake')
    status = models.CharField(max_length=10, choices=STATUS_CHOICES, default=DRAFT)
    method = models.CharField(max_length=10, choices=METHOD_CHOICES, default=ONLINE)
    reminded_at = models.DateTimeField(null=True, blank=True)
    answers = models.JSONField(default=dict, blank=True)
    # The form as it was when the student last saved: later edits to the form don't scramble a submitted copy
    form = models.JSONField(default=dict, blank=True)
    declared = models.BooleanField(default=False)
    submitted_at = models.DateTimeField(null=True, blank=True)
    return_note = models.TextField(blank=True, max_length=2000, help_text='What the student should change.')
    flagged_fields = models.JSONField(default=list, blank=True, help_text='Questions ADRAM asked the student to check.')
    # The approval: who signed it, as what, and their signature (a small PNG as a data: URL)
    approved_name = models.CharField(max_length=120, blank=True)
    approved_title = models.CharField(max_length=120, blank=True)
    approved_signature = models.TextField(blank=True)
    reviewed_at = models.DateTimeField(null=True, blank=True)
    reviewed_by = models.ForeignKey(settings.AUTH_USER_MODEL, null=True, blank=True, on_delete=models.SET_NULL, related_name='+')
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    def __str__(self):
        return f'Form for {self.application} ({self.get_status_display()})'


class IntakeFile(models.Model):
    """A page (or the whole PDF) of a paper application form the student filled in by hand and uploaded."""
    submission = models.ForeignKey(IntakeSubmission, on_delete=models.CASCADE, related_name='files')
    file = models.FileField(upload_to=intake_upload_to, storage=private_storage)
    file_name = models.CharField(max_length=200)
    size = models.PositiveIntegerField(default=0)
    uploaded_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ['id']


class StaffSignature(models.Model):
    """An administrator's saved signature and job title, reused when they approve application forms."""
    user = models.OneToOneField(settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name='staff_signature')
    image = models.TextField()  # a PNG as a data: URL
    title = models.CharField(max_length=120, blank=True)
    updated_at = models.DateTimeField(auto_now=True)



class AgreementTemplate(models.Model):
    """
    One row: the "Scholarship Application and Success-Based Service Agreement" students sign once a scholarship is
    awarded (portal/agreements.py). Edited in Admin → Service agreements. `clauses` is [{id, title, body}];
    {fee}, {student_name}, {reference} and {company_name} in a clause are filled in for each student.
    """
    title = models.CharField(max_length=200, default='Scholarship Application and Success-Based Service Agreement')
    subtitle = models.CharField(max_length=200, blank=True, default='International Scholarship Consultancy & Student Placement Services')
    company_name = models.CharField(max_length=150, default='ADRAM TECHNOLOGIES')
    company_description = models.TextField(blank=True, max_length=600)
    company_address = models.CharField(max_length=300, blank=True)
    representative_name = models.CharField(max_length=120, blank=True)
    representative_position = models.CharField(max_length=120, blank=True)
    company_signature = models.TextField(blank=True)  # a PNG as a data: URL
    company_stamp = models.TextField(blank=True)      # a PNG/JPEG as a data: URL
    clauses = models.JSONField(default=list, blank=True)
    # The service fee: the admin fills in the amount for each student (this default is used when one is sent);
    # the first instalment is first_percent of it and the second the rest.
    currency = models.CharField(max_length=12, default='NLe')
    default_amount = models.DecimalField(max_digits=12, decimal_places=2, null=True, blank=True)
    first_percent = models.PositiveSmallIntegerField(default=60)
    admin_fields = models.JSONField(default=list, blank=True)  # [{id, label, type, required}] ADRAM fills in for each student
    auto_issue = models.BooleanField(default=True, help_text='Send the agreement automatically with the application form (when the payment is confirmed).')
    # [{id, label, type, required, prefill}]: the "Student information" the student confirms, and what they fill in
    # beside their signature (e.g. Full name, Date). Empty = the defaults in agreements.py.
    student_fields = models.JSONField(default=list, blank=True)
    signature_fields = models.JSONField(default=list, blank=True)
    wording = models.JSONField(default=dict, blank=True)  # {key: text}; missing keys use agreements.DEFAULT_WORDING
    require_read = models.BooleanField(default=True, help_text='The student must scroll to the end before they can sign.')
    allow_online = models.BooleanField(default=True, help_text='Students can sign online.')
    allow_upload = models.BooleanField(default=True, help_text='Students can download it, sign by hand and upload a scan.')
    updated_at = models.DateTimeField(auto_now=True)
    updated_by = models.ForeignKey(settings.AUTH_USER_MODEL, null=True, blank=True, on_delete=models.SET_NULL, related_name='+')

    class Meta:
        verbose_name = verbose_name_plural = 'service agreement template'

    @classmethod
    def load(cls):
        row = cls.objects.first()
        if row is None:
            from .agreements import DEFAULT_AGREEMENT
            row = cls.objects.create(**DEFAULT_AGREEMENT)
        return row


class StudentAgreement(models.Model):
    """One student's service agreement: a frozen copy of the text, the fee, and both signatures."""
    PENDING, UPLOADED, SIGNED, VOID = 'pending', 'uploaded', 'signed', 'void'
    STATUS_CHOICES = [(PENDING, 'Waiting for the student to sign'), (UPLOADED, 'Signed copy to check'), (SIGNED, 'Signed'), (VOID, 'Cancelled')]
    ONLINE, UPLOAD = 'online', 'upload'

    application = models.OneToOneField(Application, on_delete=models.CASCADE, related_name='agreement')
    status = models.CharField(max_length=10, choices=STATUS_CHOICES, default=PENDING, db_index=True)
    content = models.JSONField(default=dict)  # the template as it was when issued (or last re-issued)
    fee = models.CharField(max_length=80, blank=True)  # the total as shown, e.g. "NLe 25,000" (kept in step with amount)
    currency = models.CharField(max_length=12, blank=True)
    amount = models.DecimalField(max_digits=12, decimal_places=2, null=True, blank=True)
    first_percent = models.PositiveSmallIntegerField(default=60)
    values = models.JSONField(default=dict, blank=True)  # what ADRAM filled in for this student (template admin_fields)
    effective_date = models.DateField(null=True, blank=True, help_text='Empty = the date the student signs.')
    # Until the student signs, the agreement follows the template, except what ADRAM set for this student only
    own_text = models.BooleanField(default=False, help_text='The text was changed for this student.')
    own_fee = models.BooleanField(default=False, help_text='The fee was set for this student.')
    # Signed online, or on paper: downloaded, signed by hand and uploaded, then accepted by ADRAM
    method = models.CharField(max_length=10, default='online')
    uploaded_at = models.DateTimeField(null=True, blank=True)
    return_note = models.CharField(max_length=500, blank=True)
    accepted_at = models.DateTimeField(null=True, blank=True)
    accepted_by = models.ForeignKey(settings.AUTH_USER_MODEL, null=True, blank=True, on_delete=models.SET_NULL, related_name='+')
    issued_at = models.DateTimeField(auto_now_add=True)
    issued_by = models.ForeignKey(settings.AUTH_USER_MODEL, null=True, blank=True, on_delete=models.SET_NULL, related_name='+')
    reminded_at = models.DateTimeField(null=True, blank=True)
    # The student's details and signature, as given when signing
    student_details = models.JSONField(default=dict, blank=True)
    signature_details = models.JSONField(default=dict, blank=True)  # what the student filled in beside their signature
    student_signature = models.TextField(blank=True)
    signed_at = models.DateTimeField(null=True, blank=True)
    signed_ip = models.GenericIPAddressField(null=True, blank=True)
    signed_user_agent = models.CharField(max_length=300, blank=True)
    fingerprint = models.CharField(max_length=64, blank=True, help_text='SHA-256 of exactly what the student signed.')
    void_reason = models.CharField(max_length=300, blank=True)
    updated_at = models.DateTimeField(auto_now=True)

    @property
    def reference(self):
        return f'ADR-STU-{self.application_id:05d}'

    def __str__(self):
        return f'{self.reference} ({self.get_status_display()})'


class AgreementFile(models.Model):
    """A page (or the whole PDF) of the agreement the student printed, signed by hand and uploaded."""
    agreement = models.ForeignKey(StudentAgreement, on_delete=models.CASCADE, related_name='files')
    file = models.FileField(upload_to=agreement_upload_to, storage=private_storage)
    file_name = models.CharField(max_length=200)
    size = models.PositiveIntegerField(default=0)
    uploaded_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ['id']


class AgreementPayment(models.Model):
    """A payment of the service fee received from the student, recorded by ADRAM."""
    agreement = models.ForeignKey(StudentAgreement, on_delete=models.CASCADE, related_name='payments')
    amount = models.DecimalField(max_digits=12, decimal_places=2)
    paid_on = models.DateField()
    method = models.CharField(max_length=60, blank=True)
    reference = models.CharField(max_length=80, blank=True)
    note = models.CharField(max_length=300, blank=True)
    recorded_by = models.ForeignKey(settings.AUTH_USER_MODEL, null=True, blank=True, on_delete=models.SET_NULL, related_name='+')
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ['paid_on', 'id']
