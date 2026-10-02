"""
/api/v1/portal/me/...     the signed-in student's own portal
/api/v1/portal/staff/...  administrators viewing and managing any student's portal
/api/v1/portal/files/...  private uploads (receipts, documents) for their owner and administrators
"""
import logging

from django.contrib.auth import get_user_model
from django.db import transaction
from django.db.models import Count, Q
from django.http import FileResponse, Http404
from django.shortcuts import get_object_or_404
from django.utils import timezone
from rest_framework import generics, serializers, status
from rest_framework.parsers import FormParser, MultiPartParser
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView

from accounts.models import ActivityLog
from accounts.permissions import IsAdmin
from catalog.models import LEVELS, Scholarship
from catalog.serializers import ScholarshipSerializer
from lms import audit

from . import emails
from .models import (
    DEFAULT_MILESTONES, Application, ApplicationDocument, Message, Milestone, PaymentSettings, PortalEvent, SavedScholarship,
    ResultFile, ServiceRequest, StaffNote, StudyGoals, TrainingEnrollment,
)
from .serializers import (
    ApplicationSerializer, BoardApplicationSerializer, EnrollmentSerializer, DocumentReviewSerializer, DocumentSerializer, DocumentUploadSerializer,
    MilestoneSerializer, PaymentSettingsSerializer, ReorderIdsSerializer, ResultFileSerializer, ResultFileUploadSerializer,
    PaymentSubmitSerializer, PortalEventSerializer, ServiceDecisionSerializer, StaffApplicationCreateSerializer,
    StaffNoteSerializer, StudentApplicationSerializer, StudyGoalsSerializer,
)
from .services import recommended_for, start_application, track

User = get_user_model()
logger = logging.getLogger(__name__)

# Requests the admin has to act on: new ones, and payments waiting to be checked.
TO_REVIEW = [ServiceRequest.REQUESTED, ServiceRequest.PAYMENT_SUBMITTED]
# Stages that tell the student where their result stands (emailed when ADRAM sets them).
RESULT_STAGES = {Application.SUBMITTED, Application.INTERVIEW, Application.ACCEPTED, Application.UNSUCCESSFUL}
FINAL_RESULTS = {Application.ACCEPTED, Application.UNSUCCESSFUL}
# Uploaded documents on "ADRAM applies for you" applications that nobody has reviewed yet.
DOCS_TO_CHECK = Q(file__gt='', review_status='', application__service__isnull=False)


def published_scholarship(slug):
    return get_object_or_404(Scholarship, slug=slug, is_published=True)


def applications_of(user):
    return user.applications.select_related('scholarship', 'updated_by', 'service').prefetch_related('documents', 'milestones', 'result_files')


def portal_data(user, request, staff=False):
    """Everything on a student's portal page (the student's own view, or the admin's view of it)."""
    goals = StudyGoals.objects.filter(user=user).first()
    saved = SavedScholarship.objects.filter(user=user).select_related('scholarship')
    context = {'request': request}
    return {
        'goals': StudyGoalsSerializer(goals).data if goals else {'levels': [], 'destinations': [], 'field_of_study': ''},
        'saved': [{**ScholarshipSerializer(s.scholarship, context=context).data, 'saved_at': s.created_at} for s in saved],
        'applications': ApplicationSerializer(applications_of(user), many=True, context={**context, 'staff': staff}).data,
        'recommended': ScholarshipSerializer(recommended_for(user), many=True, context=context).data,
        # Training is the other side of the portal: it has its own endpoints (lms/enrolment.py), not part of this.
    }


def student_actions(user):
    """Things the student has to do, for the portal overview and the sidebar badge."""
    actions = []
    for a in user.applications.select_related('service', 'scholarship').prefetch_related('documents'):
        service = getattr(a, 'service', None)
        returned = [d.name for d in a.documents.all() if d.review_status == ApplicationDocument.RETURNED]
        missing = [d.name for d in a.documents.all() if not d.file]
        base = {'application_id': a.pk, 'scholarship': a.scholarship_name}
        if returned:
            actions.append({**base, 'kind': 'reupload', 'count': len(returned), 'items': returned})
        if not service:
            continue
        if service.status == ServiceRequest.APPROVED and not service.terms_accepted_at:
            actions.append({**base, 'kind': 'guidelines'})
        elif service.status in (ServiceRequest.APPROVED, ServiceRequest.PAYMENT_REJECTED):
            actions.append({**base, 'kind': 'payment', 'rejected': service.status == ServiceRequest.PAYMENT_REJECTED})
        elif service.status in (ServiceRequest.PAYMENT_SUBMITTED, ServiceRequest.PAID) and missing and a.stage not in (
                Application.ACCEPTED, Application.UNSUCCESSFUL, Application.WITHDRAWN):
            actions.append({**base, 'kind': 'upload', 'count': len(missing), 'items': missing})
        if a.stage == Application.INTERVIEW and (a.interview_at or a.interview_link):
            actions.append({**base, 'kind': 'interview', 'at': a.interview_at, 'link': a.interview_link})
        if a.stage == Application.ACCEPTED:
            actions.append({**base, 'kind': 'awarded'})
    return actions


class MySummaryView(APIView):
    """GET /portal/me/summary/ -> counts for the scholarships side's sidebar (training has /lms/me/summary/)."""
    permission_classes = [IsAuthenticated]

    def get(self, request):
        user = request.user
        return Response({
            'applications': user.applications.count(),
            'saved': user.saved_scholarships.count(),
            'actions': len(student_actions(user)),
            'messages_unread': Message.objects.filter(conversation__user=user, from_staff=True, read_at__isnull=True).count(),
        })


class MyActionsView(APIView):
    """GET /portal/me/actions/ -> what the student should do next."""
    permission_classes = [IsAuthenticated]

    def get(self, request):
        return Response(student_actions(request.user))


def discard(field):
    """Delete an uploaded file being replaced. If it can't be removed right now (e.g. Windows while someone is
    viewing it), keep going: a leftover file is better than a failed upload."""
    if not field:
        return
    try:
        field.delete(save=False)
    except OSError:
        logger.warning('Could not delete replaced upload %s', field.name)


def after_commit(func, *args):
    transaction.on_commit(lambda: func(*args))


# ---------------------------------------------------------------- The student's own portal

class MyPortalView(APIView):
    """GET /portal/me/"""
    permission_classes = [IsAuthenticated]

    def get(self, request):
        return Response(portal_data(request.user, request))


class MyGoalsView(APIView):
    """PUT /portal/me/goals/ {levels, destinations, field_of_study}"""
    permission_classes = [IsAuthenticated]

    def put(self, request):
        goals, _ = StudyGoals.objects.get_or_create(user=request.user)
        serializer = StudyGoalsSerializer(goals, data=request.data, partial=True)
        serializer.is_valid(raise_exception=True)
        serializer.save()
        track(request.user, PortalEvent.GOALS)
        return Response(serializer.data)


class MySavedView(APIView):
    """POST /portal/me/saved/ {slug}   DELETE /portal/me/saved/<slug>/"""
    permission_classes = [IsAuthenticated]

    def post(self, request):
        scholarship = published_scholarship(request.data.get('slug', ''))
        _, created = SavedScholarship.objects.get_or_create(user=request.user, scholarship=scholarship)
        if created:
            track(request.user, PortalEvent.SAVED, scholarship)
        return Response({'saved': True}, status=status.HTTP_201_CREATED if created else status.HTTP_200_OK)

    def delete(self, request, slug):
        deleted, _ = SavedScholarship.objects.filter(user=request.user, scholarship__slug=slug).delete()
        if deleted:
            track(request.user, PortalEvent.UNSAVED, Scholarship.objects.filter(slug=slug).first())
        return Response(status=status.HTTP_204_NO_CONTENT)


class MyApplicationsView(APIView):
    """POST /portal/me/applications/ {slug} -> start tracking an application (or get the existing one)."""
    permission_classes = [IsAuthenticated]

    def post(self, request):
        scholarship = published_scholarship(request.data.get('slug', ''))
        application, created = start_application(request.user, scholarship, by=request.user)
        return Response(ApplicationSerializer(application).data, status=status.HTTP_201_CREATED if created else status.HTTP_200_OK)


class ApplicationUpdateMixin:
    """PATCH/DELETE one application; stage changes go on the student's timeline."""

    def perform_update(self, serializer):
        old_stage = serializer.instance.stage
        old_interview = (serializer.instance.interview_at, serializer.instance.interview_link)
        advice_given = {'next_step', 'counsellor_note'} & set(serializer.validated_data)
        application = serializer.save(updated_by=self.request.user)
        if advice_given:  # the advice now belongs to the current stage
            application.advice_stage = application.stage
            application.save(update_fields=['advice_stage'])
        by_staff = self.request.user != application.student
        if application.stage == old_stage:
            # New or changed interview details are emailed even when the stage stays the same.
            interview = (application.interview_at, application.interview_link)
            if by_staff and application.stage == Application.INTERVIEW and interview != old_interview and any(interview):
                after_commit(emails.send_result_update, application)
            return
        who = f' by {self.request.user.get_full_name()}' if by_staff else ''
        track(application.student, PortalEvent.STAGE, application.scholarship, label=application.scholarship_name,
              detail=f'{dict(Application.STAGE_CHOICES)[old_stage]} → {application.get_stage_display()}{who}')
        if by_staff and application.stage in RESULT_STAGES:
            if application.stage in FINAL_RESULTS:
                # The work is finished either way, so the progress timeline is complete.
                application.milestones.exclude(status=Milestone.DONE).update(status=Milestone.DONE, completed_at=timezone.now())
            after_commit(emails.send_result_update, application)


class MyApplicationDetailView(ApplicationUpdateMixin, generics.RetrieveUpdateAPIView):
    """GET/PATCH /portal/me/applications/<id>/ {stage, deadline}"""
    permission_classes = [IsAuthenticated]
    serializer_class = StudentApplicationSerializer
    http_method_names = ['get', 'patch']

    def get_queryset(self):
        return applications_of(self.request.user)


class MyServiceRequestView(APIView):
    """POST /portal/me/applications/<id>/request-service/ -> the student asks ADRAM to apply for them."""
    permission_classes = [IsAuthenticated]

    def post(self, request, pk):
        application = get_object_or_404(request.user.applications.select_related('scholarship'), pk=pk)
        if application.scholarship and not application.scholarship.service_enabled:
            return Response({'detail': 'ADRAM doesn’t offer to apply for this scholarship. Please contact us.'},
                            status=status.HTTP_400_BAD_REQUEST)
        with transaction.atomic():
            service, created = ServiceRequest.objects.get_or_create(application=application)
            if created or service.status == ServiceRequest.DECLINED:  # a declined request can be made again
                service.status, service.decision_note = ServiceRequest.REQUESTED, ''
                service.save()
                application.service_requested_at = timezone.now()
                if application.stage == Application.INTERESTED:
                    application.stage = Application.PREPARING
                application.updated_by = request.user
                application.save()
                track(request.user, PortalEvent.SERVICE, application.scholarship, label=application.scholarship_name)
                after_commit(emails.notify_team, service, 'requested')
        return Response(ApplicationSerializer(applications_of(request.user).get(pk=pk)).data)


def my_service(request, pk, allowed):
    """The student's service request, if it is at one of the `allowed` steps."""
    service = get_object_or_404(ServiceRequest.objects.select_related('application'), application__pk=pk,
                                application__student=request.user)
    if service.status not in allowed:
        raise serializers.ValidationError({'detail': 'This step isn’t available for your application right now.'})
    return service


class MyServiceTermsView(APIView):
    """POST /portal/me/applications/<id>/service/accept-terms/"""
    permission_classes = [IsAuthenticated]

    def post(self, request, pk):
        service = my_service(request, pk, [ServiceRequest.APPROVED, ServiceRequest.PAYMENT_REJECTED])
        if not service.terms_accepted_at:
            service.terms_accepted_at = timezone.now()
            service.save(update_fields=['terms_accepted_at', 'updated_at'])
            track(request.user, PortalEvent.TERMS, service.application.scholarship, label=service.application.scholarship_name)
        return Response(ApplicationSerializer(applications_of(request.user).get(pk=pk)).data)


class MyServicePaymentView(APIView):
    """POST /portal/me/applications/<id>/service/payment/  multipart {payment_method, transaction_id, receipt}"""
    permission_classes = [IsAuthenticated]
    parser_classes = [MultiPartParser, FormParser]

    def post(self, request, pk):
        service = my_service(request, pk, [ServiceRequest.APPROVED, ServiceRequest.PAYMENT_REJECTED])
        if not service.terms_accepted_at:
            return Response({'detail': 'Please read and accept the terms and conditions first.'}, status=status.HTTP_400_BAD_REQUEST)
        serializer = PaymentSubmitSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        data = serializer.validated_data
        discard(service.receipt)  # replacing a receipt that wasn't confirmed
        service.payment_method, service.transaction_id = data['payment_method'], data['transaction_id'].strip()
        service.payer = (data.get('payer') or '').strip()[:100]
        service.receipt, service.receipt_name = data['receipt'], data['receipt'].name[:200]
        service.status, service.payment_submitted_at, service.decision_note = ServiceRequest.PAYMENT_SUBMITTED, timezone.now(), ''
        service.save()
        track(request.user, PortalEvent.PAYMENT, service.application.scholarship, label=service.application.scholarship_name,
              detail=f'{service.get_payment_method_display()} · {service.transaction_id}')
        after_commit(emails.notify_team, service, 'payment')
        return Response(ApplicationSerializer(applications_of(request.user).get(pk=pk)).data)


class DocumentViewsMixin:
    """Add, tick off, rename or remove checklist items on an application."""

    def add_document(self, application, request):
        serializer = DocumentSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        order = (application.documents.order_by('-order').values_list('order', flat=True).first() or 0) + 1
        serializer.save(application=application, order=order)
        return Response(serializer.data, status=status.HTTP_201_CREATED)

    def update_document(self, document, request):
        serializer = DocumentSerializer(document, data=request.data, partial=True)
        serializer.is_valid(raise_exception=True)
        was_done = document.is_done
        document = serializer.save()
        if document.is_done != was_done:
            document.done_at = timezone.now() if document.is_done else None
            document.save(update_fields=['done_at'])
            if document.is_done and request.user == document.application.student:
                track(request.user, PortalEvent.DOCUMENT, document.application.scholarship,
                      label=document.application.scholarship_name, detail=document.name)
        return Response(DocumentSerializer(document).data)

    def delete_document(self, document):
        discard(document.file)
        document.delete()
        return Response(status=status.HTTP_204_NO_CONTENT)


class MyDocumentsView(DocumentViewsMixin, APIView):
    """POST /portal/me/applications/<id>/documents/ {name}"""
    permission_classes = [IsAuthenticated]

    def post(self, request, pk):
        return self.add_document(get_object_or_404(request.user.applications, pk=pk), request)


class MyDocumentDetailView(DocumentViewsMixin, APIView):
    """PATCH/DELETE /portal/me/documents/<id>/"""
    permission_classes = [IsAuthenticated]

    def get_document(self, request, pk):
        return get_object_or_404(ApplicationDocument, pk=pk, application__student=request.user)

    def patch(self, request, pk):
        return self.update_document(self.get_document(request, pk), request)

    def delete(self, request, pk):
        return self.delete_document(self.get_document(request, pk))


class MyDocumentFileView(APIView):
    """POST /portal/me/documents/<id>/file/ multipart {file} (replaces any earlier upload);  DELETE removes it."""
    permission_classes = [IsAuthenticated]
    parser_classes = [MultiPartParser, FormParser]

    def get_document(self, request, pk):
        return get_object_or_404(ApplicationDocument.objects.select_related('application__scholarship'),
                                 pk=pk, application__student=request.user)

    LOCKED = 'ADRAM has already accepted this document, so it can’t be changed. Contact us if you need to replace it.'

    def post(self, request, pk):
        document = self.get_document(request, pk)
        if document.review_status == ApplicationDocument.ACCEPTED:
            return Response({'detail': self.LOCKED}, status=status.HTTP_400_BAD_REQUEST)
        serializer = DocumentUploadSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        upload = serializer.validated_data['file']
        discard(document.file)
        now = timezone.now()
        document.file, document.file_name, document.uploaded_at = upload, upload.name[:200], now
        document.is_done, document.done_at = True, document.done_at or now
        # A new upload goes back into ADRAM's review queue; the last return reason stays visible to staff.
        document.resubmitted = document.resubmitted or document.review_status == ApplicationDocument.RETURNED
        document.review_status = ''
        document.save()
        track(request.user, PortalEvent.UPLOADED, document.application.scholarship,
              label=document.application.scholarship_name, detail=document.name)
        return Response(DocumentSerializer(document).data)

    def delete(self, request, pk):
        document = self.get_document(request, pk)
        if document.review_status == ApplicationDocument.ACCEPTED:
            return Response({'detail': self.LOCKED}, status=status.HTTP_400_BAD_REQUEST)
        discard(document.file)
        document.file_name, document.uploaded_at, document.is_done, document.done_at = '', None, False, None
        document.save()
        return Response(DocumentSerializer(document).data)


class MyEventView(APIView):
    """POST /portal/me/events/ {kind: 'opened_link', slug} -> recorded when a student opens an official website."""
    permission_classes = [IsAuthenticated]

    def post(self, request):
        if request.data.get('kind') != PortalEvent.OPENED_LINK:
            return Response({'detail': 'Unknown event.'}, status=status.HTTP_400_BAD_REQUEST)
        scholarship = published_scholarship(request.data.get('slug', ''))
        track(request.user, PortalEvent.OPENED_LINK, scholarship)
        return Response(status=status.HTTP_204_NO_CONTENT)


# ---------------------------------------------------------------- Private files

class PrivateFileView(APIView):
    """
    GET /portal/files/documents/<id>/  and  /portal/files/receipts/<id>/
    Only the student who uploaded the file and administrators can open it.
    """
    permission_classes = [IsAuthenticated]

    def get(self, request, kind, pk):
        if kind == 'documents':
            obj = get_object_or_404(ApplicationDocument.objects.select_related('application'), pk=pk)
            owner, field, name = obj.application.student_id, obj.file, obj.file_name
        elif kind == 'receipts':
            obj = get_object_or_404(ServiceRequest.objects.select_related('application'), pk=pk)
            owner, field, name = obj.application.student_id, obj.receipt, obj.receipt_name
        elif kind == 'results':
            obj = get_object_or_404(ResultFile.objects.select_related('application'), pk=pk)
            owner, field, name = obj.application.student_id, obj.file, obj.file_name
        elif kind == 'messages':
            # A chat attachment: the person in the conversation and administrators can open it.
            obj = get_object_or_404(Message.objects.select_related('conversation'), pk=pk)
            owner, field, name = obj.conversation.user_id, obj.attachment, obj.attachment_name
        else:
            raise Http404
        if request.user.pk != owner and request.user.role != User.ADMIN:
            raise Http404  # don't reveal that the file exists
        if not field:
            raise Http404
        return FileResponse(field.open('rb'), filename=name or field.name.rsplit('/', 1)[-1])


# ---------------------------------------------------------------- Staff: a student's portal

def timeline_for(user, limit=60):
    """Portal events and account events (sign-ins, approvals…) merged, newest first."""
    events = [{**PortalEventSerializer(e).data, 'id': f'p{e.id}', 'source': 'portal'}
              for e in user.portal_events.select_related('scholarship')[:limit]]
    account = [{'id': f'a{log.id}', 'source': 'account', 'kind': log.action.lower(), 'kind_display': log.get_action_display(),
                'label': '', 'detail': log.description, 'scholarship_slug': None,
                'created_at': serializers.DateTimeField().to_representation(log.timestamp)}
               for log in ActivityLog.objects.filter(user=user).order_by('-timestamp')[:limit]]
    return sorted(events + account, key=lambda e: e['created_at'], reverse=True)[:limit]


class StaffContextMixin:
    """Staff always see the full service details (amount, guidelines, receipt)."""

    def get_serializer_context(self):
        return {**super().get_serializer_context(), 'staff': True}


class StudentPortalView(APIView):
    """GET /portal/staff/students/<user_id>/ -> the student's portal plus staff notes, timeline and stats."""
    permission_classes = [IsAdmin]

    def get(self, request, user_id):
        student = get_object_or_404(User, pk=user_id)
        events = student.portal_events
        return Response({
            'student': {
                'id': student.id, 'full_name': student.get_full_name(), 'email': student.email,
                'role': student.role, 'role_display': student.get_role_display(), 'country': student.country,
                'phone_number': student.phone_number, 'created_at': student.created_at, 'last_login': student.last_login,
                'profile_picture': request.build_absolute_uri(student.profile_picture.url) if student.profile_picture else None,
            },
            **portal_data(student, request, staff=True),
            'notes': StaffNoteSerializer(student.staff_notes.select_related('author'), many=True).data,
            'all_training': EnrollmentSerializer(student.training_enrollments.select_related('course'), many=True).data,
            'timeline': timeline_for(student),
            'stats': {
                'viewed': events.filter(kind=PortalEvent.VIEWED).values('scholarship').distinct().count(),
                'opened_links': events.filter(kind=PortalEvent.OPENED_LINK).count(),
                'sign_ins': ActivityLog.objects.filter(user=student, action=ActivityLog.LOGIN).count(),
                'last_active': events.values_list('created_at', flat=True).first() or student.last_login,
            },
        })


class StaffApplicationsView(APIView):
    """POST /portal/staff/students/<user_id>/applications/"""
    permission_classes = [IsAdmin]

    def post(self, request, user_id):
        student = get_object_or_404(User, pk=user_id)
        serializer = StaffApplicationCreateSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        data = dict(serializer.validated_data)
        slug, name = data.pop('scholarship_slug', ''), data.pop('scholarship_name', '').strip()
        scholarship = get_object_or_404(Scholarship, slug=slug) if slug else None
        application, created = start_application(student, scholarship, name=name, by=request.user, **data)
        if not created:
            return Response({'scholarship_slug': 'This student already has an application for that scholarship.'},
                            status=status.HTTP_400_BAD_REQUEST)
        return Response(ApplicationSerializer(application, context={'staff': True}).data, status=status.HTTP_201_CREATED)


def staff_application(pk):
    application = (Application.objects.select_related('scholarship', 'updated_by', 'service')
                   .prefetch_related('documents', 'milestones', 'result_files').get(pk=pk))
    return ApplicationSerializer(application, context={'staff': True}).data


class StaffApplicationDetailView(StaffContextMixin, ApplicationUpdateMixin, generics.RetrieveUpdateDestroyAPIView):
    """GET/PATCH/DELETE /portal/staff/applications/<id>/"""
    permission_classes = [IsAdmin]
    serializer_class = ApplicationSerializer
    queryset = Application.objects.select_related('scholarship', 'updated_by', 'service').prefetch_related('documents')
    http_method_names = ['get', 'patch', 'delete']

    def perform_destroy(self, application):
        # Remove the uploaded files too (documents, payment receipt, results), not just the rows.
        for document in application.documents.all():
            discard(document.file)
        for result in application.result_files.all():
            discard(result.file)
        service = getattr(application, 'service', None)
        if service:
            discard(service.receipt)
        application.delete()


class StaffServiceDecisionView(APIView):
    """
    POST /portal/staff/applications/<id>/service/
    {action: approve, amount, guidelines} | {action: decline, note} | {action: confirm_payment} | {action: reject_payment, note}
    """
    permission_classes = [IsAdmin]
    ALLOWED_FROM = {
        'approve': [ServiceRequest.REQUESTED, ServiceRequest.DECLINED, ServiceRequest.APPROVED],
        'decline': [ServiceRequest.REQUESTED, ServiceRequest.APPROVED],
        'confirm_payment': [ServiceRequest.PAYMENT_SUBMITTED, ServiceRequest.PAYMENT_REJECTED],
        'reject_payment': [ServiceRequest.PAYMENT_SUBMITTED],
    }

    def post(self, request, pk):
        service = get_object_or_404(ServiceRequest.objects.select_related('application__student', 'application__scholarship'),
                                     application__pk=pk)
        serializer = ServiceDecisionSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        data = serializer.validated_data
        action = data['action']
        if service.status not in self.ALLOWED_FROM[action]:
            return Response({'detail': f'This request is “{service.get_status_display()}”, so it can’t be changed that way.'},
                            status=status.HTTP_400_BAD_REQUEST)

        now, application = timezone.now(), service.application
        if action == 'approve':
            service.status, service.amount = ServiceRequest.APPROVED, data['amount']
            service.guidelines, service.decision_note = data.get('guidelines', ''), ''
            service.approved_at, service.approved_by = now, request.user
            message, send = 'Approved: guidelines shared with the student', emails.send_service_approved
        elif action == 'decline':
            service.status, service.decision_note = ServiceRequest.DECLINED, data.get('note', '')
            message, send = 'Request declined', emails.send_service_declined
        elif action == 'confirm_payment':
            service.status, service.verified_at, service.verified_by = ServiceRequest.PAID, now, request.user
            message, send = 'Payment confirmed', emails.send_payment_confirmed
            if not application.milestones.exists():  # start the progress timeline the student will follow
                Milestone.objects.bulk_create(
                    Milestone(application=application, title=title, status=state, order=i,
                              completed_at=now if state == Milestone.DONE else None)
                    for i, (title, state) in enumerate(DEFAULT_MILESTONES))
        else:
            service.status, service.decision_note = ServiceRequest.PAYMENT_REJECTED, data.get('note', '')
            message, send = 'Payment not confirmed: student asked to upload again', emails.send_payment_rejected
        with transaction.atomic():
            service.save()
            application.updated_by = request.user
            application.save(update_fields=['updated_by', 'updated_at'])
            track(application.student, PortalEvent.SERVICE_DECISION, application.scholarship, label=application.scholarship_name,
                  detail=f'{message} by {request.user.get_full_name()}')
            after_commit(send, service)
        return Response(staff_application(pk))


class StaffApplicationBoardView(StaffContextMixin, generics.ListAPIView):
    """
    GET /portal/staff/applications/?stage=&search=
    stage: an application stage, 'service' (ADRAM applying) or 'review' (requests and payments to check).
    """
    permission_classes = [IsAdmin]
    serializer_class = BoardApplicationSerializer
    search_fields = ['scholarship_name', 'student__first_name', 'student__last_name', 'student__email']

    def get_queryset(self):
        queryset = (Application.objects.select_related('student', 'scholarship', 'updated_by', 'service')
                    .prefetch_related('documents'))
        stage = self.request.query_params.get('stage')
        if stage == 'service':
            return queryset.filter(service__isnull=False)
        if stage == 'review':
            docs = ApplicationDocument.objects.filter(DOCS_TO_CHECK).values('application')
            return queryset.filter(Q(service__status__in=TO_REVIEW) | Q(pk__in=docs)).order_by('service__updated_at')
        return queryset.filter(stage=stage) if stage else queryset

    def list(self, request, *args, **kwargs):
        response = super().list(request, *args, **kwargs)
        counts = dict(Application.objects.values_list('stage').annotate(n=Count('id')))
        response.data['stage_counts'] = {stage: counts.get(stage, 0) for stage, _ in Application.STAGE_CHOICES}
        response.data['service_count'] = ServiceRequest.objects.count()
        docs = ApplicationDocument.objects.filter(DOCS_TO_CHECK).values('application')
        response.data['review_count'] = Application.objects.filter(Q(service__status__in=TO_REVIEW) | Q(pk__in=docs)).count()
        return response


class StaffSummaryView(APIView):
    """GET /portal/staff/summary/ -> counts for the admin sidebar and dashboard."""
    permission_classes = [IsAdmin]

    def get(self, request):
        counts = dict(ServiceRequest.objects.values_list('status').annotate(n=Count('id')))
        return Response({
            'service_requests': counts.get(ServiceRequest.REQUESTED, 0),
            'payments_to_check': counts.get(ServiceRequest.PAYMENT_SUBMITTED, 0),
            'documents_to_check': ApplicationDocument.objects.filter(DOCS_TO_CHECK).count(),
            'training_requests': TrainingEnrollment.objects.filter(status=TrainingEnrollment.REQUESTED).count(),
            'to_review': sum(counts.get(s, 0) for s in TO_REVIEW) + ApplicationDocument.objects.filter(DOCS_TO_CHECK).count(),
            'messages_unread': Message.objects.filter(from_staff=False, read_at__isnull=True).count(),
        })


class StaffBusinessInsightsView(APIView):
    """
    GET /portal/staff/insights/?days=30 -> the business side of the admin overview: the application pipeline,
    "ADRAM applies for you" revenue, scholarship outcomes, training, top scholarships and what's coming up.
    Revenue counts payments ADRAM confirmed (verified_at) in the period, compared with the period before.
    """
    permission_classes = [IsAdmin]

    def get(self, request):
        from datetime import datetime, time, timedelta
        from django.db.models import Sum
        from django.db.models.functions import TruncDate

        try:
            days = int(request.query_params.get('days', 30))
        except ValueError:
            days = 30
        days = days if days in (7, 30, 90) else 30
        now = timezone.now()
        since, before = now - timedelta(days=days), now - timedelta(days=2 * days)

        def revenue(queryset):
            return float(queryset.aggregate(total=Sum('amount'))['total'] or 0)

        stages = dict(Application.objects.values_list('stage').annotate(n=Count('id')))
        paid = ServiceRequest.objects.filter(status=ServiceRequest.PAID)
        awarded, unsuccessful = stages.get(Application.ACCEPTED, 0), stages.get(Application.UNSUCCESSFUL, 0)
        training = dict(TrainingEnrollment.objects.values_list('status').annotate(n=Count('id')))
        closed = [Application.ACCEPTED, Application.UNSUCCESSFUL, Application.WITHDRAWN]

        top = (Scholarship.objects.filter(is_published=True)
               .annotate(applications_count=Count('applications', distinct=True), saved_count=Count('saved_by', distinct=True))
               .filter(Q(applications_count__gt=0) | Q(saved_count__gt=0))
               .order_by('-applications_count', '-saved_count')[:5])
        by_course = (TrainingEnrollment.objects.exclude(status=TrainingEnrollment.CANCELLED)
                     .values('course__title').annotate(n=Count('id')).order_by('-n')[:6])

        # Interviews and application deadlines in the next 14 days.
        soon, today = now + timedelta(days=14), timezone.localdate()
        interviews = Application.objects.filter(stage=Application.INTERVIEW, interview_at__range=(now, soon)).select_related('student')
        deadlines = (Application.objects.filter(deadline__range=(today, today + timedelta(days=14)))
                     .exclude(stage__in=closed).select_related('student'))
        upcoming = [{'kind': 'interview', 'when': a.interview_at.isoformat(), 'student_id': a.student_id,
                     'student': a.student.get_full_name(), 'scholarship': a.scholarship_name, 'link': a.interview_link}
                    for a in interviews]
        upcoming += [{'kind': 'deadline', 'when': a.deadline.isoformat(), 'student_id': a.student_id,
                      'student': a.student.get_full_name(), 'scholarship': a.scholarship_name, 'link': ''}
                     for a in deadlines]
        upcoming.sort(key=lambda u: u['when'])

        # One point per calendar day (today last) for the trend chart.
        start = today - timedelta(days=days - 1)
        window_start = timezone.make_aware(datetime.combine(start, time.min))

        def per_day(queryset, field, value=None):
            rows = (queryset.filter(**{f'{field}__gte': window_start}).annotate(day=TruncDate(field))
                    .values('day').annotate(n=Sum(value) if value else Count('id')))
            return {row['day']: row['n'] or 0 for row in rows}

        new_apps = per_day(Application.objects.all(), 'created_at')
        new_requests = per_day(ServiceRequest.objects.all(), 'requested_at')
        paid_per_day = per_day(paid, 'verified_at', 'amount')
        series = []
        for i in range(days):
            day = start + timedelta(days=i)
            series.append({'date': day.isoformat(), 'applications': new_apps.get(day, 0),
                           'service_requests': new_requests.get(day, 0), 'revenue': float(paid_per_day.get(day, 0))})

        # Where students live: the top six countries, the rest folded into "Other".
        students = User.objects.filter(role=User.STUDENT)
        by_country = list(students.exclude(country__isnull=True).exclude(country='')
                          .values('country').annotate(n=Count('id')).order_by('-n', 'country'))
        countries = [{'label': row['country'], 'count': row['n']} for row in by_country[:6]]
        other = sum(row['n'] for row in by_country[6:])
        if other:
            countries.append({'label': 'Other countries', 'count': other})
        unknown = students.filter(Q(country__isnull=True) | Q(country='')).count()
        if unknown:
            countries.append({'label': 'Not given', 'count': unknown})

        # "ADRAM applies for you" as a cumulative funnel: everyone who reached a step, not who is sitting on it.
        by_status = dict(ServiceRequest.objects.values_list('status').annotate(n=Count('id')))
        total_requests = sum(by_status.values())
        service_funnel = [
            {'key': 'requested', 'label': 'Requests received', 'count': total_requests},
            {'key': 'approved', 'label': 'Approved by ADRAM',
             'count': total_requests - by_status.get(ServiceRequest.REQUESTED, 0) - by_status.get(ServiceRequest.DECLINED, 0)},
            {'key': 'submitted', 'label': 'Payment submitted',
             'count': sum(by_status.get(s, 0) for s in (ServiceRequest.PAYMENT_SUBMITTED, ServiceRequest.PAYMENT_REJECTED, ServiceRequest.PAID))},
            {'key': 'paid', 'label': 'Payment confirmed', 'count': by_status.get(ServiceRequest.PAID, 0)},
        ]
        method_labels = dict(ServiceRequest.METHOD_CHOICES)
        payment_methods = [{'key': row['payment_method'] or 'other', 'label': method_labels.get(row['payment_method'], 'Method not recorded'),
                            'count': row['n'], 'amount': float(row['total'] or 0)}
                           for row in paid.values('payment_method').annotate(n=Count('id'), total=Sum('amount')).order_by('-total')]

        return Response({
            'days': days,
            'service_funnel': service_funnel,
            'payment_methods': payment_methods,
            'pipeline': [{'stage': stage, 'label': label, 'count': stages.get(stage, 0)} for stage, label in Application.STAGE_CHOICES],
            'applications': {
                'total': sum(stages.values()),
                'active': sum(n for stage, n in stages.items() if stage not in closed),
                'new': Application.objects.filter(created_at__gte=since).count(),
                'new_prev': Application.objects.filter(created_at__gte=before, created_at__lt=since).count(),
            },
            'service': {
                'requests': ServiceRequest.objects.count(),
                'awaiting_payment': ServiceRequest.objects.filter(
                    status__in=[ServiceRequest.APPROVED, ServiceRequest.PAYMENT_REJECTED]).count(),
                'paid': paid.count(),
                'revenue_total': revenue(paid),
                'revenue': revenue(paid.filter(verified_at__gte=since)),
                'revenue_prev': revenue(paid.filter(verified_at__gte=before, verified_at__lt=since)),
            },
            'series': series,
            'students': {
                'total': students.count(),
                'applying': students.filter(applications__isnull=False).distinct().count(),
            },
            'countries': countries,
            'outcomes': {
                'awarded': awarded, 'unsuccessful': unsuccessful,
                'withdrawn': stages.get(Application.WITHDRAWN, 0),
                'in_progress': sum(n for stage, n in stages.items() if stage not in closed),
                'success_rate': round(awarded / (awarded + unsuccessful) * 100) if awarded + unsuccessful else None,
            },
            'training': {
                'requested': training.get(TrainingEnrollment.REQUESTED, 0),
                'active': training.get(TrainingEnrollment.ACTIVE, 0),
                'completed': training.get(TrainingEnrollment.COMPLETED, 0),
                'by_course': [{'label': row['course__title'], 'count': row['n']} for row in by_course],
            },
            'top_scholarships': [{'slug': s.slug, 'name': s.name, 'country': s.country,
                                  'applications': s.applications_count, 'saved': s.saved_count} for s in top],
            'upcoming': upcoming[:8],
        })


class StaffApplicationsOverviewView(APIView):
    """
    GET /portal/staff/applications/overview/ -> statistics for the Applications page: weekly new applications,
    the stage pipeline, outcomes, deadline urgency, document review progress, destinations and service uptake.
    """
    permission_classes = [IsAdmin]
    WEEKS = 12

    def get(self, request):
        from datetime import datetime, time, timedelta
        from django.db.models.functions import TruncDate

        now, today = timezone.now(), timezone.localdate()
        apps = Application.objects.all()
        closed = [Application.ACCEPTED, Application.UNSUCCESSFUL, Application.WITHDRAWN]
        open_apps = apps.exclude(stage__in=closed)
        stages = dict(apps.values_list('stage').annotate(n=Count('id')))

        # New applications per week for the last 12 weeks (the last bucket ends today).
        start = today - timedelta(days=self.WEEKS * 7 - 1)
        per_day = dict(apps.filter(created_at__gte=timezone.make_aware(datetime.combine(start, time.min)))
                       .annotate(day=TruncDate('created_at')).values('day').annotate(n=Count('id')).values_list('day', 'n'))
        weekly = []
        for w in range(self.WEEKS):
            week_start = start + timedelta(days=w * 7)
            weekly.append({'start': week_start.isoformat(), 'end': (week_start + timedelta(days=6)).isoformat(),
                           'count': sum(per_day.get(week_start + timedelta(days=d), 0) for d in range(7))})

        # How urgent the open applications are.
        deadlines = open_apps.aggregate(
            overdue=Count('id', filter=Q(deadline__lt=today)),
            this_week=Count('id', filter=Q(deadline__gte=today, deadline__lte=today + timedelta(days=7))),
            this_month=Count('id', filter=Q(deadline__gt=today + timedelta(days=7), deadline__lte=today + timedelta(days=30))),
            later=Count('id', filter=Q(deadline__gt=today + timedelta(days=30))),
            none=Count('id', filter=Q(deadline__isnull=True)),
        )

        docs = ApplicationDocument.objects.aggregate(
            total=Count('id'),
            uploaded=Count('id', filter=Q(file__gt='')),
            accepted=Count('id', filter=Q(review_status=ApplicationDocument.ACCEPTED)),
            returned=Count('id', filter=Q(review_status=ApplicationDocument.RETURNED)),
            to_check=Count('id', filter=DOCS_TO_CHECK),
        )

        # Destinations: the listed scholarship's country; applications for unlisted scholarships are grouped.
        country_labels = dict(Scholarship._meta.get_field('country').choices)
        by_dest = list(apps.values('scholarship__country').annotate(n=Count('id')).order_by('-n'))
        destinations = [{'key': row['scholarship__country'] or 'unlisted',
                         'label': country_labels.get(row['scholarship__country'], 'Not listed on the website'),
                         'count': row['n']} for row in by_dest[:7]]

        awarded, unsuccessful = stages.get(Application.ACCEPTED, 0), stages.get(Application.UNSUCCESSFUL, 0)
        docs_links = ApplicationDocument.objects.filter(DOCS_TO_CHECK).values('application')
        return Response({
            'total': sum(stages.values()),
            'active': open_apps.count(),
            'new_7': apps.filter(created_at__gte=now - timedelta(days=7)).count(),
            'new_prev_7': apps.filter(created_at__gte=now - timedelta(days=14), created_at__lt=now - timedelta(days=7)).count(),
            'needs_action': apps.filter(Q(service__status__in=TO_REVIEW) | Q(pk__in=docs_links)).count(),
            'students': apps.values('student').distinct().count(),
            'with_service': apps.filter(service__isnull=False).count(),
            'awarded': awarded,
            'unsuccessful': unsuccessful,
            'withdrawn': stages.get(Application.WITHDRAWN, 0),
            'success_rate': round(awarded / (awarded + unsuccessful) * 100) if awarded + unsuccessful else None,
            'weekly': weekly,
            'pipeline': [{'stage': stage, 'label': label, 'count': stages.get(stage, 0)} for stage, label in Application.STAGE_CHOICES],
            'deadlines': deadlines,
            'documents': docs,
            'destinations': destinations,
        })


class StaffScholarshipsOverviewView(APIView):
    """
    GET /portal/staff/scholarships/overview/ -> statistics for the Scholarships page: catalogue health, deadlines,
    student interest (saves, applications, service requests) per week and per listing, and the catalogue mix.
    """
    permission_classes = [IsAdmin]
    WEEKS = 12

    def get(self, request):
        from datetime import datetime, time, timedelta
        from django.db.models.functions import TruncDate

        now, today = timezone.now(), timezone.localdate()
        listings = Scholarship.objects.all()
        published = listings.filter(is_published=True)

        counts = listings.aggregate(
            total=Count('id'),
            published=Count('id', filter=Q(is_published=True)),
            members_only=Count('id', filter=Q(members_only=True)),
            link_hidden=Count('id', filter=Q(hide_official_link=True)),
            service_on=Count('id', filter=Q(service_enabled=True, is_published=True)),
        )
        deadlines = published.aggregate(
            passed=Count('id', filter=Q(deadline__lt=today)),
            next_30=Count('id', filter=Q(deadline__gte=today, deadline__lte=today + timedelta(days=30))),
            later=Count('id', filter=Q(deadline__gt=today + timedelta(days=30))),
            unknown=Count('id', filter=Q(deadline__isnull=True)),
        )

        # Interest per week: saves and applications started, last 12 weeks (the last bucket ends today).
        start = today - timedelta(days=self.WEEKS * 7 - 1)
        since = timezone.make_aware(datetime.combine(start, time.min))

        def per_day(queryset):
            return dict(queryset.filter(created_at__gte=since).annotate(day=TruncDate('created_at'))
                        .values('day').annotate(n=Count('id')).values_list('day', 'n'))

        saves_day = per_day(SavedScholarship.objects.all())
        apps_day = per_day(Application.objects.filter(scholarship__isnull=False))
        weekly = []
        for w in range(self.WEEKS):
            week_start = start + timedelta(days=w * 7)
            days = [week_start + timedelta(days=d) for d in range(7)]
            weekly.append({'start': week_start.isoformat(), 'end': days[-1].isoformat(),
                           'saves': sum(saves_day.get(d, 0) for d in days),
                           'applications': sum(apps_day.get(d, 0) for d in days)})

        ranked = (listings.annotate(applications_count=Count('applications', distinct=True),
                                    saves_count=Count('saved_by', distinct=True),
                                    service_count=Count('applications__service', distinct=True))
                  .order_by('-applications_count', '-saves_count', 'name'))
        top = [{'id': s.id, 'name': s.name, 'country': s.country, 'is_published': s.is_published,
                'deadline': s.deadline.isoformat() if s.deadline else None,
                'applications': s.applications_count, 'saves': s.saves_count, 'service': s.service_count}
               for s in ranked[:8]]
        no_interest = [{'id': s.id, 'name': s.name} for s in ranked.filter(is_published=True, applications_count=0, saves_count=0)[:5]]
        closing = [{'id': s.id, 'name': s.name, 'country': s.country, 'deadline': s.deadline.isoformat()}
                   for s in published.filter(deadline__gte=today).order_by('deadline')[:5]]

        labels = dict(Scholarship._meta.get_field('country').choices)
        by_dest = published.values('country').annotate(n=Count('id')).order_by('-n')
        levels = {level: 0 for level in LEVELS}
        for level_list in published.values_list('levels', flat=True):
            for level in level_list or []:
                if level in levels:
                    levels[level] += 1
        funding = dict(published.values_list('funding').annotate(n=Count('id')))

        return Response({
            **counts,
            'drafts': counts['total'] - counts['published'],
            'deadlines': deadlines,
            'interest': {
                'saves': SavedScholarship.objects.count(),
                'applications': Application.objects.filter(scholarship__isnull=False).count(),
                'service': ServiceRequest.objects.filter(application__scholarship__isnull=False).count(),
                'saves_7': SavedScholarship.objects.filter(created_at__gte=now - timedelta(days=7)).count(),
                'saves_prev_7': SavedScholarship.objects.filter(created_at__gte=now - timedelta(days=14), created_at__lt=now - timedelta(days=7)).count(),
            },
            'weekly': weekly,
            'top': top,
            'no_interest': no_interest,
            'no_interest_count': ranked.filter(is_published=True, applications_count=0, saves_count=0).count(),
            'closing': closing,
            'destinations': [{'key': row['country'], 'label': labels.get(row['country'], row['country']), 'count': row['n']} for row in by_dest],
            'levels': [{'key': k, 'label': k, 'count': v} for k, v in levels.items()],
            'funding': [{'key': k, 'label': label, 'count': funding.get(k, 0)} for k, label in Scholarship.FUNDING_CHOICES],
        })


class StaffTrainingOverviewView(APIView):
    """
    GET /portal/staff/training/overview/ -> statistics for the Training page: programmes, enrollment volume and
    status, per-programme performance, upcoming intakes and start dates, and learners.
    """
    permission_classes = [IsAdmin]
    WEEKS = 12

    def get(self, request):
        from datetime import datetime, time, timedelta
        from django.db.models.functions import TruncDate
        from catalog.models import Course

        now, today = timezone.now(), timezone.localdate()
        E = TrainingEnrollment
        enrollments = E.objects.all()
        status_counts = dict(enrollments.values_list('status').annotate(n=Count('id')))

        start = today - timedelta(days=self.WEEKS * 7 - 1)
        per_day = dict(enrollments.filter(created_at__gte=timezone.make_aware(datetime.combine(start, time.min)))
                       .annotate(day=TruncDate('created_at')).values('day').annotate(n=Count('id')).values_list('day', 'n'))
        weekly = []
        for w in range(self.WEEKS):
            week_start = start + timedelta(days=w * 7)
            weekly.append({'start': week_start.isoformat(), 'end': (week_start + timedelta(days=6)).isoformat(),
                           'count': sum(per_day.get(week_start + timedelta(days=d), 0) for d in range(7))})

        courses = Course.objects.annotate(
            total=Count('enrollments', filter=~Q(enrollments__status=E.CANCELLED)),
            requested=Count('enrollments', filter=Q(enrollments__status=E.REQUESTED)),
            active=Count('enrollments', filter=Q(enrollments__status=E.ACTIVE)),
            completed=Count('enrollments', filter=Q(enrollments__status=E.COMPLETED)),
            cancelled=Count('enrollments', filter=Q(enrollments__status=E.CANCELLED)),
        ).order_by('-total', 'sort_order', 'title')
        programmes = [{'id': c.id, 'title': c.title, 'icon': c.icon, 'is_published': c.is_published,
                       'next_intake': c.next_intake.isoformat() if c.next_intake else None,
                       'total': c.total, 'requested': c.requested, 'active': c.active,
                       'completed': c.completed, 'cancelled': c.cancelled} for c in courses]

        intakes = [{'kind': 'intake', 'id': c.id, 'title': c.title, 'date': c.next_intake.isoformat()}
                   for c in Course.objects.filter(is_published=True, next_intake__gte=today).order_by('next_intake')[:4]]
        starts = [{'kind': 'start', 'id': e.student_id, 'title': e.course.title, 'student': e.student.get_full_name(),
                   'date': e.start_date.isoformat()}
                  for e in enrollments.filter(start_date__gte=today, status=E.ACTIVE).select_related('student', 'course').order_by('start_date')[:4]]

        learners = enrollments.exclude(status=E.CANCELLED).values('student').annotate(n=Count('id'))
        return Response({
            'programmes_total': len(programmes),
            'programmes_published': sum(1 for p in programmes if p['is_published']),
            'no_intake': sum(1 for p in programmes if p['is_published'] and not p['next_intake']),
            'status': {key: status_counts.get(key, 0) for key, _ in E.STATUS_CHOICES},
            'total': sum(status_counts.values()),
            'new_7': enrollments.filter(created_at__gte=now - timedelta(days=7)).count(),
            'new_prev_7': enrollments.filter(created_at__gte=now - timedelta(days=14), created_at__lt=now - timedelta(days=7)).count(),
            'learners': learners.count(),
            'multi_programme': learners.filter(n__gt=1).count(),
            'weekly': weekly,
            'programmes': programmes,
            'upcoming': sorted(intakes + starts, key=lambda x: x['date'])[:6],
        })


class StaffPaymentSettingsView(APIView):
    """GET/PUT /portal/staff/payment-settings/ -> mobile-money numbers, payment instructions and terms."""
    permission_classes = [IsAdmin]

    def get(self, request):
        return Response(PaymentSettingsSerializer(PaymentSettings.load()).data)

    def put(self, request):
        settings_row = PaymentSettings.load()
        serializer = PaymentSettingsSerializer(settings_row, data=request.data, partial=True)
        serializer.is_valid(raise_exception=True)
        serializer.save(updated_by=request.user)
        return Response(serializer.data)


class StaffDocumentsView(DocumentViewsMixin, APIView):
    """POST /portal/staff/applications/<id>/documents/ {name}"""
    permission_classes = [IsAdmin]

    def post(self, request, pk):
        return self.add_document(get_object_or_404(Application, pk=pk), request)


class StaffDocumentDetailView(DocumentViewsMixin, APIView):
    """PATCH/DELETE /portal/staff/documents/<id>/"""
    permission_classes = [IsAdmin]

    def patch(self, request, pk):
        return self.update_document(get_object_or_404(ApplicationDocument, pk=pk), request)

    def delete(self, request, pk):
        return self.delete_document(get_object_or_404(ApplicationDocument, pk=pk))


class StaffDocumentReviewView(APIView):
    """POST /portal/staff/documents/<id>/review/ {status: accepted|returned|pending, tag?, note?}"""
    permission_classes = [IsAdmin]

    def post(self, request, pk):
        document = get_object_or_404(ApplicationDocument.objects.select_related('application__student', 'application__scholarship'), pk=pk)
        serializer = DocumentReviewSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        data = serializer.validated_data
        if data['status'] != 'pending' and not document.file:
            return Response({'detail': 'The student hasn’t uploaded this document yet.'}, status=status.HTTP_400_BAD_REQUEST)
        returned = data['status'] == 'returned'
        document.review_status = '' if data['status'] == 'pending' else data['status']
        document.review_tag = data.get('tag', '') if returned else ''
        document.review_note = data.get('note', '').strip() if returned else ''
        document.reviewed_at, document.reviewed_by = timezone.now(), request.user
        if returned:
            document.is_done = False  # it goes back on the student's to-do list
        document.save()
        application = document.application
        outcome = f'returned ({document.get_review_tag_display()})' if returned else (document.review_status or 'review cleared')
        track(application.student, PortalEvent.DOC_REVIEW, application.scholarship, label=application.scholarship_name,
              detail=f'{document.name}: {outcome}')
        if returned:
            after_commit(emails.send_document_returned, document)
        return Response(DocumentSerializer(document).data)


def track_milestone(application, detail):
    track(application.student, PortalEvent.MILESTONE, application.scholarship, label=application.scholarship_name, detail=detail)


class StaffMilestonesView(APIView):
    """POST /portal/staff/applications/<id>/milestones/ {title, status, due_date, note}"""
    permission_classes = [IsAdmin]

    def post(self, request, pk):
        application = get_object_or_404(Application, pk=pk)
        serializer = MilestoneSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        order = (application.milestones.order_by('-order').values_list('order', flat=True).first() or 0) + 1
        done = serializer.validated_data.get('status') == Milestone.DONE
        milestone = serializer.save(application=application, order=order, completed_at=timezone.now() if done else None)
        track_milestone(application, f'Added “{milestone.title}”')
        return Response(staff_application(pk), status=status.HTTP_201_CREATED)


class StaffMilestoneDetailView(APIView):
    """PATCH/DELETE /portal/staff/milestones/<id>/"""
    permission_classes = [IsAdmin]

    def patch(self, request, pk):
        milestone = get_object_or_404(Milestone.objects.select_related('application__scholarship'), pk=pk)
        serializer = MilestoneSerializer(milestone, data=request.data, partial=True)
        serializer.is_valid(raise_exception=True)
        was = milestone.status
        milestone = serializer.save()
        if milestone.status != was:
            milestone.completed_at = timezone.now() if milestone.status == Milestone.DONE else None
            milestone.save(update_fields=['completed_at'])
            track_milestone(milestone.application, f'{milestone.title}: {milestone.get_status_display()}')
        return Response(staff_application(milestone.application_id))

    def delete(self, request, pk):
        milestone = get_object_or_404(Milestone, pk=pk)
        application_id = milestone.application_id
        milestone.delete()
        return Response(staff_application(application_id))


class StaffMilestoneReorderView(APIView):
    """POST /portal/staff/applications/<id>/milestones/reorder/ {ids: [...]}"""
    permission_classes = [IsAdmin]

    def post(self, request, pk):
        application = get_object_or_404(Application, pk=pk)
        serializer = ReorderIdsSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        items = application.milestones.in_bulk(serializer.validated_data['ids'])
        for position, milestone_id in enumerate(serializer.validated_data['ids']):
            if milestone_id in items:
                items[milestone_id].order = position
        Milestone.objects.bulk_update(items.values(), ['order'])
        return Response(staff_application(pk))


class StaffResultFilesView(APIView):
    """POST /portal/staff/applications/<id>/result-files/  multipart {file, title?} -> the student can see it."""
    permission_classes = [IsAdmin]
    parser_classes = [MultiPartParser, FormParser]

    def post(self, request, pk):
        application = get_object_or_404(Application.objects.select_related('student', 'scholarship'), pk=pk)
        serializer = ResultFileUploadSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        upload = serializer.validated_data['file']
        result = ResultFile.objects.create(application=application, file=upload, file_name=upload.name[:200],
                                           title=serializer.validated_data.get('title', '').strip(), uploaded_by=request.user)
        track(application.student, PortalEvent.SERVICE_DECISION, application.scholarship, label=application.scholarship_name,
              detail=f'Result document added: {result.title or result.file_name}')
        after_commit(emails.send_result_files_ready, application)
        return Response(staff_application(pk), status=status.HTTP_201_CREATED)


class StaffResultFileDetailView(APIView):
    """DELETE /portal/staff/result-files/<id>/"""
    permission_classes = [IsAdmin]

    def delete(self, request, pk):
        result = get_object_or_404(ResultFile, pk=pk)
        application_id = result.application_id
        discard(result.file)
        result.delete()
        return Response(staff_application(application_id))


class StaffTrainingView(APIView):
    """POST /portal/staff/students/<user_id>/training/ {slug, status?} -> enroll a student."""
    permission_classes = [IsAdmin]

    def post(self, request, user_id):
        from catalog.models import Course
        student = get_object_or_404(User, pk=user_id)
        course = get_object_or_404(Course, slug=request.data.get('slug', ''))
        enrollment, _ = TrainingEnrollment.objects.get_or_create(student=student, course=course)
        serializer = EnrollmentSerializer(enrollment, data={'status': request.data.get('status', TrainingEnrollment.ACTIVE)}, partial=True)
        serializer.is_valid(raise_exception=True)
        serializer.save()
        # Training changes go to the admin audit log, not the student's scholarship activity (PortalEvent)
        audit.record(request, 'training_enrolled', enrollment, label=f'{student.get_full_name()}: {course.title}', status=enrollment.status)
        return Response(serializer.data, status=status.HTTP_201_CREATED)


class StaffTrainingListView(APIView):
    """GET /portal/staff/training/ -> every enrollment (requests first), for the Training admin page."""
    permission_classes = [IsAdmin]

    def get(self, request):
        from django.db.models import Case, IntegerField, Value, When
        enrollments = (TrainingEnrollment.objects.exclude(status=TrainingEnrollment.CANCELLED)
                       .select_related('course', 'student')
                       .order_by(Case(When(status=TrainingEnrollment.REQUESTED, then=Value(0)), default=Value(1),
                                      output_field=IntegerField()), '-created_at'))
        return Response([{**EnrollmentSerializer(e).data, 'student_id': e.student_id, 'student_name': e.student.get_full_name(),
                          'student_email': e.student.email} for e in enrollments])


class StaffTrainingDetailView(APIView):
    """PATCH /portal/staff/training/<id>/ {status, start_date, note}"""
    permission_classes = [IsAdmin]

    def patch(self, request, pk):
        enrollment = get_object_or_404(TrainingEnrollment.objects.select_related('course', 'student'), pk=pk)
        was = enrollment.status
        serializer = EnrollmentSerializer(enrollment, data=request.data, partial=True)
        serializer.is_valid(raise_exception=True)
        enrollment = serializer.save()
        if enrollment.status != was:
            audit.record(request, 'training_status', enrollment, label=f'{enrollment.student.get_full_name()}: {enrollment.course.title}',
                         status=enrollment.get_status_display())
            if enrollment.status in (TrainingEnrollment.ACTIVE, TrainingEnrollment.DECLINED) and was == TrainingEnrollment.REQUESTED:
                from lms.enrolment import announce_decision
                enrollment.decided_at, enrollment.decided_by = timezone.now(), request.user
                enrollment.save(update_fields=['decided_at', 'decided_by', 'updated_at'])
                announce_decision(enrollment)  # the same in-portal message and email as the Enrollments page
            elif enrollment.status == TrainingEnrollment.ACTIVE:
                after_commit(emails.send_training_confirmed, enrollment)
        return Response(serializer.data)


class StaffNotesView(APIView):
    """POST /portal/staff/students/<user_id>/notes/ {body}"""
    permission_classes = [IsAdmin]

    def post(self, request, user_id):
        student = get_object_or_404(User, pk=user_id)
        serializer = StaffNoteSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        serializer.save(student=student, author=request.user)
        return Response(serializer.data, status=status.HTTP_201_CREATED)


class StaffNoteDetailView(generics.DestroyAPIView):
    """DELETE /portal/staff/notes/<id>/"""
    permission_classes = [IsAdmin]
    queryset = StaffNote.objects.all()
