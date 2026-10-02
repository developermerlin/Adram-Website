"""
Assignment deadlines, late work, rubrics and handing in several files.

A deadline is either one date for everyone (Lesson.due_at) or a number of days after the student enrols (due_days).
Late work is accepted and marked late, accepted with a penalty taken off the grade, or refused (late_policy).
A rubric is a list of criteria with points; grading scores each one and the grade is their sum.

  GET /lms/me/deadlines/      the student's assignments due soon or overdue (not yet approved)

Reminders: `python manage.py send_deadline_reminders` (run it every hour, e.g. with Windows Task Scheduler or cron)
tells students about work due within a day that they haven't handed in. Each reminder is sent once.
"""
from datetime import timedelta

from django.utils import timezone
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView

from portal.models import TrainingEnrollment

from . import access
from .models import Lesson, Notification, Submission
from .notify import notify

MAX_FILES, MAX_CRITERIA = 10, 20


def due_for(lesson, enrollment):
    """When this student's work is due, or None."""
    if lesson.due_at:
        return lesson.due_at
    if lesson.due_days and enrollment:
        return (enrollment.decided_at or enrollment.created_at) + timedelta(days=lesson.due_days)
    return None


def late_state(lesson, enrollment, now=None):
    """(is_late, penalty_percent, closed) for work handed in now."""
    due = due_for(lesson, enrollment)
    if not due or (now or timezone.now()) <= due:
        return False, 0, False
    if lesson.late_policy == Lesson.CLOSED:
        return True, 0, True
    return True, lesson.late_penalty_percent if lesson.late_policy == Lesson.PENALTY else 0, False


def assignment_info(lesson, enrollment):
    """Deadline and rules shown to the student."""
    due = due_for(lesson, enrollment)
    late, penalty, closed = late_state(lesson, enrollment)
    return {'due_at': due, 'overdue': late, 'closed': closed, 'late_policy': lesson.late_policy,
            'late_policy_display': lesson.get_late_policy_display(), 'late_penalty_percent': lesson.late_penalty_percent,
            'max_files': lesson.max_files, 'rubric': lesson.rubric or []}


def clean_rubric(value):
    """[{title, description, points}] or raises ValueError."""
    if value in (None, ''):
        return []
    if not isinstance(value, list) or len(value) > MAX_CRITERIA:
        raise ValueError(f'A rubric has at most {MAX_CRITERIA} criteria.')
    out = []
    for number, row in enumerate(value, start=1):
        row = row if isinstance(row, dict) else {}
        title = str(row.get('title', '')).strip()[:120]
        if not title:
            raise ValueError(f'Criterion {number} needs a name.')
        try:
            points = int(row.get('points'))
        except (TypeError, ValueError):
            points = 0
        if not 1 <= points <= 1000:
            raise ValueError(f'Criterion {number}: give it between 1 and 1000 points.')
        out.append({'title': title, 'description': str(row.get('description', '')).strip()[:500], 'points': points})
    if sum(c['points'] for c in out) > 1000:
        raise ValueError('The criteria add up to more than 1000 points.')
    return out


def clean_scores(lesson, value):
    """Points for each rubric criterion, or raises ValueError."""
    rubric = lesson.rubric or []
    if not isinstance(value, list) or len(value) != len(rubric):
        raise ValueError('Score every criterion of the rubric.')
    scores = []
    for criterion, score in zip(rubric, value):
        try:
            score = int(score)
        except (TypeError, ValueError):
            raise ValueError(f'“{criterion["title"]}” needs a score.') from None
        if not 0 <= score <= criterion['points']:
            raise ValueError(f'“{criterion["title"]}” is scored from 0 to {criterion["points"]}.')
        scores.append(score)
    return scores


def open_assignments(enrollment):
    """(lesson, due, latest submission) for each published assignment with a deadline that still needs work."""
    for lesson in access.published_lessons(enrollment.course):
        if lesson.kind != Lesson.ASSIGNMENT:
            continue
        due = due_for(lesson, enrollment)
        if not due:
            continue
        latest = access.latest_submission(enrollment, lesson)
        if latest and latest.status != Submission.REJECTED:
            continue  # handed in: waiting for grading, or approved
        yield lesson, due, latest


def send_reminders(within=timedelta(hours=24), now=None):
    """Remind students of work due soon. Returns how many reminders were sent."""
    now = now or timezone.now()
    sent = 0
    for enrollment in TrainingEnrollment.objects.filter(status=TrainingEnrollment.ACTIVE).select_related('course', 'student'):
        for lesson, due, _ in open_assignments(enrollment):
            if not now < due <= now + within:
                continue
            link = f'/learn/{enrollment.course.slug}/lesson/{lesson.id}'
            if Notification.objects.filter(user=enrollment.student, kind='assignment_due', link=link).exists():
                continue
            hours = max(1, round((due - now).total_seconds() / 3600))
            notify(enrollment.student, 'assignment_due', f'Due in {hours} hour{"s" if hours != 1 else ""}: {lesson.title}',
                   f'{enrollment.course.title}. Hand in your work before the deadline.', link)
            sent += 1
    return sent


def after_penalty(grade, percent):
    return grade if grade is None or not percent else round(grade * (100 - percent) / 100)


class MyDeadlinesView(APIView):
    """Assignments still to do (or to redo) on the student's courses, soonest first."""
    permission_classes = [IsAuthenticated]

    def get(self, request):
        now = timezone.now()
        rows = []
        enrollments = TrainingEnrollment.objects.filter(student=request.user, status=TrainingEnrollment.ACTIVE).select_related('course')
        for enrollment in enrollments:
            for lesson, due, latest in open_assignments(enrollment):
                rows.append({'lesson': {'id': lesson.id, 'title': lesson.title},
                             'course': {'slug': enrollment.course.slug, 'title': enrollment.course.title},
                             'due_at': due, 'overdue': due < now, 'redo': bool(latest),
                             'closed': due < now and lesson.late_policy == Lesson.CLOSED})
        rows.sort(key=lambda r: r['due_at'])
        return Response(rows[:20])
