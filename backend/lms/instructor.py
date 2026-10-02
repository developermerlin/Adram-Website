"""
The instructor side: an instructor manages the courses they own (administrators may use these too).

  GET       /lms/instructor/dashboard/                 totals, recent enrolments, questions and reviews
  GET/POST  /lms/instructor/courses/                   my courses / create a draft {title}
  GET/PATCH/DELETE /lms/instructor/courses/<slug>/     course information, pricing, landing page (delete: drafts only)
  POST      /lms/instructor/courses/<slug>/submit/     send for review
  POST      /lms/instructor/courses/<slug>/publish/    {publish: true|false} once approved
  GET       /lms/instructor/analytics/?days=&course=   charts and tables
  GET       /lms/instructor/earnings/                  revenue, commission, refunds, net, paid and pending
  GET       /lms/instructor/questions/?filter=unanswered   Q&A across my courses
  GET       /lms/instructor/reviews/                   reviews of my courses
The curriculum builder (sections, lessons, quizzes, assignments, resources) is under /lms/manage/ (builder.py).
"""
from datetime import timedelta
from decimal import Decimal

from django.db.models import Count, Q, Sum
from django.db.models.functions import TruncMonth
from django.shortcuts import get_object_or_404
from django.utils import timezone
from rest_framework import status
from rest_framework.response import Response
from rest_framework.views import APIView

from accounts.models import User
from catalog.models import Course
from catalog.serializers import CourseManageSerializer
from portal.models import TrainingEnrollment

from . import access, analytics
from .briefs import public_name
from .commerce import earnings_summary
from .community import annotated_threads, thread_row
from .models import Order, OrderItem, Payout, Review
from .notify import notify_admins
from .stats import stats_for

LEARNING = [TrainingEnrollment.ACTIVE, TrainingEnrollment.COMPLETED]
PENDING_REVIEW = [Course.SUBMITTED, Course.IN_REVIEW]


class InstructorCourseSerializer(CourseManageSerializer):
    """What an instructor may edit on their own course: not who owns it, how enrolment works, or whether it is live."""
    class Meta(CourseManageSerializer.Meta):
        fields = [
            'id', 'slug', 'title', 'subtitle', 'icon', 'summary', 'topics', 'duration', 'price', 'discount_price',
            'sale_starts_at', 'sale_ends_at',
            'description', 'learn_points', 'requirements', 'audience', 'level', 'language', 'thumbnail', 'promo_video_url',
            'category', 'subcategory', 'faqs', 'caption_languages', 'includes', 'feature', 'allow_downloads', 'allow_video_downloads', 'status', 'review_note', 'submitted_at', 'published_at', 'is_published',
            'created_at', 'updated_at', 'updated_by_name',
        ]
        read_only_fields = ['id', 'status', 'review_note', 'submitted_at', 'published_at', 'is_published', 'created_at', 'updated_at']


def my_courses(user):
    """The courses an instructor owns (an administrator sees every course)."""
    courses = Course.objects.select_related('category', 'subcategory', 'instructor')
    return courses if access.is_admin(user) else courses.filter(instructor=user)


def own_course(request, slug):
    course = get_object_or_404(Course, slug=slug)
    if not access.can_manage(request.user, course):
        from django.http import Http404
        raise Http404
    return course


def course_row(course, stats, revenue):
    return {'id': course.id, 'slug': course.slug, 'title': course.title, 'subtitle': course.subtitle, 'thumbnail': course.thumbnail,
            'icon': course.icon, 'status': course.status, 'status_display': course.get_status_display(), 'is_published': course.is_published,
            'review_note': course.review_note, 'price': analytics.money(course.price) if course.price else None,
            'sale_price': analytics.money(course.sale_price), 'updated_at': course.updated_at, 'stats': stats, 'revenue': revenue}


def _revenue_by_course(courses):
    rows = OrderItem.objects.filter(course__in=courses, order__status=Order.SUCCESSFUL).values('course_id').annotate(t=Sum('amount'))
    return {r['course_id']: analytics.money(r['t']) for r in rows}


class DashboardView(APIView):
    permission_classes = [access.IsAdminOrInstructor]

    def get(self, request):
        courses = list(my_courses(request.user))
        stats = stats_for(courses)
        revenue = _revenue_by_course(courses)
        counts = {s: 0 for s, _ in Course.STATUSES}
        for c in courses:
            counts[c.status] += 1
        enrollments = TrainingEnrollment.objects.filter(course__in=courses, status__in=LEARNING).select_related('student', 'course')
        reviews = Review.objects.filter(course__in=courses, is_hidden=False).select_related('student', 'course')
        rated = [s for s in stats.values() if s['rating_count']]
        threads = annotated_threads(request.user).filter(course__in=courses)
        return Response({
            'totals': {
                'courses': len(courses), 'published': counts[Course.PUBLISHED],
                'drafts': counts[Course.DRAFT] + counts[Course.CHANGES] + counts[Course.REJECTED],
                'pending': counts[Course.SUBMITTED] + counts[Course.IN_REVIEW], 'approved': counts[Course.APPROVED],
                'students': enrollments.values('student').distinct().count(),
                'revenue': analytics.money(sum((Decimal(v) for v in revenue.values()), Decimal('0'))),
                'rating_average': round(sum(s['rating_average'] * s['rating_count'] for s in rated) / sum(s['rating_count'] for s in rated), 1) if rated else 0,
                'reviews': reviews.count(),
                'unanswered_questions': threads.filter(answered=False).count(),
            },
            'earnings': earnings_summary(request.user),
            'courses': [course_row(c, stats[c.id], revenue.get(c.id, '0.00')) for c in courses],
            'recent_enrollments': [{'student': e.student.get_full_name() or public_name(e.student), 'course': e.course.title,
                                    'course_slug': e.course.slug, 'created_at': e.created_at} for e in enrollments.order_by('-created_at')[:8]],
            'recent_questions': [thread_row(t, request.user) for t in threads.order_by('-created_at')[:8]],
            'recent_reviews': [{'id': r.id, 'student': public_name(r.student), 'course': r.course.title, 'course_slug': r.course.slug,
                                'rating': r.rating, 'comment': r.comment, 'created_at': r.created_at} for r in reviews[:8]],
        })


class CoursesView(APIView):
    permission_classes = [access.IsAdminOrInstructor]

    def get(self, request):
        courses = list(my_courses(request.user).order_by('-updated_at'))
        stats = stats_for(courses)
        revenue = _revenue_by_course(courses)
        return Response([course_row(c, stats[c.id], revenue.get(c.id, '0.00')) for c in courses])

    def post(self, request):
        title = str(request.data.get('title', '')).strip()
        if not title:
            return Response({'title': 'Give your course a working title.'}, status=status.HTTP_400_BAD_REQUEST)
        course = Course(title=title[:200], summary=str(request.data.get('summary', '')).strip()[:500] or title[:200],
                        instructor=request.user if access.is_instructor(request.user) else None,
                        enrollment_mode=Course.OPEN, status=Course.DRAFT, is_published=False, updated_by=request.user)
        last = Course.objects.order_by('-sort_order').values_list('sort_order', flat=True).first()
        course.sort_order = (last or 0) + 10
        course.save()
        return Response(InstructorCourseSerializer(course, context={'request': request}).data, status=status.HTTP_201_CREATED)


class CourseDetailView(APIView):
    permission_classes = [access.IsAdminOrInstructor]

    def get(self, request, slug):
        return Response(InstructorCourseSerializer(own_course(request, slug), context={'request': request}).data)

    def patch(self, request, slug):
        course = own_course(request, slug)
        serializer = InstructorCourseSerializer(course, data=request.data, partial=True, context={'request': request})
        serializer.is_valid(raise_exception=True)
        serializer.save()
        return Response(serializer.data)

    def delete(self, request, slug):
        course = own_course(request, slug)
        if course.is_published or TrainingEnrollment.objects.filter(course=course).exists() or OrderItem.objects.filter(course=course).exists():
            return Response({'detail': 'Courses that are live or have students cannot be deleted. Ask an administrator to unpublish it.'},
                            status=status.HTTP_400_BAD_REQUEST)
        from . import audit
        audit.record(request, 'course_deleted', course)
        course.delete()
        return Response(status=status.HTTP_204_NO_CONTENT)


def submission_problems(course):
    """What is missing before a course can be sent for review."""
    from .access import published_lessons
    problems = []
    if len(course.summary.strip()) < 20:
        problems.append('Write a short summary (at least 20 characters).')
    if len(course.description.strip()) < 100:
        problems.append('Write a course description (at least 100 characters).')
    if len(course.learn_points) < 2:
        problems.append('Add at least two learning objectives.')
    if not course.category_id:
        problems.append('Choose a category.')
    if not course.thumbnail:
        problems.append('Add a course image.')
    if len(published_lessons(course)) < 1:
        problems.append('Publish at least one lesson in the curriculum.')
    return problems


class SubmitView(APIView):
    permission_classes = [access.IsAdminOrInstructor]

    def post(self, request, slug):
        course = own_course(request, slug)
        if course.status not in (Course.DRAFT, Course.CHANGES, Course.REJECTED):
            return Response({'detail': f'This course is {course.get_status_display().lower()}.'}, status=status.HTTP_400_BAD_REQUEST)
        problems = submission_problems(course)
        if problems:
            return Response({'detail': 'Finish these before submitting:', 'problems': problems}, status=status.HTTP_400_BAD_REQUEST)
        course.status, course.submitted_at = Course.SUBMITTED, timezone.now()
        course.save(update_fields=['status', 'submitted_at', 'updated_at'])
        notify_admins('course_review', f'Course submitted for review: {course.title}', f'By {request.user.get_full_name()}', '/admin/course-reviews')
        return Response(InstructorCourseSerializer(course, context={'request': request}).data)


class PublishView(APIView):
    permission_classes = [access.IsAdminOrInstructor]

    def post(self, request, slug):
        course = own_course(request, slug)
        publish = bool(request.data.get('publish', True))
        if publish and course.status not in (Course.APPROVED, Course.PUBLISHED) and not access.is_admin(request.user):
            return Response({'detail': 'Your course must be approved before it can be published.'}, status=status.HTTP_400_BAD_REQUEST)
        course.is_published = publish
        if not publish:
            course.status = Course.APPROVED
        course.save()
        from . import audit
        audit.record(request, 'course_published' if publish else 'course_unpublished', course)
        return Response(InstructorCourseSerializer(course, context={'request': request}).data)


class AnalyticsView(APIView):
    permission_classes = [access.IsAdminOrInstructor]

    def get(self, request):
        courses = my_courses(request.user)
        wanted = request.query_params.get('course')
        if wanted:
            courses = courses.filter(slug=wanted)
        data = analytics.course_analytics(list(courses), analytics.period(request))
        data['courses'] = [{'slug': c.slug, 'title': c.title} for c in my_courses(request.user)]
        return Response(data)


class EarningsView(APIView):
    permission_classes = [access.IsAdminOrInstructor]

    def get(self, request):
        user = request.user
        items = OrderItem.objects.filter(instructor=user).select_related('order__student', 'course')
        sold = items.filter(order__status__in=[Order.SUCCESSFUL, Order.REFUNDED])
        monthly = (items.filter(order__status=Order.SUCCESSFUL, order__paid_at__gte=timezone.now() - timedelta(days=365))
                   .annotate(month=TruncMonth('order__paid_at')).values('month')
                   .annotate(gross=Sum('amount'), net=Sum('instructor_share'), sales=Count('id')).order_by('month'))
        by_course = (items.filter(order__status=Order.SUCCESSFUL).values('course__slug', 'title')
                     .annotate(gross=Sum('amount'), net=Sum('instructor_share'), sales=Count('id')).order_by('-gross'))
        from .models import LmsSettings
        return Response({
            'summary': earnings_summary(user),
            'commission_percent': str(LmsSettings.load().commission_percent),
            'monthly': [{'month': m['month'].date().isoformat() if hasattr(m['month'], 'date') else str(m['month']),
                         'gross': analytics.money(m['gross']), 'net': analytics.money(m['net']), 'sales': m['sales']} for m in monthly],
            'by_course': [{'slug': r['course__slug'], 'title': r['title'], 'gross': analytics.money(r['gross']), 'net': analytics.money(r['net']),
                           'sales': r['sales']} for r in by_course],
            'sales': [{'order': i.order.number, 'course': i.title, 'student': public_name(i.order.student), 'amount': analytics.money(i.amount),
                       'share': analytics.money(i.instructor_share), 'commission_percent': str(i.commission_percent),
                       'status': i.order.status, 'date': i.order.paid_at or i.order.created_at} for i in sold.order_by('-order__created_at')[:100]],
            'payouts': [{'id': p.id, 'amount': analytics.money(p.amount), 'method': p.method, 'reference': p.reference, 'note': p.note,
                         'paid_at': p.paid_at} for p in Payout.objects.filter(instructor=user)[:100]],
        })


class QuestionsView(APIView):
    permission_classes = [access.IsAdminOrInstructor]

    def get(self, request):
        threads = annotated_threads(request.user).filter(course__in=my_courses(request.user))
        if request.query_params.get('filter') == 'unanswered':
            threads = threads.filter(answered=False)
        if request.query_params.get('course'):
            threads = threads.filter(course__slug=request.query_params['course'])
        return Response({'unanswered': annotated_threads(request.user).filter(course__in=my_courses(request.user), answered=False).count(),
                         'threads': [thread_row(t, request.user) for t in threads.order_by('-updated_at')[:200]]})


class ReviewsView(APIView):
    permission_classes = [access.IsAdminOrInstructor]

    def get(self, request):
        reviews = Review.objects.filter(course__in=my_courses(request.user), is_hidden=False).select_related('student', 'course')
        if request.query_params.get('course'):
            reviews = reviews.filter(course__slug=request.query_params['course'])
        return Response([{'id': r.id, 'student': public_name(r.student), 'course': r.course.title, 'course_slug': r.course.slug,
                          'rating': r.rating, 'comment': r.comment, 'created_at': r.created_at} for r in reviews[:300]])
