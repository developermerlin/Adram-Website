"""
Browsing by topic: every topic tag on published courses gets its own page (/topics/<slug>).

  GET /lms/topics/          all topics with how many courses have them, most used first
  GET /lms/topics/<slug>/   one topic: its courses (most popular first), their categories and related topics
"""
from collections import Counter

from django.http import Http404
from django.utils.text import slugify
from rest_framework.permissions import AllowAny
from rest_framework.response import Response
from rest_framework.views import APIView

from .briefs import course_brief
from .stats import stats_for


def topic_links(topics):
    """[{name, slug}] for a course's topics (slugs as the topic pages use them)."""
    return [{'name': t, 'slug': slugify(t)} for t in topics or [] if slugify(t)]


class TopicsView(APIView):
    permission_classes = [AllowAny]

    def get(self, request):
        from .discovery import published
        names, counts = {}, Counter()
        for course in published():
            for t in course.topics or []:
                slug = slugify(t)
                if slug:
                    names.setdefault(slug, t)
                    counts[slug] += 1
        return Response([{'slug': s, 'name': names[s], 'count': n} for s, n in counts.most_common()])


class TopicView(APIView):
    permission_classes = [AllowAny]

    def get(self, request, slug):
        from .discovery import published
        courses = published()
        matching = [c for c in courses if any(slugify(t) == slug for t in c.topics or [])]
        if not matching:
            raise Http404
        name = next(t for c in matching for t in c.topics if slugify(t) == slug)
        stats = stats_for(matching)
        matching.sort(key=lambda c: (stats[c.id]['student_count'], stats[c.id]['rating_count']), reverse=True)
        related = Counter(slugify(t) for c in matching for t in c.topics or [] if slugify(t) and slugify(t) != slug)
        names = {slugify(t): t for c in matching for t in c.topics or []}
        categories = {c.category.slug: c.category.name for c in matching if c.category_id}
        return Response({
            'slug': slug, 'name': name, 'count': len(matching),
            'courses': [course_brief(c, stats[c.id]) for c in matching],
            'categories': [{'slug': k, 'name': v} for k, v in categories.items()],
            'related': [{'slug': s, 'name': names[s]} for s, _ in related.most_common(10)],
        })
