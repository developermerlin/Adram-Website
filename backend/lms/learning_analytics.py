"""
A student's learning analytics: daily minutes, streaks, a daily goal, quiz and assignment results, skills earned and
when each course will probably be finished.

  GET /lms/me/analytics/?days=30     everything for the "My progress" page (and the dashboard's streak card)
  PUT /lms/me/goal/ {daily_minutes}   the daily target (5 to 240 minutes)

Days are filled in as the student learns: minutes from the course player's heartbeat, lessons when one is completed.
"""
from datetime import timedelta

from django.db.models import Avg, F
from django.utils import timezone
from rest_framework import status
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView

from portal.models import TrainingEnrollment

from . import access
from .models import Certificate, LearningDay, LearningGoal, Progress, QuizAttempt, Submission

ACTIVE_SECONDS = 60     # a day counts towards the streak after a minute of learning (or a finished lesson)
PACE_DAYS = 28          # the pace used for "probably finished by"


def _today():
    return timezone.localdate()


def record_time(user, seconds):
    """Add learning time to today (called from the course player's heartbeat)."""
    if seconds <= 0:
        return
    day, created = LearningDay.objects.get_or_create(user=user, date=_today(), defaults={'seconds': seconds})
    if not created:
        LearningDay.objects.filter(pk=day.pk).update(seconds=F('seconds') + seconds)


def record_lesson(user):
    """A lesson was finished today."""
    day, created = LearningDay.objects.get_or_create(user=user, date=_today(), defaults={'lessons_completed': 1})
    if not created:
        LearningDay.objects.filter(pk=day.pk).update(lessons_completed=F('lessons_completed') + 1)


def _active(day):
    return day.seconds >= ACTIVE_SECONDS or day.lessons_completed > 0


def streaks(user):
    """(current, longest) runs of days with learning. Today not done yet doesn't break yesterday's streak."""
    days = sorted({d.date for d in LearningDay.objects.filter(user=user) if _active(d)})
    longest = run = 0
    previous = None
    for d in days:
        run = run + 1 if previous and d - previous == timedelta(days=1) else 1
        longest = max(longest, run)
        previous = d
    current = 0
    if days:
        today = _today()
        start = today if days[-1] == today else today - timedelta(days=1)
        if days[-1] >= start:
            active = set(days)
            cursor = start
            while cursor in active:
                current += 1
                cursor -= timedelta(days=1)
    return current, longest


def goal_minutes(user):
    goal = LearningGoal.objects.filter(user=user).first()
    return goal.daily_minutes if goal else 15


def forecast(user):
    """For each course in progress: how far along, the recent pace, and a likely finish date."""
    out = []
    since = timezone.now() - timedelta(days=PACE_DAYS)
    for e in (TrainingEnrollment.objects.filter(student=user, status=TrainingEnrollment.ACTIVE).select_related('course')):
        lessons = access.published_lessons(e.course)
        if not lessons:
            continue
        summary = access.summary(e, lessons)
        left = summary['total'] - summary['completed']
        if left <= 0 or Certificate.objects.filter(enrollment=e, revoked_at__isnull=True).exists():
            continue
        recent = Progress.objects.filter(enrollment=e, completed_at__gte=since).count()
        per_week = round(recent / (PACE_DAYS / 7), 1)
        finish = _today() + timedelta(days=round(7 * left / per_week)) if per_week > 0 else None
        out.append({'course': {'slug': e.course.slug, 'title': e.course.title}, 'percent': summary['percent'],
                    'completed': summary['completed'], 'total': summary['total'], 'lessons_left': left,
                    'per_week': per_week, 'finish_by': finish})
    return sorted(out, key=lambda r: -r['percent'])


def skills(user):
    """Topics of the courses the student has finished: the skills they can show."""
    found = {}
    finished = (TrainingEnrollment.objects.filter(student=user).filter(status=TrainingEnrollment.COMPLETED)
                | TrainingEnrollment.objects.filter(student=user, certificate__isnull=False,
                                                  certificate__revoked_at__isnull=True)).select_related('course').distinct()
    for e in finished:
        for t in e.course.topics or []:
            found.setdefault(t, {'name': t, 'course': e.course.title, 'course_slug': e.course.slug})
    return list(found.values())


class MyAnalyticsView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request):
        user = request.user
        try:
            span = max(7, min(int(request.query_params.get('days', 30)), 365))
        except ValueError:
            span = 30
        today = _today()
        start = today - timedelta(days=span - 1)
        by_date = {d.date: d for d in LearningDay.objects.filter(user=user, date__gte=start - timedelta(days=7))}
        daily = []
        for i in range(span):
            d = start + timedelta(days=i)
            row = by_date.get(d)
            daily.append({'date': d, 'minutes': round((row.seconds if row else 0) / 60), 'lessons': row.lessons_completed if row else 0})
        target = goal_minutes(user)
        week = []
        for i in range(6, -1, -1):
            d = today - timedelta(days=i)
            minutes = round((by_date[d].seconds if d in by_date else 0) / 60)
            week.append({'date': d, 'minutes': minutes, 'met': minutes >= target})
        current, longest = streaks(user)
        all_days = LearningDay.objects.filter(user=user)
        attempts = QuizAttempt.objects.filter(enrollment__student=user, status=QuizAttempt.SUBMITTED).select_related('lesson__section__course')
        work = Submission.objects.filter(enrollment__student=user).select_related('lesson__section__course')
        return Response({
            'totals': {
                'hours': round(sum(d.seconds for d in all_days) / 3600, 1),
                'lessons_completed': Progress.objects.filter(enrollment__student=user, completed_at__isnull=False).count(),
                'courses_completed': TrainingEnrollment.objects.filter(student=user, status=TrainingEnrollment.COMPLETED).count(),
                'certificates': Certificate.objects.filter(enrollment__student=user, revoked_at__isnull=True).count(),
                'active_days': sum(1 for d in all_days if _active(d)),
            },
            'streak': {'current': current, 'longest': longest, 'today': bool(today in by_date and _active(by_date[today]))},
            'goal': {'daily_minutes': target, 'today_minutes': week[-1]['minutes'], 'met_today': week[-1]['met'], 'week': week,
                     'days_met_this_week': sum(1 for w in week if w['met'])},
            'daily': daily,
            'quizzes': {
                'attempts': attempts.count(), 'passed': attempts.filter(passed=True).values('lesson').distinct().count(),
                'average': round(attempts.aggregate(a=Avg('score_percent'))['a'] or 0),
                'recent': [{'lesson': a.lesson.title, 'course': a.lesson.section.course.title, 'score': a.score_percent, 'passed': a.passed,
                            'date': a.finished_at or a.created_at} for a in attempts.order_by('-created_at')[:6]],
            },
            'assignments': {
                'submitted': work.count(), 'approved': work.filter(status=Submission.APPROVED).count(),
                'waiting': work.filter(status=Submission.SUBMITTED).count(),
                'average_grade': round(work.filter(grade__isnull=False).aggregate(a=Avg('grade'))['a'] or 0),
                'recent': [{'lesson': s.lesson.title, 'course': s.lesson.section.course.title, 'status': s.status,
                            'status_display': s.get_status_display(), 'grade': s.grade, 'date': s.created_at} for s in work.order_by('-created_at')[:6]],
            },
            'skills': skills(user),
            'forecast': forecast(user),
        })


class MyGoalView(APIView):
    permission_classes = [IsAuthenticated]

    def put(self, request):
        try:
            minutes = int(request.data.get('daily_minutes'))
        except (TypeError, ValueError):
            minutes = 0
        if not 5 <= minutes <= 240:
            return Response({'daily_minutes': 'Choose between 5 and 240 minutes a day.'}, status=status.HTTP_400_BAD_REQUEST)
        LearningGoal.objects.update_or_create(user=request.user, defaults={'daily_minutes': minutes})
        return Response({'daily_minutes': minutes})
