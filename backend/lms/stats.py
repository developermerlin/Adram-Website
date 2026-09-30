"""The numbers on a course page and catalogue card."""
from django.db.models import Avg, Count, Sum

from portal.models import TrainingEnrollment

from .models import Lesson, Review


def course_stats(course):
    lessons = Lesson.objects.filter(section__course=course, is_published=True).aggregate(count=Count('id'), seconds=Sum('duration_seconds'))
    reviews = Review.objects.filter(course=course, is_hidden=False).aggregate(average=Avg('rating'), count=Count('id'))
    students = TrainingEnrollment.objects.filter(
        course=course, status__in=[TrainingEnrollment.ACTIVE, TrainingEnrollment.COMPLETED]).count()
    return {
        'lesson_count': lessons['count'] or 0,
        'total_seconds': lessons['seconds'] or 0,
        'rating_average': round(reviews['average'], 1) if reviews['average'] else 0,
        'rating_count': reviews['count'] or 0,
        'student_count': students,
    }


def stats_for(courses):
    """course_stats for many courses in four queries: {course_id: stats}."""
    ids = [c.id for c in courses]
    out = {i: {'lesson_count': 0, 'total_seconds': 0, 'rating_average': 0, 'rating_count': 0, 'student_count': 0} for i in ids}
    for row in (Lesson.objects.filter(section__course_id__in=ids, is_published=True).values('section__course_id')
                .annotate(count=Count('id'), seconds=Sum('duration_seconds'))):
        out[row['section__course_id']].update(lesson_count=row['count'], total_seconds=row['seconds'] or 0)
    for row in Review.objects.filter(course_id__in=ids, is_hidden=False).values('course_id').annotate(average=Avg('rating'), count=Count('id')):
        out[row['course_id']].update(rating_average=round(row['average'], 1) if row['average'] else 0, rating_count=row['count'])
    for row in (TrainingEnrollment.objects.filter(course_id__in=ids, status__in=[TrainingEnrollment.ACTIVE, TrainingEnrollment.COMPLETED])
                .values('course_id').annotate(count=Count('id'))):
        out[row['course_id']]['student_count'] = row['count']
    return out
