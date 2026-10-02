"""
Following instructors, and the sales funnel of an instructor's courses.

  POST/DELETE /lms/instructors/<id>/follow/     follow / stop following (signed-in; not yourself)
  GET  /lms/me/following/                       the instructors I follow
  GET  /lms/instructor/followers/?days=30       my followers: count, new ones over time, the latest
  GET  /lms/instructor/funnel/?days=30&course=  from seeing a course to finishing it, step by step

Followers are told (in-app) when the instructor publishes a new course, once per course.
"""
from datetime import timedelta

from django.db.models import Count, Exists, OuterRef, Sum
from django.shortcuts import get_object_or_404
from django.utils import timezone
from rest_framework import status
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView

from accounts.models import User
from catalog.models import Course
from portal.models import TrainingEnrollment

from . import access, analytics
from .briefs import photo_url, public_name
from .models import Certificate, CourseViewDay, InstructorFollow, Notification, Order, OrderItem, Progress
from .notify import notify


def follow_data(instructor, user):
    return {'id': instructor.id, 'followers': InstructorFollow.objects.filter(instructor=instructor).count(),
            'following': bool(user and user.is_authenticated and InstructorFollow.objects.filter(user=user, instructor=instructor).exists())}


def tell_followers(course):
    """A course of the instructor's went live: tell their followers (each follower once per course)."""
    link = f'/courses/{course.slug}'
    told = Notification.objects.filter(kind='new_course', link=link).values('user_id')
    followers = (User.objects.filter(following__instructor_id=course.instructor_id, is_active=True)
                 .exclude(pk__in=told).exclude(pk=course.instructor_id))
    name = course.instructor.get_full_name() or 'An instructor you follow'
    notify(list(followers), 'new_course', f'New course from {name}', course.title, link)


class FollowView(APIView):
    permission_classes = [IsAuthenticated]

    def _instructor(self, pk):
        user = get_object_or_404(User, pk=pk, is_active=True)
        if user.role != User.INSTRUCTOR and not Course.objects.filter(instructor=user, is_published=True).exists():
            return None
        return user

    def post(self, request, pk):
        instructor = self._instructor(pk)
        if not instructor:
            return Response({'detail': 'Not found.'}, status=status.HTTP_404_NOT_FOUND)
        if instructor.id == request.user.id:
            return Response({'detail': 'You can’t follow yourself.'}, status=status.HTTP_400_BAD_REQUEST)
        _, created = InstructorFollow.objects.get_or_create(user=request.user, instructor=instructor)
        if created:
            notify(instructor, 'system', f'{public_name(request.user)} is now following you',
                   'They’ll hear about your new courses.', '/instructor/analytics')
        return Response(follow_data(instructor, request.user), status=status.HTTP_201_CREATED if created else status.HTTP_200_OK)

    def delete(self, request, pk):
        instructor = get_object_or_404(User, pk=pk)
        InstructorFollow.objects.filter(user=request.user, instructor=instructor).delete()
        return Response(follow_data(instructor, request.user))


class MyFollowingView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request):
        rows = InstructorFollow.objects.filter(user=request.user).select_related('instructor__lms_profile')
        live = Course.objects.filter(instructor=OuterRef('instructor_id'), is_published=True)
        rows = rows.annotate(has_courses=Exists(live))
        counts = dict(Course.objects.filter(is_published=True, instructor__in=[r.instructor_id for r in rows])
                      .values_list('instructor').annotate(n=Count('id')))
        return Response([{'id': r.instructor_id, 'name': r.instructor.get_full_name() or 'Instructor', 'photo': photo_url(r.instructor),
                          'headline': getattr(getattr(r.instructor, 'lms_profile', None), 'headline', ''),
                          'courses': counts.get(r.instructor_id, 0), 'since': r.created_at} for r in rows])


class MyFollowersView(APIView):
    permission_classes = [access.IsAdminOrInstructor]

    def get(self, request):
        days = analytics.period(request)
        follows = InstructorFollow.objects.filter(instructor=request.user)
        since = timezone.now() - timedelta(days=days)
        return Response({
            'total': follows.count(), 'new': follows.filter(created_at__gte=since).count(), 'days': days,
            'series': analytics.series(follows, 'created_at', days),
            'latest': [{'name': public_name(f.user), 'since': f.created_at} for f in follows.select_related('user')[:10]],
        })


def wishlist_saves(courses, days):
    """Saving to a wishlist is a side path (people can buy without it), so it is counted beside the funnel."""
    since_date = timezone.localdate() - timedelta(days=days - 1)
    return CourseViewDay.objects.filter(course__in=courses, date__gte=since_date).aggregate(n=Sum('wishlist_adds'))['n'] or 0


def funnel(courses, days):
    """Each step from seeing the courses to finishing them, over the last `days` days."""
    since_date = timezone.localdate() - timedelta(days=days - 1)
    since = timezone.now() - timedelta(days=days)
    counted = CourseViewDay.objects.filter(course__in=courses, date__gte=since_date).aggregate(
        views=Sum('views'), cart=Sum('cart_adds'), checkouts=Sum('checkouts'))
    paid_courses = [c for c in courses if not c.is_free]
    enrolled = TrainingEnrollment.objects.filter(course__in=courses, created_at__gte=since,
                                                 status__in=[TrainingEnrollment.ACTIVE, TrainingEnrollment.COMPLETED])
    started = enrolled.filter(Exists(Progress.objects.filter(enrollment=OuterRef('pk'), last_viewed_at__isnull=False)))
    finished = enrolled.filter(Exists(Certificate.objects.filter(enrollment=OuterRef('pk'))))
    bought = OrderItem.objects.filter(course__in=paid_courses, order__status=Order.SUCCESSFUL, order__paid_at__gte=since).count()
    steps = [('views', 'Viewed the course page', counted['views'] or 0)]
    if paid_courses:
        steps += [('cart', 'Added to the cart', counted['cart'] or 0),
                  ('checkouts', 'Placed an order', counted['checkouts'] or 0),
                  ('paid', 'Paid', bought)]
    steps += [('enrolled', 'Enrolled', enrolled.count()),
              ('started', 'Started learning', started.count()),
              ('finished', 'Finished (certificate)', finished.count())]
    out, first, previous = [], steps[0][2], None
    for key, label, value in steps:
        out.append({'key': key, 'label': label, 'value': value,
                    'of_first': round(100 * value / first, 1) if first else None,
                    'of_previous': round(100 * value / previous, 1) if previous else None})
        previous = value
    return out


class FunnelView(APIView):
    permission_classes = [access.IsAdminOrInstructor]

    def get(self, request):
        from .instructor import my_courses
        courses = my_courses(request.user)
        wanted = request.query_params.get('course')
        if wanted:
            courses = courses.filter(slug=wanted)
        days = analytics.period(request)
        courses = list(courses)
        per_course = []
        for course in courses:
            steps = {s['key']: s['value'] for s in funnel([course], days)}
            per_course.append({'slug': course.slug, 'title': course.title, 'is_free': course.is_free, **steps,
                               'wishlist': wishlist_saves([course], days),
                               'conversion': round(100 * steps['enrolled'] / steps['views'], 1) if steps['views'] else None})
        per_course.sort(key=lambda r: -r['views'])
        return Response({'days': days, 'steps': funnel(courses, days), 'wishlist': wishlist_saves(courses, days), 'courses': per_course})
