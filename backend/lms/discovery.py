"""
Finding courses, and the pages about people.

  GET  /lms/catalog/?q=&category=&subcategory=&level=&language=&price=free|paid|discounted&rating=4&duration=short|medium|long
                    &instructor=<id>&sort=relevance|popular|trending|newest|rating|price_low|price_high&page=&page_size=
                    (a search that finds nothing is retried with spelling corrected: `showing_for` / `searched_for`)
  GET  /lms/catalog/facets/                   what the filters can offer, with counts
  GET  /lms/catalog/home/                     rows for the Training page: popular, new, top rated, free, on sale, recommended
  GET  /lms/courses/<slug>/related/           similar courses
  POST /lms/courses/<slug>/view/              counts a visit (and remembers it for recommendations)
  GET  /lms/instructors/<id>/                 an instructor's public profile and courses
  GET  /lms/me/dashboard/                     everything on the student's learning dashboard
  GET/PUT /lms/me/profile/                    my public profile (headline, bio, expertise, interests, links) and statistics
  GET  /lms/me/notifications/?unread=true     POST /lms/me/notifications/read/ {ids: [...]} or {all: true}
"""
import math
import unicodedata

from django.db.models import Avg, Count, F, Sum
from django.shortcuts import get_object_or_404
from django.utils import timezone
from rest_framework import serializers, status
from rest_framework.permissions import AllowAny, IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView

from accounts.models import User
from catalog.models import Category, Course
from portal.models import TrainingEnrollment

from . import access, recommend
from .briefs import course_brief, photo_url, public_name
from .commerce import order_data
from .followers import follow_data
from .media import embed_url
from .models import (
    CartItem, Certificate, CourseViewDay, Notification, Order, Profile, Progress, QuizAttempt, RecentlyViewed, Review, Wishlist,
)
from .stats import stats_for
from .views import certificate_data, learning_rows

LEARNING = [TrainingEnrollment.ACTIVE, TrainingEnrollment.COMPLETED]
DURATIONS = {'short': (0, 2 * 3600), 'medium': (2 * 3600, 6 * 3600), 'long': (6 * 3600, 10 ** 9)}


def _norm(text):
    return unicodedata.normalize('NFKD', str(text or '')).encode('ascii', 'ignore').decode().lower()


def published():
    return list(Course.objects.filter(is_published=True).select_related('instructor__lms_profile', 'category', 'subcategory'))


def search_text(course):
    teacher = course.instructor.get_full_name() if course.instructor_id else course.instructor_name
    return _norm(' '.join([course.title, course.subtitle, course.summary, course.description, teacher or '',
                           course.category.name if course.category_id else '', course.subcategory.name if course.subcategory_id else '',
                           ' '.join(course.topics), ' '.join(course.learn_points)]))


def relevance(course, words):
    title = _norm(course.title + ' ' + course.subtitle)
    body = search_text(course)
    return sum((5 if w in title else 0) + (1 if w in body else 0) for w in words)


def filter_courses(courses, stats, params):
    q = _norm(params.get('q', '')).strip()
    words = [w for w in q.split() if w]
    if words:
        courses = [c for c in courses if all(w in search_text(c) for w in words)]
    category = params.get('category')
    if category:
        courses = [c for c in courses if c.category_id and (c.category.slug == category or str(c.category_id) == category)]
    sub = params.get('subcategory')
    if sub:
        courses = [c for c in courses if c.subcategory_id and (c.subcategory.slug == sub or str(c.subcategory_id) == sub)]
    for key in ('level', 'language'):
        wanted = params.get(key)
        if wanted:
            wanted_values = {w.lower() for w in wanted.split(',')}
            courses = [c for c in courses if (getattr(c, key) or '').lower() in wanted_values]
    price = params.get('price')
    if price == 'free':
        courses = [c for c in courses if c.is_free]
    elif price == 'paid':
        courses = [c for c in courses if not c.is_free]
    elif price == 'discounted':
        courses = [c for c in courses if c.on_sale]
    try:
        rating = float(params.get('rating') or 0)
    except ValueError:
        rating = 0
    if rating:
        courses = [c for c in courses if stats[c.id]['rating_average'] >= rating]
    duration = params.get('duration')
    if duration in DURATIONS:
        low, high = DURATIONS[duration]
        courses = [c for c in courses if low <= stats[c.id]['total_seconds'] < high]
    instructor = params.get('instructor')
    if instructor and str(instructor).isdigit():
        courses = [c for c in courses if c.instructor_id == int(instructor)]
    return courses, words


def sort_courses(courses, stats, sort, words):
    if sort == 'trending':
        from .search import trending_scores
        scores = trending_scores()
        return sorted(courses, key=lambda c: (scores.get(c.id, 0), stats[c.id]['student_count']), reverse=True)
    if sort == 'newest':
        return sorted(courses, key=lambda c: c.published_at or c.created_at, reverse=True)
    if sort == 'rating':
        return sorted(courses, key=lambda c: (stats[c.id]['rating_average'], stats[c.id]['rating_count']), reverse=True)
    if sort == 'price_low':
        return sorted(courses, key=lambda c: c.sale_price or 0)
    if sort == 'price_high':
        return sorted(courses, key=lambda c: c.sale_price or 0, reverse=True)
    if sort == 'popular' or not words:
        return sorted(courses, key=lambda c: (stats[c.id]['student_count'], stats[c.id]['rating_count']), reverse=True)
    return sorted(courses, key=lambda c: (relevance(c, words), stats[c.id]['student_count']), reverse=True)


class CatalogView(APIView):
    permission_classes = [AllowAny]

    def get(self, request):
        courses = published()
        stats = stats_for(courses)
        found, words = filter_courses(courses, stats, request.query_params)
        searched_for = showing_for = None
        if words and not found and request.query_params.get('exact') != '1':
            # Nothing matched: try again with the spelling corrected ("javscript" -> "javascript")
            from .search import correct
            fixed = correct(words, courses)
            if fixed:
                retry, fixed_words = filter_courses(courses, stats, {**request.query_params.dict(), 'q': fixed})
                if retry:
                    found, words, searched_for, showing_for = retry, fixed_words, request.query_params.get('q'), fixed
        if request.query_params.get('q') and request.query_params.get('page', '1') in ('', '1'):
            from .search import record
            record(request, showing_for or request.query_params['q'], len(found))  # the corrected words, if corrected
        found = sort_courses(found, stats, request.query_params.get('sort') or ('relevance' if words else 'popular'), words)
        try:
            size = max(1, min(int(request.query_params.get('page_size', 24)), 60))
            page = max(1, int(request.query_params.get('page', 1)))
        except ValueError:
            size, page = 24, 1
        pages = max(1, math.ceil(len(found) / size))
        chunk = found[(page - 1) * size:page * size]
        return Response({'count': len(found), 'page': page, 'pages': pages, 'results': [course_brief(c, stats[c.id]) for c in chunk],
                         'searched_for': searched_for, 'showing_for': showing_for})


class FacetsView(APIView):
    permission_classes = [AllowAny]

    def get(self, request):
        courses = published()
        stats = stats_for(courses)
        def count_by(key):
            out = {}
            for c in courses:
                value = key(c)
                if value:
                    out[value] = out.get(value, 0) + 1
            return out
        cats = {c.id: c for c in Category.objects.filter(is_active=True)}
        by_cat, by_sub = count_by(lambda c: c.category_id), count_by(lambda c: c.subcategory_id)
        teachers = {}
        for c in courses:
            if c.instructor_id:
                row = teachers.setdefault(c.instructor_id, {'id': c.instructor_id, 'name': c.instructor.get_full_name(), 'count': 0})
                row['count'] += 1
        return Response({
            'categories': [{'id': c.id, 'slug': c.slug, 'name': c.name, 'icon': c.icon, 'count': by_cat.get(c.id, 0),
                            'children': [{'id': k.id, 'slug': k.slug, 'name': k.name, 'count': by_sub.get(k.id, 0)}
                                         for k in cats.values() if k.parent_id == c.id]}
                           for c in cats.values() if c.parent_id is None],
            'levels': [{'value': v, 'label': label, 'count': sum(1 for c in courses if c.level == v)} for v, label in Course.LEVELS],
            'languages': [{'value': k, 'count': v} for k, v in sorted(count_by(lambda c: c.language).items())],
            'instructors': sorted(teachers.values(), key=lambda r: r['name']),
            'price': {'free': sum(1 for c in courses if c.is_free), 'paid': sum(1 for c in courses if not c.is_free),
                      'discounted': sum(1 for c in courses if c.on_sale)},
            'durations': {k: sum(1 for c in courses if lo <= stats[c.id]['total_seconds'] < hi) for k, (lo, hi) in DURATIONS.items()},
            'total': len(courses),
        })


class HomeRowsView(APIView):
    permission_classes = [AllowAny]

    def get(self, request):
        courses = published()
        stats = stats_for(courses)
        brief = lambda rows: [course_brief(c, stats[c.id]) for c in rows]  # noqa: E731
        by = lambda key, rows=courses: sorted(rows, key=key, reverse=True)[:8]  # noqa: E731
        from .search import trending_ids, trending_scores
        hot, scores = trending_ids(), trending_scores()
        rows = {
            'trending': brief(sorted([c for c in courses if c.id in hot], key=lambda c: -scores.get(c.id, 0))),
            'popular': brief(by(lambda c: (stats[c.id]['student_count'], stats[c.id]['rating_count']))),
            'newest': brief(by(lambda c: c.published_at or c.created_at)),
            'top_rated': brief(by(lambda c: (stats[c.id]['rating_average'], stats[c.id]['rating_count']),
                                  [c for c in courses if stats[c.id]['rating_count']])),
            'free': brief([c for c in courses if c.is_free][:8]),
            'discounted': brief([c for c in courses if c.on_sale][:8]),
            'recommended': brief(recommend.get_recommender().recommend(request.user, courses, stats, 8)) if request.user.is_authenticated else [],
        }
        return Response(rows)


class RelatedView(APIView):
    permission_classes = [AllowAny]

    def get(self, request, slug):
        course = get_object_or_404(Course, slug=slug)
        courses = published()
        stats = stats_for(courses)
        return Response([course_brief(c, stats[c.id]) for c in recommend.similar(course, courses, stats, 6)])


class CourseViewedView(APIView):
    permission_classes = [AllowAny]

    def post(self, request, slug):
        course = get_object_or_404(Course, slug=slug, is_published=True)
        if request.user.is_authenticated and access.can_manage(request.user, course):
            return Response({'counted': False})  # the course's own staff don't count
        row, _ = CourseViewDay.objects.get_or_create(course=course, date=timezone.localdate())
        CourseViewDay.objects.filter(pk=row.pk).update(views=F('views') + 1)
        if request.user.is_authenticated:
            RecentlyViewed.objects.update_or_create(user=request.user, course=course, defaults={'viewed_at': timezone.now()})
        return Response({'counted': True})


# ---------------------------------------------------------------- people

def profile_links(profile):
    return {k: getattr(profile, k) for k in ('website', 'linkedin', 'twitter', 'youtube', 'github', 'facebook') if getattr(profile, k)}


class InstructorProfileView(APIView):
    permission_classes = [AllowAny]

    def get(self, request, pk):
        user = get_object_or_404(User, pk=pk, is_active=True)
        courses = [c for c in published() if c.instructor_id == user.id]
        if user.role != User.INSTRUCTOR and not courses:
            return Response({'detail': 'Not found.'}, status=status.HTTP_404_NOT_FOUND)
        profile = Profile.for_user(user)
        stats = stats_for(courses)
        rated = [stats[c.id] for c in courses if stats[c.id]['rating_count']]
        reviews = Review.objects.filter(course__in=courses, is_hidden=False).select_related('student', 'course')
        return Response({
            'id': user.id, 'name': user.get_full_name(), 'photo': photo_url(user), 'headline': profile.headline, 'bio': profile.bio,
            'expertise': profile.expertise, 'links': profile_links(profile), 'country': user.country or '',
            'intro_video': embed_url(profile.intro_video_url) if profile.intro_video_url else None,
            **{k: v for k, v in follow_data(user, request.user).items() if k != 'id'},
            'totals': {'courses': len(courses), 'students': TrainingEnrollment.objects.filter(course__in=courses, status__in=LEARNING).values('student').distinct().count(),
                       'reviews': sum(s['rating_count'] for s in rated),
                       'rating': round(sum(s['rating_average'] * s['rating_count'] for s in rated) / sum(s['rating_count'] for s in rated), 1) if rated else 0},
            'courses': [course_brief(c, stats[c.id]) for c in courses],
            'reviews': [{'id': r.id, 'name': public_name(r.student), 'rating': r.rating, 'comment': r.comment, 'course': r.course.title,
                         'created_at': r.created_at} for r in reviews[:10]],
        })


def learning_stats(user, rows=None):
    rows = rows if rows is not None else learning_rows(user)
    attempts = QuizAttempt.objects.filter(enrollment__student=user, status=QuizAttempt.SUBMITTED)
    spent = Progress.objects.filter(enrollment__student=user).aggregate(s=Sum('time_spent_seconds'))['s'] or 0
    return {
        'hours': round(spent / 3600, 1),
        'enrolled': len(rows),
        'completed': sum(1 for r in rows if r['status'] == TrainingEnrollment.COMPLETED or r['certificate_code']),
        'in_progress': sum(1 for r in rows if r['status'] == TrainingEnrollment.ACTIVE and not r['certificate_code']),
        'lessons_completed': sum(r['progress']['completed'] for r in rows),
        'quiz_average': round(attempts.aggregate(a=Avg('score_percent'))['a'] or 0),
        'quizzes_passed': attempts.filter(passed=True).values('lesson').distinct().count(),
        'certificates': Certificate.objects.filter(enrollment__student=user, revoked_at__isnull=True).count(),
        'reviews': Review.objects.filter(student=user).count(),
    }


class StudentDashboardView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request):
        user = request.user
        rows = learning_rows(user)
        courses = published()
        stats = stats_for(courses)
        wishlist = [c for c in courses if c.id in set(Wishlist.objects.filter(student=user).values_list('course_id', flat=True))]
        recent_ids = list(RecentlyViewed.objects.filter(user=user).values_list('course_id', flat=True)[:8])
        by_id = {c.id: c for c in courses}
        return Response({
            'user': {'first_name': user.first_name, 'name': user.get_full_name()},
            'stats': learning_stats(user, rows),
            'continue': next((r for r in rows if r['has_content'] and r['status'] == TrainingEnrollment.ACTIVE and not r['certificate_code']), None),
            'courses': rows,
            'recently_accessed': [r for r in rows if r['last_accessed_at']][:6],
            'completed': [r for r in rows if r['certificate_code'] or r['status'] == TrainingEnrollment.COMPLETED],
            'recently_viewed': [course_brief(by_id[i], stats[i]) for i in recent_ids if i in by_id],
            'wishlist': [course_brief(c, stats[c.id]) for c in wishlist],
            'cart_count': CartItem.objects.filter(student=user).count(),
            'certificates': [certificate_data(c) for c in Certificate.objects.filter(enrollment__student=user, revoked_at__isnull=True)
                             .select_related('enrollment__course', 'enrollment__student')[:12]],
            'orders': [order_data(o) for o in Order.objects.filter(student=user).select_related('student', 'coupon')[:5]],
            'notifications': [notification_data(n) for n in Notification.objects.filter(user=user)[:6]],
            'unread_notifications': Notification.objects.filter(user=user, is_read=False).count(),
            'recommended': [course_brief(c, stats[c.id]) for c in recommend.get_recommender().recommend(user, courses, stats, 8)],
        })


class LibraryView(APIView):
    """GET /lms/me/library/: which courses the person owns, has in the cart or saved (course cards use it)."""
    permission_classes = [IsAuthenticated]

    def get(self, request):
        owned = TrainingEnrollment.objects.filter(student=request.user, status__in=LEARNING).values_list('course__slug', flat=True)
        pending = TrainingEnrollment.objects.filter(student=request.user, status=TrainingEnrollment.REQUESTED).values_list('course__slug', flat=True)
        return Response({
            'owned': list(owned),
            'requested': list(pending),
            'cart': list(CartItem.objects.filter(student=request.user).values_list('course__slug', flat=True)),
            'wishlist': list(Wishlist.objects.filter(student=request.user).values_list('course__slug', flat=True)),
            'teaching': list(Course.objects.filter(instructor=request.user).values_list('slug', flat=True)),
        })


class ProfileSerializer(serializers.ModelSerializer):
    expertise = serializers.ListField(child=serializers.CharField(max_length=60), max_length=20, required=False)
    interests = serializers.ListField(child=serializers.CharField(max_length=60), max_length=20, required=False)

    class Meta:
        model = Profile
        fields = ['headline', 'bio', 'expertise', 'interests', 'website', 'linkedin', 'twitter', 'youtube', 'github', 'facebook',
                  'intro_video_url', 'payout_details']

    def validate_intro_video_url(self, value):
        if value and not embed_url(value):
            raise serializers.ValidationError('Paste a YouTube or Vimeo link.')
        return value


class MyProfileView(APIView):
    permission_classes = [IsAuthenticated]

    def _payload(self, user):
        profile = Profile.for_user(user)
        return {'profile': ProfileSerializer(profile).data, 'user': {'id': user.id, 'name': user.get_full_name(), 'email': user.email,
                'country': user.country or '', 'photo': photo_url(user), 'role': user.role},
                'stats': learning_stats(user), 'reviews': [{'course': r.course.title, 'course_slug': r.course.slug, 'rating': r.rating,
                'comment': r.comment, 'created_at': r.created_at} for r in Review.objects.filter(student=user).select_related('course')[:20]]}

    def get(self, request):
        return Response(self._payload(request.user))

    def put(self, request):
        serializer = ProfileSerializer(Profile.for_user(request.user), data=request.data, partial=True)
        serializer.is_valid(raise_exception=True)
        serializer.save()
        return Response(self._payload(request.user))


# ---------------------------------------------------------------- notifications

def notification_data(n):
    return {'id': n.id, 'kind': n.kind, 'title': n.title, 'body': n.body, 'link': n.link, 'is_read': n.is_read, 'created_at': n.created_at}


class NotificationsView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request):
        rows = Notification.objects.filter(user=request.user)
        if request.query_params.get('unread') == 'true':
            rows = rows.filter(is_read=False)
        kind = request.query_params.get('kind')
        if kind:
            rows = rows.filter(kind=kind)
        try:
            limit = max(1, min(int(request.query_params.get('limit', 50)), 200))
        except ValueError:
            limit = 50
        return Response({'unread': Notification.objects.filter(user=request.user, is_read=False).count(),
                         'notifications': [notification_data(n) for n in rows[:limit]]})


class NotificationsReadView(APIView):
    permission_classes = [IsAuthenticated]

    def post(self, request):
        rows = Notification.objects.filter(user=request.user, is_read=False)
        if not request.data.get('all'):
            ids = [i for i in request.data.get('ids', []) if str(i).isdigit()]
            rows = rows.filter(id__in=ids)
        rows.update(is_read=True)
        return Response({'unread': Notification.objects.filter(user=request.user, is_read=False).count()})
