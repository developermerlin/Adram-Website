"""
Searching the catalogue: suggestions while typing, typo correction, trending courses, recent and saved searches.

  GET    /lms/search/suggest/?q=          courses, topics and instructors matching what's typed (empty q: recent,
                                          popular and saved searches)
  GET    /lms/me/searches/                my recent searches        DELETE: clear them
  GET    /lms/me/saved-searches/          my saved searches         POST {name, params}
  DELETE /lms/me/saved-searches/<id>/

The catalogue itself (discovery.CatalogView) uses `correct()` when a search finds nothing, and `trending_ids()` for the
Trending badge, row and sort.
"""
import difflib
import re
from datetime import timedelta

from django.core.cache import cache
from django.db.models import Count, Sum
from django.shortcuts import get_object_or_404
from django.utils import timezone
from django.utils.text import slugify
from rest_framework import status
from rest_framework.permissions import AllowAny, IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView

from catalog.models import Category
from portal.models import TrainingEnrollment

from .models import CourseViewDay, SavedSearch, SearchQuery

TRENDING_DAYS = 7
TRENDING_TOP = 8
TRENDING_MIN = 5          # score needed to count as trending (a view = 1, an enrolment = 5)
CACHE_SECONDS = 600
SAVED_PARAMS = ['q', 'category', 'subcategory', 'level', 'language', 'price', 'rating', 'duration', 'instructor', 'sort']


def normalize(text):
    from .discovery import _norm
    return ' '.join(_norm(text).split())[:120]


# ---------------------------------------------------------------- trending

def trending_scores():
    """{course id: score} over the last week: page views, plus enrolments (worth five views each)."""
    scores = cache.get('lms:trending')
    if scores is None:
        since = timezone.now().date() - timedelta(days=TRENDING_DAYS)
        scores = {}
        for row in CourseViewDay.objects.filter(date__gte=since).values('course_id').annotate(n=Sum('views')):
            scores[row['course_id']] = scores.get(row['course_id'], 0) + row['n']
        recent = timezone.now() - timedelta(days=TRENDING_DAYS)
        for row in (TrainingEnrollment.objects.filter(created_at__gte=recent).exclude(status=TrainingEnrollment.CANCELLED)
                    .values('course_id').annotate(n=Count('id'))):
            scores[row['course_id']] = scores.get(row['course_id'], 0) + 5 * row['n']
        cache.set('lms:trending', scores, CACHE_SECONDS)
    return scores


def trending_ids():
    """The courses with the most activity this week (at most TRENDING_TOP, each above a small minimum)."""
    scores = trending_scores()
    ranked = sorted((cid for cid, s in scores.items() if s >= TRENDING_MIN), key=lambda cid: -scores[cid])
    return set(ranked[:TRENDING_TOP])


# ---------------------------------------------------------------- typo correction

def vocabulary(courses):
    """Every word (3+ letters) in the published courses, for "Did you mean…"."""
    from .discovery import search_text
    key = f'lms:vocab:{len(courses)}:{max((c.updated_at.timestamp() for c in courses), default=0)}'
    words = cache.get(key)
    if words is None:
        words = set()
        for c in courses:
            words.update(w for w in re.findall(r'[a-z0-9+#.]+', search_text(c)) if len(w) >= 3)
        words = sorted(words)
        cache.set(key, words, CACHE_SECONDS)
    return words


def correct(words, courses):
    """The query with each unknown word replaced by the closest known one, or None if nothing changed."""
    vocab = vocabulary(courses)
    known = set(vocab)
    fixed, changed = [], False
    for w in words:
        if w in known or any(w in v for v in vocab):
            fixed.append(w)
            continue
        close = difflib.get_close_matches(w, vocab, n=1, cutoff=0.75)
        if close:
            fixed.append(close[0])
            changed = True
        else:
            fixed.append(w)
    return ' '.join(fixed) if changed else None


# ---------------------------------------------------------------- history

def record(request, text, results):
    """Remember a search (an immediate repeat by the same person, e.g. a page reload, isn't counted twice)."""
    norm = normalize(text)
    if not norm:
        return
    user = request.user if request.user.is_authenticated else None
    last = SearchQuery.objects.filter(user=user).first() if user else None
    if last and last.normalized == norm and last.created_at >= timezone.now() - timedelta(minutes=1):
        return
    SearchQuery.objects.create(user=user, text=text.strip()[:120], normalized=norm, results=results)


def recent_for(user, limit=6):
    seen, out = set(), []
    for row in SearchQuery.objects.filter(user=user).values('text', 'normalized')[:60]:
        if row['normalized'] not in seen:
            seen.add(row['normalized'])
            out.append(row['text'])
        if len(out) == limit:
            break
    return out


def popular(limit=6):
    rows = cache.get('lms:popular-searches')
    if rows is None:
        since = timezone.now() - timedelta(days=30)
        rows = [r['normalized'] for r in SearchQuery.objects.filter(created_at__gte=since, results__gt=0)
                .values('normalized').annotate(n=Count('id')).order_by('-n')[:limit]]
        cache.set('lms:popular-searches', rows, CACHE_SECONDS)
    return rows


def saved_row(s):
    return {'id': s.id, 'name': s.name, 'params': s.params, 'created_at': s.created_at}


# ---------------------------------------------------------------- views

class SuggestView(APIView):
    """What to show under the search box while typing."""
    permission_classes = [AllowAny]

    def get(self, request):
        from .briefs import instructor_info
        from .discovery import published, search_text
        q = normalize(request.query_params.get('q', ''))
        user = request.user if request.user.is_authenticated else None
        if not q:
            return Response({
                'recent': recent_for(user) if user else [],
                'popular': popular(),
                'saved': [saved_row(s) for s in SavedSearch.objects.filter(user=user)[:5]] if user else [],
            })
        courses = published()
        words = q.split()
        title_hits = [c for c in courses if all(w in normalize(c.title + ' ' + c.subtitle) for w in words)]
        body_hits = [c for c in courses if c not in title_hits and all(w in search_text(c) for w in words)]
        topics, seen = [], set()

        def add_topic(label, kind, params):
            if label.lower() not in seen and len(topics) < 5:
                seen.add(label.lower())
                topics.append({'label': label, 'kind': kind, 'params': params})

        for cat in Category.objects.filter(courses__is_published=True).distinct():
            if q in normalize(cat.name):
                add_topic(cat.name, 'category', {'category': cat.slug})
        for sub in Category.objects.filter(sub_courses__is_published=True, parent__isnull=False).select_related('parent').distinct():
            if q in normalize(sub.name):
                add_topic(sub.name, 'subcategory', {'category': sub.parent.slug, 'subcategory': sub.slug})
        for c in courses:
            for t in c.topics:
                if q in normalize(t):
                    add_topic(t, 'topic', {'q': t, 'topic': slugify(t)})
        teachers = {}
        for c in courses:
            info = instructor_info(c)
            if info['id'] and q in normalize(info['name']):
                teachers[info['id']] = {'id': info['id'], 'name': info['name']}
        hits = (title_hits + body_hits)[:6]
        return Response({
            'courses': [{'slug': c.slug, 'title': c.title, 'thumbnail': c.thumbnail, 'icon': c.icon,
                         'instructor': instructor_info(c)['name']} for c in hits],
            'topics': topics,
            'instructors': list(teachers.values())[:3],
            'did_you_mean': correct(words, courses) if not hits else None,
        })


class MySearchesView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request):
        return Response(recent_for(request.user, 12))

    def delete(self, request):
        SearchQuery.objects.filter(user=request.user).delete()
        return Response(status=status.HTTP_204_NO_CONTENT)


class SavedSearchesView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request):
        return Response([saved_row(s) for s in SavedSearch.objects.filter(user=request.user)])

    def post(self, request):
        params = {k: str(v)[:120] for k, v in (request.data.get('params') or {}).items() if k in SAVED_PARAMS and v}
        if not params:
            return Response({'params': 'Search for something or choose a filter first.'}, status=status.HTTP_400_BAD_REQUEST)
        name = str(request.data.get('name') or '').strip()[:80] or params.get('q') or 'My search'
        if SavedSearch.objects.filter(user=request.user).count() >= 20:
            return Response({'detail': 'You can keep up to 20 saved searches. Delete one first.'}, status=status.HTTP_400_BAD_REQUEST)
        saved = SavedSearch.objects.create(user=request.user, name=name, params=params)
        return Response(saved_row(saved), status=status.HTTP_201_CREATED)


class SavedSearchDetailView(APIView):
    permission_classes = [IsAuthenticated]

    def delete(self, request, pk):
        get_object_or_404(SavedSearch, pk=pk, user=request.user).delete()
        return Response(status=status.HTTP_204_NO_CONTENT)

