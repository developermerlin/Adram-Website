"""Who may see which lesson, who may manage which course, and how far through a course a student is."""
from django.utils import timezone
from rest_framework.permissions import BasePermission

from accounts.models import User
from portal.models import TrainingEnrollment

from .models import Certificate, Lesson, Progress, QuizAttempt, Submission


# ---------------------------------------------------------------- roles

def is_admin(user):
    return bool(user and user.is_authenticated and user.role == User.ADMIN)


def is_super_admin(user):
    return is_admin(user) and user.is_superuser


def is_instructor(user):
    return bool(user and user.is_authenticated and user.role == User.INSTRUCTOR)


def can_manage(user, course):
    """Administrators manage every course; an instructor manages the courses they own."""
    return is_admin(user) or (is_instructor(user) and course.instructor_id == user.id)


class IsAdminOrInstructor(BasePermission):
    message = 'Only instructors and administrators can do this.'

    def has_permission(self, request, view):
        return is_admin(request.user) or is_instructor(request.user)


class IsInstructor(BasePermission):
    message = 'Only instructors can do this.'

    def has_permission(self, request, view):
        return is_instructor(request.user)


# ---------------------------------------------------------------- learning

def enrollment_for(user, course):
    """The student's place on the programme, if it is confirmed (enrolled or completed)."""
    if not (user and user.is_authenticated):
        return None
    enrollment = TrainingEnrollment.objects.filter(
        student=user, course=course, status__in=[TrainingEnrollment.ACTIVE, TrainingEnrollment.COMPLETED],
    ).first()
    if enrollment is not None:
        from .premium import blocked_reason
        if blocked_reason(enrollment):  # Premium ended, or a payment-plan part is overdue
            return None
    return enrollment


def published_lessons(course):
    """Every published lesson of a course in the order a student meets them."""
    return list(
        Lesson.objects.filter(section__course=course, is_published=True)
        .select_related('section').order_by('section__sort_order', 'section__id', 'sort_order', 'id')
    )


def can_open(user, lesson, enrollment):
    """Course managers can open anything (to preview drafts); students the published lessons of programmes they're on;
    everyone the published free-preview lessons."""
    if user and user.is_authenticated and can_manage(user, lesson.section.course):
        return True
    return lesson.is_published and (lesson.is_preview or enrollment is not None)


def done_ids(enrollment, lessons):
    if not enrollment:
        return set()
    return set(Progress.objects.filter(enrollment=enrollment, lesson__in=lessons, completed_at__isnull=False).values_list('lesson_id', flat=True))


def summary(enrollment, lessons):
    """{total, completed, percent, done_ids, resume_id, required, required_done, sections} for one student on one course."""
    done = done_ids(enrollment, lessons)
    total = len(lessons)
    required = [lesson for lesson in lessons if lesson.is_required]
    last = None
    if enrollment:
        last = (Progress.objects.filter(enrollment=enrollment, lesson__in=lessons, last_viewed_at__isnull=False)
                .order_by('-last_viewed_at').values_list('lesson_id', flat=True).first())
    first_open = next((lesson.id for lesson in lessons if lesson.id not in done), lessons[-1].id if lessons else None)
    # Carry on from the lesson last opened unless it is finished, then the first lesson not done yet
    resume = last if last and last not in done else first_open
    sections = {}
    for lesson in lessons:
        row = sections.setdefault(lesson.section_id, {'id': lesson.section_id, 'total': 0, 'completed': 0})
        row['total'] += 1
        row['completed'] += lesson.id in done
    for row in sections.values():
        row['percent'] = round(100 * row['completed'] / row['total']) if row['total'] else 0
    return {
        'total': total,
        'completed': len(done),
        'percent': round(100 * len(done) / total) if total else 0,
        'done_ids': sorted(done),
        'resume_id': resume,
        'last_lesson_id': last,
        'required': len(required),
        'required_done': sum(1 for lesson in required if lesson.id in done),
        'sections': list(sections.values()),
    }


def requirements_met(enrollment, lessons):
    """Every required lesson done (quizzes passed and assignments approved mark their lesson done)."""
    required = [lesson for lesson in lessons if lesson.is_required] or lessons
    done = done_ids(enrollment, required)
    return bool(required) and all(lesson.id in done for lesson in required)


def finish_if_done(enrollment):
    """When the completion requirements are met the programme is completed and the certificate is issued.
    Returns (certificate or None, whether it was just issued)."""
    lessons = published_lessons(enrollment.course)
    existing = Certificate.objects.filter(enrollment=enrollment).first()
    if existing or not requirements_met(enrollment, lessons):
        return existing, False
    if enrollment.status == TrainingEnrollment.ACTIVE:
        enrollment.status = TrainingEnrollment.COMPLETED
        enrollment.save(update_fields=['status', 'updated_at'])
    from .models import CertificateTemplate
    certificate, created = Certificate.objects.get_or_create(
        enrollment=enrollment, defaults={'template': CertificateTemplate.for_course(enrollment.course)})
    if created:
        from .notify import notify
        course = enrollment.course
        notify(enrollment.student, 'certificate', f'You completed {course.title}!',
               'Your certificate is ready to view, download and share.', f'/certificate/{certificate.code}')
    return certificate, created


def mark_complete(enrollment, lesson):
    progress, _ = Progress.objects.get_or_create(enrollment=enrollment, lesson=lesson)
    if not progress.completed_at:
        progress.completed_at = timezone.now()
        progress.save(update_fields=['completed_at', 'updated_at'])
        from .learning_analytics import record_lesson
        record_lesson(enrollment.student)  # today's lessons, for streaks and charts
    return progress


def quiz_record(enrollment, lesson):
    """{attempts, best, last, passed, attempts_left} for one student on one quiz."""
    attempts = list(QuizAttempt.objects.filter(enrollment=enrollment, lesson=lesson, status=QuizAttempt.SUBMITTED)) if enrollment else []
    best = max((a.score_percent for a in attempts), default=None)
    passed_at = min((a.finished_at or a.created_at for a in attempts if a.passed), default=None)
    left = None if not lesson.max_attempts else max(0, lesson.max_attempts - len(attempts))
    return {
        'attempts': len(attempts),
        'best_score': best,
        'last': {'score_percent': attempts[0].score_percent, 'passed': attempts[0].passed, 'created_at': attempts[0].finished_at or attempts[0].created_at} if attempts else None,
        'passed': passed_at is not None,
        'passed_at': passed_at,
        'attempts_left': left,
    }


def latest_submission(enrollment, lesson):
    return Submission.objects.filter(enrollment=enrollment, lesson=lesson).first() if enrollment else None
