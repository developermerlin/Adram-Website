"""Numbers and day-by-day series for the instructor and administrator dashboards."""
from datetime import timedelta
from decimal import Decimal

from django.db.models import Avg, Count, Q, Sum
from django.db.models.functions import TruncDate
from django.utils import timezone

from portal.models import TrainingEnrollment

from .models import CourseViewDay, Lesson, Order, OrderItem, Progress, QuizAttempt, Review

LEARNING = [TrainingEnrollment.ACTIVE, TrainingEnrollment.COMPLETED]


def period(request, allowed=(7, 30, 90, 365), default=30):
    try:
        days = int(request.query_params.get('days', default))
    except (TypeError, ValueError):
        days = default
    return days if days in allowed else default


def days_back(days):
    today = timezone.localdate()
    return [today - timedelta(days=i) for i in range(days - 1, -1, -1)]


def series(queryset, field, days, total=None):
    """[{date, value}] for the last `days` days: a count per day, or the sum of `total` per day."""
    since = timezone.now() - timedelta(days=days)
    rows = queryset.filter(**{f'{field}__gte': since}).annotate(day=TruncDate(field)).values('day')
    rows = rows.annotate(value=Sum(total) if total else Count('id'))
    found = {r['day']: r['value'] for r in rows}
    return [{'date': d.isoformat(), 'value': float(found.get(d) or 0) if total else found.get(d, 0)} for d in days_back(days)]


def views_series(courses, days):
    since = timezone.localdate() - timedelta(days=days - 1)
    rows = CourseViewDay.objects.filter(course__in=courses, date__gte=since).values('date').annotate(value=Sum('views'))
    found = {r['date']: r['value'] for r in rows}
    return [{'date': d.isoformat(), 'value': found.get(d, 0)} for d in days_back(days)]


def money(value):
    return f'{Decimal(value or 0):.2f}'


def course_analytics(courses, days):
    """Everything an instructor wants to know about a set of courses over a period."""
    enrollments = TrainingEnrollment.objects.filter(course__in=courses, status__in=LEARNING)
    total_students = enrollments.values('student').distinct().count()
    completed = enrollments.filter(status=TrainingEnrollment.COMPLETED).count()
    progress = Progress.objects.filter(enrollment__course__in=courses)
    watch = progress.aggregate(seconds=Sum('time_spent_seconds'))['seconds'] or 0
    sold = OrderItem.objects.filter(course__in=courses, order__status=Order.SUCCESSFUL)
    reviews = Review.objects.filter(course__in=courses, is_hidden=False)
    rating = reviews.aggregate(avg=Avg('rating'), n=Count('id'))
    quizzes = (QuizAttempt.objects.filter(lesson__section__course__in=courses, status=QuizAttempt.SUBMITTED)
               .values('lesson_id', 'lesson__title', 'lesson__section__course__title')
               .annotate(attempts=Count('id'), average=Avg('score_percent'), passed=Count('id', filter=Q(passed=True))).order_by('-attempts')[:15])
    popular = (Lesson.objects.filter(section__course__in=courses, is_published=True)
               .annotate(learners=Count('progress', filter=Q(progress__last_viewed_at__isnull=False)),
                         completions=Count('progress', filter=Q(progress__completed_at__isnull=False)),
                         seconds=Sum('progress__time_spent_seconds'))
               .order_by('-learners', '-completions')[:10])
    since = timezone.now() - timedelta(days=days)
    return {
        'days': days,
        'totals': {
            'students': total_students,
            'enrollments': enrollments.count(),
            'new_enrollments': enrollments.filter(created_at__gte=since).count(),
            'completion_rate': round(100 * completed / enrollments.count()) if enrollments.count() else 0,
            'watch_hours': round(watch / 3600, 1),
            'views': CourseViewDay.objects.filter(course__in=courses, date__gte=since.date()).aggregate(v=Sum('views'))['v'] or 0,
            'revenue': money(sold.aggregate(t=Sum('amount'))['t']),
            'earnings': money(sold.aggregate(t=Sum('instructor_share'))['t']),
            'rating_average': round(rating['avg'], 1) if rating['avg'] else 0,
            'review_count': rating['n'],
        },
        'enrollments': series(enrollments, 'created_at', days),
        'views': views_series(courses, days),
        'revenue': series(sold, 'order__paid_at', days, total='amount'),
        'earnings': series(sold, 'order__paid_at', days, total='instructor_share'),
        'ratings': {str(star): reviews.filter(rating=star).count() for star in (5, 4, 3, 2, 1)},
        'quizzes': [{'lesson_id': q['lesson_id'], 'title': q['lesson__title'], 'course': q['lesson__section__course__title'],
                     'attempts': q['attempts'], 'average': round(q['average'] or 0), 'pass_rate': round(100 * q['passed'] / q['attempts']) if q['attempts'] else 0}
                    for q in quizzes],
        'popular_lectures': [{'id': l.id, 'title': l.title, 'kind': l.kind, 'learners': l.learners, 'completions': l.completions,
                              'watch_hours': round((l.seconds or 0) / 3600, 1)} for l in popular],
    }
