from rest_framework import serializers

from catalog.models import DESTINATION_CHOICES, LEVELS
from catalog.serializers import SERVICE_FIELDS
from .models import (
    COUNSELLOR_DEFAULTS, Application, ApplicationDocument, Milestone, PaymentSettings, PortalEvent, ResultFile, ServiceRequest, StaffNote,
    StudyGoals, TrainingEnrollment,
)


class StudyGoalsSerializer(serializers.ModelSerializer):
    levels = serializers.ListField(child=serializers.ChoiceField(choices=LEVELS), required=False)
    destinations = serializers.ListField(child=serializers.ChoiceField(choices=[c for c, _ in DESTINATION_CHOICES]), required=False)

    class Meta:
        model = StudyGoals
        fields = ['levels', 'destinations', 'field_of_study', 'updated_at']
        read_only_fields = ['updated_at']


MAX_UPLOAD_MB = 10
ALLOWED_UPLOADS = {'.pdf', '.jpg', '.jpeg', '.png', '.webp', '.heic', '.doc', '.docx'}


def validate_upload(file):
    """Receipts and documents: a PDF, photo or Word file of at most 10 MB."""
    import os
    if os.path.splitext(file.name)[1].lower() not in ALLOWED_UPLOADS:
        raise serializers.ValidationError('Upload a PDF, a photo (JPG, PNG) or a Word document.')
    if file.size > MAX_UPLOAD_MB * 1024 * 1024:
        raise serializers.ValidationError(f'Files can be up to {MAX_UPLOAD_MB} MB.')
    return file


class DocumentSerializer(serializers.ModelSerializer):
    has_file = serializers.SerializerMethodField()
    review_status_display = serializers.CharField(source='get_review_status_display', read_only=True)
    review_tag_display = serializers.CharField(source='get_review_tag_display', read_only=True)

    class Meta:
        model = ApplicationDocument
        fields = ['id', 'name', 'is_done', 'done_at', 'order', 'has_file', 'file_name', 'uploaded_at',
                  'review_status', 'review_status_display', 'review_tag', 'review_tag_display', 'review_note',
                  'reviewed_at', 'resubmitted']
        read_only_fields = ['id', 'done_at', 'file_name', 'uploaded_at', 'review_status', 'review_tag', 'review_note',
                            'reviewed_at', 'resubmitted']

    def get_has_file(self, obj):
        return bool(obj.file)


class DocumentReviewSerializer(serializers.Serializer):
    """Staff: accept a document, return it with a tag and note, or clear the review ('pending')."""
    status = serializers.ChoiceField(choices=['accepted', 'returned', 'pending'])
    tag = serializers.ChoiceField(choices=ApplicationDocument.RETURN_TAGS, required=False, allow_blank=True)
    note = serializers.CharField(max_length=500, required=False, allow_blank=True)

    def validate(self, attrs):
        if attrs['status'] == 'returned' and not attrs.get('tag'):
            raise serializers.ValidationError({'tag': 'Choose why the document is being returned.'})
        return attrs


class MilestoneSerializer(serializers.ModelSerializer):
    status_display = serializers.CharField(source='get_status_display', read_only=True)

    class Meta:
        model = Milestone
        fields = ['id', 'title', 'status', 'status_display', 'due_date', 'note', 'completed_at', 'order', 'updated_at']
        read_only_fields = ['id', 'completed_at', 'order', 'updated_at']

class ResultFileSerializer(serializers.ModelSerializer):
    kind = serializers.SerializerMethodField()

    class Meta:
        model = ResultFile
        fields = ['id', 'title', 'file_name', 'kind', 'uploaded_at']

    def get_kind(self, obj):
        """'image' files get a thumbnail in the portal; everything else is a file tile."""
        name = (obj.file_name or obj.file.name).lower()
        return 'image' if name.endswith(('.jpg', '.jpeg', '.png', '.webp', '.gif', '.heic')) else 'pdf' if name.endswith('.pdf') else 'file'


class ResultFileUploadSerializer(serializers.Serializer):
    file = serializers.FileField(validators=[validate_upload])
    title = serializers.CharField(max_length=150, required=False, allow_blank=True)


class DocumentUploadSerializer(serializers.Serializer):
    file = serializers.FileField(validators=[validate_upload])


class PaymentSettingsSerializer(serializers.ModelSerializer):
    class Meta:
        model = PaymentSettings
        fields = ['afrimoney_number', 'afrimoney_name', 'orange_money_number', 'orange_money_name', 'instructions', 'terms', 'updated_at']
        read_only_fields = ['updated_at']


class ServiceSerializer(serializers.ModelSerializer):
    """
    The "ADRAM applies for you" request. Students only see the amount, guidelines, payment details and
    terms once ADRAM has approved the request (`unlocked`); staff always see everything.
    """
    status_display = serializers.CharField(source='get_status_display', read_only=True)
    payment_method_display = serializers.CharField(source='get_payment_method_display', read_only=True)
    reference = serializers.CharField(read_only=True)
    has_receipt = serializers.SerializerMethodField()
    unlocked = serializers.SerializerMethodField()
    payment = serializers.SerializerMethodField()

    UNLOCKED = {ServiceRequest.APPROVED, ServiceRequest.PAYMENT_SUBMITTED, ServiceRequest.PAYMENT_REJECTED, ServiceRequest.PAID}
    PRIVATE_UNTIL_UNLOCKED = ['amount', 'guidelines', 'payment']

    class Meta:
        model = ServiceRequest
        fields = [
            'id', 'status', 'status_display', 'reference', 'amount', 'guidelines', 'decision_note', 'requested_at',
            'approved_at', 'terms_accepted_at', 'payment_method', 'payment_method_display', 'transaction_id',
            'has_receipt', 'receipt_name', 'payment_submitted_at', 'verified_at', 'unlocked', 'payment',
        ]

    def get_has_receipt(self, obj):
        return bool(obj.receipt)

    def get_unlocked(self, obj):
        return obj.status in self.UNLOCKED

    def get_payment(self, obj):
        """Where to pay and the terms (the same for every application)."""
        return PaymentSettingsSerializer(PaymentSettings.load()).data

    def to_representation(self, obj):
        data = super().to_representation(obj)
        if not self.context.get('staff') and not data['unlocked']:
            for field in self.PRIVATE_UNTIL_UNLOCKED:
                data[field] = None
        return data


class PaymentSubmitSerializer(serializers.Serializer):
    payment_method = serializers.ChoiceField(choices=ServiceRequest.METHOD_CHOICES)
    transaction_id = serializers.CharField(max_length=100)
    receipt = serializers.FileField(validators=[validate_upload])


class ServiceDecisionSerializer(serializers.Serializer):
    """Staff decisions: approve (amount + guidelines), decline, confirm_payment or reject_payment (with a note)."""
    action = serializers.ChoiceField(choices=['approve', 'decline', 'confirm_payment', 'reject_payment'])
    amount = serializers.DecimalField(max_digits=12, decimal_places=2, min_value=0, required=False)
    guidelines = serializers.CharField(required=False, allow_blank=True)
    note = serializers.CharField(required=False, allow_blank=True)

    def validate(self, attrs):
        if attrs['action'] == 'approve' and attrs.get('amount') is None:
            raise serializers.ValidationError({'amount': 'Set the amount the student should pay (0 if it’s free).'})
        return attrs


class ApplicationSerializer(serializers.ModelSerializer):
    stage_display = serializers.CharField(source='get_stage_display', read_only=True)
    scholarship_slug = serializers.CharField(source='scholarship.slug', read_only=True, default=None)
    country = serializers.CharField(source='scholarship.country', read_only=True, default=None)
    country_name = serializers.CharField(source='scholarship.get_country_display', read_only=True, default=None)
    documents = DocumentSerializer(many=True, read_only=True)
    milestones = MilestoneSerializer(many=True, read_only=True)
    result_files = serializers.SerializerMethodField()
    counsellor_message = serializers.SerializerMethodField()
    current_next_step = serializers.SerializerMethodField()
    updated_by_name = serializers.SerializerMethodField()
    scholarship_info = serializers.SerializerMethodField()
    service = serializers.SerializerMethodField()

    class Meta:
        model = Application
        fields = [
            'id', 'scholarship_slug', 'scholarship_name', 'country', 'country_name', 'stage', 'stage_display',
            'deadline', 'next_step', 'counsellor_note', 'advice_stage', 'counsellor_message', 'current_next_step', 'result_message', 'result_expected_on', 'interview_at', 'interview_link',
            'interview_note', 'result_files', 'service_requested_at', 'service', 'documents', 'milestones',
            'scholarship_info',
            'created_at', 'updated_at', 'updated_by_name',
        ]
        read_only_fields = ['id', 'scholarship_name', 'service_requested_at', 'advice_stage', 'created_at', 'updated_at']

    def get_updated_by_name(self, obj):
        return obj.updated_by.get_full_name() if obj.updated_by else None

    def _advice_current(self, obj):
        return obj.advice_stage == obj.stage

    def get_counsellor_message(self, obj):
        """The note ADRAM wrote for this outcome, or the standard message for it."""
        if obj.counsellor_note and self._advice_current(obj):
            return obj.counsellor_note
        return COUNSELLOR_DEFAULTS.get(obj.stage, '')

    def get_current_next_step(self, obj):
        return obj.next_step if self._advice_current(obj) else ''

    def get_result_files(self, obj):
        return ResultFileSerializer(obj.result_files.all(), many=True).data

    def validate_interview_link(self, value):
        if value and not value.lower().startswith(('https://', 'http://')):
            raise serializers.ValidationError('Use a full web link starting with https://')
        return value

    def get_service(self, obj):
        service = getattr(obj, 'service', None)
        return ServiceSerializer(service, context=self.context).data if service else None

    def get_scholarship_info(self, obj):
        """The scholarship's official deadline, key dates and the admin's "ADRAM applies for you" settings."""
        s = obj.scholarship
        if not s:
            return None
        return {'deadline': s.deadline, 'application_window': s.application_window, 'timeline': s.timeline,
                **{field: getattr(s, field) for field in SERVICE_FIELDS}}


class StudentApplicationSerializer(ApplicationSerializer):
    """
    Students move their own application along and set its deadline; advice and results are staff-only.
    When ADRAM is applying for them, only ADRAM changes the stage (so the result always comes from ADRAM).
    """
    class Meta(ApplicationSerializer.Meta):
        read_only_fields = ApplicationSerializer.Meta.read_only_fields + [
            'next_step', 'counsellor_note', 'result_message', 'result_expected_on', 'interview_at', 'interview_link', 'interview_note',
        ]

    def validate_stage(self, value):
        application = self.instance
        if application and value != application.stage and getattr(application, 'service', None):
            raise serializers.ValidationError('ADRAM updates the stage of applications it is handling for you.')
        return value


class BoardApplicationSerializer(ApplicationSerializer):
    """Applications across all students (the admin's tracker)."""
    student_id = serializers.IntegerField(source='student.id', read_only=True)
    student_name = serializers.CharField(source='student.get_full_name', read_only=True)
    student_email = serializers.CharField(source='student.email', read_only=True)

    class Meta(ApplicationSerializer.Meta):
        fields = ApplicationSerializer.Meta.fields + ['student_id', 'student_name', 'student_email']


class StaffApplicationCreateSerializer(serializers.Serializer):
    """Staff add an application for a student: a listed scholarship (slug) or any other by name."""
    scholarship_slug = serializers.SlugField(required=False, allow_blank=True)
    scholarship_name = serializers.CharField(max_length=200, required=False, allow_blank=True)
    stage = serializers.ChoiceField(choices=Application.STAGE_CHOICES, default=Application.INTERESTED)
    deadline = serializers.DateField(required=False, allow_null=True)
    next_step = serializers.CharField(max_length=300, required=False, allow_blank=True)
    counsellor_note = serializers.CharField(required=False, allow_blank=True)

    def validate(self, attrs):
        if not attrs.get('scholarship_slug') and not attrs.get('scholarship_name', '').strip():
            raise serializers.ValidationError({'scholarship_slug': 'Choose a scholarship or type its name.'})
        return attrs


class StaffNoteSerializer(serializers.ModelSerializer):
    author_name = serializers.SerializerMethodField()

    class Meta:
        model = StaffNote
        fields = ['id', 'body', 'author_name', 'created_at']
        read_only_fields = ['id', 'author_name', 'created_at']

    def get_author_name(self, obj):
        return obj.author.get_full_name() if obj.author else 'Former staff member'


class PortalEventSerializer(serializers.ModelSerializer):
    kind_display = serializers.CharField(source='get_kind_display', read_only=True)
    scholarship_slug = serializers.CharField(source='scholarship.slug', read_only=True, default=None)

    class Meta:
        model = PortalEvent
        fields = ['id', 'kind', 'kind_display', 'label', 'detail', 'scholarship_slug', 'created_at']


class ReorderIdsSerializer(serializers.Serializer):
    ids = serializers.ListField(child=serializers.IntegerField(), allow_empty=False, max_length=100)


class EnrollmentSerializer(serializers.ModelSerializer):
    status_display = serializers.CharField(source='get_status_display', read_only=True)
    course = serializers.SerializerMethodField()

    class Meta:
        model = TrainingEnrollment
        fields = ['id', 'status', 'status_display', 'start_date', 'note', 'course', 'created_at', 'updated_at']
        read_only_fields = ['id', 'created_at', 'updated_at']

    def get_course(self, obj):
        c = obj.course
        return {'slug': c.slug, 'title': c.title, 'icon': c.icon, 'summary': c.summary, 'topics': c.topics,
                'duration': c.duration, 'fee': c.fee, 'next_intake': c.next_intake}
