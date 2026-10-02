"""
"Recommended for you". The default recommender scores courses from what the person looked at, enrolled on, saved
and said they are interested in, then fills up with popular courses. To use a different engine (for example an AI
model), write a class with the same `recommend(user, candidates, stats, limit)` method and point the
LMS_RECOMMENDER setting at it ("package.module.ClassName").
"""
from django.conf import settings
from django.utils.module_loading import import_string

from portal.models import TrainingEnrollment

from .models import CartItem, Profile, RecentlyViewed, Wishlist


class RuleBasedRecommender:
    def signals(self, user):
        """Categories, subcategories and words the person has shown interest in, with weights."""
        cats, subs, words = {}, {}, set()
        if not (user and user.is_authenticated):
            return cats, subs, words

        def add(course, weight):
            if course.category_id:
                cats[course.category_id] = cats.get(course.category_id, 0) + weight
            if course.subcategory_id:
                subs[course.subcategory_id] = subs.get(course.subcategory_id, 0) + weight
            words.update(t.lower() for t in course.topics[:8])

        for e in TrainingEnrollment.objects.filter(student=user).select_related('course'):
            add(e.course, 3)
        for w in Wishlist.objects.filter(student=user).select_related('course'):
            add(w.course, 2)
        for c in CartItem.objects.filter(student=user).select_related('course'):
            add(c.course, 2)
        for v in RecentlyViewed.objects.filter(user=user).select_related('course')[:20]:
            add(v.course, 1)
        profile = Profile.objects.filter(user=user).first()
        if profile:
            words.update(str(i).lower() for i in profile.interests)
        return cats, subs, words

    def recommend(self, user, candidates, stats, limit=8):
        cats, subs, words = self.signals(user)
        owned = set()
        if user and user.is_authenticated:
            owned = set(TrainingEnrollment.objects.filter(student=user).values_list('course_id', flat=True))
        scored = []
        for course in candidates:
            if course.id in owned or (user and user.is_authenticated and course.instructor_id == user.id):
                continue
            s = stats[course.id]
            text = ' '.join([course.title, course.subtitle, course.summary, ' '.join(course.topics)]).lower()
            score = (cats.get(course.category_id, 0) * 4 + subs.get(course.subcategory_id, 0) * 6
                     + sum(2 for w in words if w and w in text)
                     + s['student_count'] * 0.05 + s['rating_average'] * s['rating_count'] * 0.02)
            scored.append((score, s['student_count'], course))
        scored.sort(key=lambda row: (row[0], row[1]), reverse=True)
        return [row[2] for row in scored[:limit]]


def get_recommender():
    path = getattr(settings, 'LMS_RECOMMENDER', '')
    return import_string(path)() if path else RuleBasedRecommender()


def similar(course, candidates, stats, limit=4):
    """Courses like this one: same subcategory, then same category, then shared topics."""
    topics = {t.lower() for t in course.topics}
    rows = []
    for other in candidates:
        if other.id == course.id:
            continue
        score = (5 if course.subcategory_id and other.subcategory_id == course.subcategory_id else 0) \
            + (3 if course.category_id and other.category_id == course.category_id else 0) \
            + len(topics & {t.lower() for t in other.topics}) + stats[other.id]['student_count'] * 0.01
        rows.append((score, other))
    rows.sort(key=lambda r: r[0], reverse=True)
    return [r[1] for r in rows[:limit]]


def also_taken(course, limit=4):
    """Published courses most often taken by this course's students: [(course, shared students)], cached 10 minutes."""
    from django.core.cache import cache
    from django.db.models import Count
    from catalog.models import Course
    from portal.models import TrainingEnrollment
    key = f'also-taken:{course.pk}'
    found = cache.get(key)
    if found is None:
        learning = [TrainingEnrollment.ACTIVE, TrainingEnrollment.COMPLETED]
        students = TrainingEnrollment.objects.filter(course=course, status__in=learning).values('student_id')
        found = list(TrainingEnrollment.objects.filter(student_id__in=students, status__in=learning, course__is_published=True)
                     .exclude(course=course).values('course_id').annotate(n=Count('student', distinct=True)).order_by('-n')
                     .values_list('course_id', 'n')[:limit * 2])
        cache.set(key, found, 600)
    courses = {c.id: c for c in Course.objects.filter(pk__in=[cid for cid, _ in found], is_published=True)}
    return [(courses[cid], n) for cid, n in found if cid in courses][:limit]

