"""
A student's place on training programmes: the training side of the portal.

Kept apart from the scholarships side (portal app): nothing here reads or writes applications, saved scholarships
or the scholarship activity log (PortalEvent), and the scholarship endpoints don't return training.
(The TrainingEnrollment table itself still lives in the portal app, where it was created, so no data has to move.)
"""
from datetime import date

from django.db import transaction
from django.db.models import Count, Q
from django.shortcuts import get_object_or_404
from django.utils import timezone
from rest_framework import status
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView

from accounts.permissions import IsAdmin
from catalog.models import Course
from portal import emails
from portal.models import TrainingEnrollment
from portal.serializers import EnrollmentSerializer

from . import audit
from .models import Certificate, CartItem, Order
from .notify import notify, notify_admins

# Statuses a student can ask again from (a cancelled or declined request starts over)
REOPENABLE = (TrainingEnrollment.CANCELLED, TrainingEnrollment.DECLINED)


def announce_decision(enrollment):
    """Tell the student ADRAM confirmed or declined their place: in the portal (bell) and by email."""
    course = enrollment.course
    if enrollment.status == TrainingEnrollment.ACTIVE:
        body = enrollment.note or 'Every lesson is now open. Start whenever you like.'
        notify(enrollment.student, 'enrollment', f'You’re enrolled on {course.title}', body, f'/courses/{course.slug}')
        transaction.on_commit(lambda: emails.send_training_confirmed(enrollment))
    elif enrollment.status == TrainingEnrollment.DECLINED:
        body = enrollment.note or 'ADRAM couldn’t accept your request this time. You can contact us or ask again later.'
        notify(enrollment.student, 'enrollment', f'Your request for {course.title} wasn’t accepted', body, f'/courses/{course.slug}')
        transaction.on_commit(lambda: emails.send_training_declined(enrollment))


def decide(enrollment, decision, request, note=None, start_date=None):
    """An administrator confirms ('confirm') or declines ('decline') a student's place, and the student is told."""
    enrollment.status = TrainingEnrollment.ACTIVE if decision == 'confirm' else TrainingEnrollment.DECLINED
    if note is not None:
        enrollment.note = note[:500]
    if start_date is not None:
        enrollment.start_date = start_date
    enrollment.decided_at, enrollment.decided_by = timezone.now(), request.user
    enrollment.save()
    audit.record(request, 'enrollment_confirmed' if decision == 'confirm' else 'enrollment_declined', enrollment,
                 label=f'{enrollment.student.get_full_name()}: {enrollment.course.title}')
    announce_decision(enrollment)
    return enrollment


def enrollments_of(user):
    """The student's programmes (cancelled requests drop out)."""
    return user.training_enrollments.exclude(status=TrainingEnrollment.CANCELLED).select_related('course')


class MyEnrollmentsView(APIView):
    """
    GET    /lms/me/enrollments/        the student's programmes (requested, active, completed)
    POST   /lms/me/enrollments/ {slug} enrol on a free course (open: instant; approval: ADRAM confirms)
    DELETE /lms/me/enrollments/<id>/   cancel a request that hasn't been confirmed yet
    """
    permission_classes = [IsAuthenticated]

    def get(self, request):
        return Response(EnrollmentSerializer(enrollments_of(request.user), many=True).data)

    def post(self, request):
        course = get_object_or_404(Course, slug=request.data.get('slug', ''), is_published=True)
        if not course.is_free:
            # A paid course is bought through the cart and checkout, which take the payment before opening the lessons
            return Response({'detail': 'This course has a price. Add it to your cart to buy it.', 'code': 'payment_required',
                             'checkout': '/cart'}, status=status.HTTP_402_PAYMENT_REQUIRED)
        # Open courses give instant access; the others wait for ADRAM to confirm the place
        instant = course.enrollment_mode == course.OPEN
        wanted = TrainingEnrollment.ACTIVE if instant else TrainingEnrollment.REQUESTED
        enrollment, created = TrainingEnrollment.objects.get_or_create(student=request.user, course=course, defaults={'status': wanted})
        if not created and enrollment.status in REOPENABLE:
            enrollment.status, created = wanted, True
            enrollment.decided_at = enrollment.decided_by = None
            enrollment.note = ''
            enrollment.save(update_fields=['status', 'decided_at', 'decided_by', 'note', 'updated_at'])
        elif not created and instant and enrollment.status == TrainingEnrollment.REQUESTED:
            enrollment.status = TrainingEnrollment.ACTIVE  # the course was opened after they asked
            enrollment.save(update_fields=['status', 'updated_at'])
        if created:
            request.user.join_track('training')
            if instant:
                notify(request.user, 'enrollment', f'You’re enrolled on {course.title}', 'Every lesson is now open.', f'/courses/{course.slug}')
            else:
                name = request.user.get_full_name() or request.user.email
                notify_admins('enrollment', 'New enrollment request', f'{name} wants to join {course.title}.', '/admin/enrollments')
                transaction.on_commit(lambda: emails.notify_team_training(enrollment))
        return Response(EnrollmentSerializer(enrollment).data, status=status.HTTP_201_CREATED if created else status.HTTP_200_OK)

    def delete(self, request, pk):
        enrollment = get_object_or_404(TrainingEnrollment, pk=pk, student=request.user)
        if enrollment.status != TrainingEnrollment.REQUESTED:
            return Response({'detail': 'Please contact ADRAM to leave a programme you’re already enrolled in.'},
                            status=status.HTTP_400_BAD_REQUEST)
        enrollment.status = TrainingEnrollment.CANCELLED
        enrollment.save(update_fields=['status', 'updated_at'])
        return Response(status=status.HTTP_204_NO_CONTENT)


class MyTrainingSummaryView(APIView):
    """GET /lms/me/summary/: counts for the training side's sidebar (the scholarships side has /portal/me/summary/)."""
    permission_classes = [IsAuthenticated]

    def get(self, request):
        user = request.user
        return Response({
            'training': enrollments_of(user).count(),
            'cart': CartItem.objects.filter(student=user).count(),
            'orders_waiting': Order.objects.filter(student=user, status__in=[Order.PENDING, Order.FAILED]).count(),
            'certificates': Certificate.objects.filter(enrollment__student=user, revoked_at__isnull=True).count(),
        })


# ---------------------------------------------------------------- administrators: confirming places

def admin_row(e):
    student = e.student
    return {
        'id': e.id, 'status': e.status, 'status_display': e.get_status_display(),
        'student': {'id': student.id, 'name': student.get_full_name() or student.email, 'email': student.email,
                    'phone': student.phone_number or '', 'country': student.country or ''},
        'course': {'id': e.course.id, 'slug': e.course.slug, 'title': e.course.title, 'enrollment_mode': e.course.enrollment_mode},
        'start_date': e.start_date, 'note': e.note, 'created_at': e.created_at, 'updated_at': e.updated_at,
        'decided_at': e.decided_at, 'decided_by': e.decided_by.get_full_name() if e.decided_by else None,
    }


class AdminEnrollmentsView(APIView):
    """GET /lms/admin/enrollments/?status=requested|active|completed|declined|cancelled|all&q=&course=<slug>"""
    permission_classes = [IsAdmin]

    def get(self, request):
        rows = TrainingEnrollment.objects.select_related('student', 'course', 'decided_by')
        counts = dict(rows.values_list('status').annotate(n=Count('id')))
        wanted = request.query_params.get('status', TrainingEnrollment.REQUESTED)
        if wanted != 'all':
            rows = rows.filter(status=wanted)
        q = (request.query_params.get('q') or '').strip()
        if q:
            rows = rows.filter(Q(student__first_name__icontains=q) | Q(student__last_name__icontains=q)
                               | Q(student__email__icontains=q) | Q(course__title__icontains=q))
        if request.query_params.get('course'):
            rows = rows.filter(course__slug=request.query_params['course'])
        # Requests oldest first (they have waited longest); everything else newest first
        rows = rows.order_by('created_at') if wanted == TrainingEnrollment.REQUESTED else rows.order_by('-updated_at')
        return Response({
            'counts': {s: counts.get(s, 0) for s, _ in TrainingEnrollment.STATUS_CHOICES},
            'results': [admin_row(e) for e in rows[:300]],
        })


class AdminEnrollmentDecisionView(APIView):
    """POST /lms/admin/enrollments/decide/ {ids: [..], decision: confirm|decline, note?, start_date?}"""
    permission_classes = [IsAdmin]

    def post(self, request):
        decision = request.data.get('decision')
        if decision not in ('confirm', 'decline'):
            return Response({'decision': 'Choose confirm or decline.'}, status=status.HTTP_400_BAD_REQUEST)
        ids = [int(i) for i in request.data.get('ids') or [] if str(i).isdigit()]
        if not ids:
            return Response({'ids': 'Choose at least one enrollment.'}, status=status.HTTP_400_BAD_REQUEST)
        start = request.data.get('start_date') or None
        if start:
            try:
                start = date.fromisoformat(str(start))
            except ValueError:
                return Response({'start_date': 'Enter a date like 2026-10-15.'}, status=status.HTTP_400_BAD_REQUEST)
        note = request.data.get('note')
        note = str(note).strip() if note is not None else None
        done = []
        with transaction.atomic():
            chosen = TrainingEnrollment.objects.select_related('student', 'course').filter(pk__in=ids).exclude(status=TrainingEnrollment.CANCELLED)
            for e in chosen:
                done.append(admin_row(decide(e, decision, request, note=note or None, start_date=start)))
        return Response({'updated': done})
