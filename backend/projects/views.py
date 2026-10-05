"""
Projects API (mounted at /api/v1/projects/).

Public
  GET  /                  published projects (cards), newest first after the admin's order
  GET  <slug>/            one published project in full, with up to three related ones
Admin
  GET/POST          manage/
  GET/PATCH/DELETE  manage/<id>/
  POST              manage/reorder/   {ids: [...]}
"""
import re
from datetime import date

from django.db import transaction
from django.db.models import F, Q
from django.shortcuts import get_object_or_404
from django.utils.text import slugify
from rest_framework import status
from rest_framework.permissions import AllowAny
from rest_framework.response import Response
from rest_framework.views import APIView

from accounts.permissions import IsAdmin

from .models import Project

TEXT = {'title': 160, 'summary': 320, 'client': 150, 'sector': 80, 'location': 120, 'service': 60, 'duration': 60,
        'cover_alt': 200, 'challenge': 8000, 'solution': 8000, 'outcome': 8000, 'quote': 800, 'quote_author': 120, 'quote_role': 120}
IMAGES = ('cover', 'client_logo')
MAX_RESULTS, MAX_GALLERY, MAX_TECH = 6, 12, 15
IMAGE_ADDRESS = re.compile(r'^(https://|/(?!/))')  # an uploaded image (/media/...) or a full https:// address


def card(p):
    return {'id': p.id, 'slug': p.slug, 'title': p.title, 'summary': p.summary, 'client': p.client, 'client_logo': p.client_logo,
            'sector': p.sector, 'location': p.location, 'service': p.service, 'completed_on': p.completed_on,
            'year': p.completed_on.year if p.completed_on else None, 'cover': p.cover, 'cover_alt': p.cover_alt,
            'featured': p.featured, 'technologies': p.technologies[:6], 'results': p.results[:3]}


def full(p):
    return {**card(p), 'technologies': p.technologies, 'results': p.results, 'duration': p.duration, 'live_url': p.live_url,
            'challenge': p.challenge, 'solution': p.solution, 'outcome': p.outcome, 'gallery': p.gallery,
            'quote': p.quote, 'quote_author': p.quote_author, 'quote_role': p.quote_role, 'updated_at': p.updated_at}


def admin_data(p):
    return {**full(p), 'status': p.status, 'sort_order': p.sort_order, 'created_at': p.created_at}


# ---------------------------------------------------------------- public

class ProjectsView(APIView):
    permission_classes = [AllowAny]
    authentication_classes = []

    def get(self, request):
        projects = Project.objects.filter(status=Project.PUBLISHED)
        return Response({'results': [card(p) for p in projects]})


class ProjectView(APIView):
    permission_classes = [AllowAny]

    def get(self, request, slug):
        p = get_object_or_404(Project, slug=slug)
        is_admin = request.user.is_authenticated and getattr(request.user, 'role', '') == 'ADMIN'
        if p.status != Project.PUBLISHED and not is_admin:  # admins can preview drafts
            return Response({'detail': 'Not found.'}, status=status.HTTP_404_NOT_FOUND)
        others = Project.objects.filter(status=Project.PUBLISHED).exclude(pk=p.pk)
        related = list(others.filter(Q(service=p.service) & ~Q(service='')) if p.service else [])[:3]
        if len(related) < 3:
            related += [o for o in others.exclude(pk__in=[r.pk for r in related])[:3 - len(related)]]
        return Response({**full(p), 'draft': p.status != Project.PUBLISHED, 'related': [card(r) for r in related]})


# ---------------------------------------------------------------- admin

def _unique_slug(text, exclude=None):
    base = slugify(text)[:110] or 'project'
    slug, n = base, 2
    while Project.objects.filter(slug=slug).exclude(pk=exclude).exists():
        slug, n = f'{base}-{n}', n + 1
    return slug


def apply(p, d):
    """Copies the admin's form onto the project. Returns {field: message} for anything that needs fixing."""
    errors = {}
    for field, limit in TEXT.items():
        if field in d:
            setattr(p, field, str(d[field] or '').strip()[:limit])
    for field in IMAGES:
        if field in d:
            value = str(d[field] or '').strip()[:500]
            if value and not IMAGE_ADDRESS.match(value):
                errors[field] = 'Choose an uploaded picture, or a full address starting with https://.'
            setattr(p, field, value)
    if 'live_url' in d:
        url = str(d['live_url'] or '').strip()[:300]
        if url and not url.startswith(('http://', 'https://')):
            url = f'https://{url}'
        if url and not re.match(r'^https?://[^\s/$.?#].[^\s]*$', url):
            errors['live_url'] = 'Enter a web address like https://example.com, or leave it empty.'
        p.live_url = url
    if 'completed_on' in d:
        raw = str(d['completed_on'] or '').strip()
        try:
            p.completed_on = date.fromisoformat(raw[:10]) if raw else None
        except ValueError:
            errors['completed_on'] = 'Choose a valid date.'
    for flag in ('featured',):
        if flag in d:
            setattr(p, flag, bool(d[flag]))
    if 'status' in d:
        if d['status'] not in dict(Project.STATUSES):
            errors['status'] = 'Choose draft or published.'
        else:
            p.status = d['status']
    if 'technologies' in d:
        items = d['technologies'] if isinstance(d['technologies'], list) else []
        seen, techs = set(), []
        for t in items[:MAX_TECH]:
            name = str(t or '').strip()[:40]
            if name and name.lower() not in seen:
                seen.add(name.lower())
                techs.append(name)
        p.technologies = techs
    if 'results' in d:
        rows = []
        for r in (d['results'] if isinstance(d['results'], list) else [])[:MAX_RESULTS]:
            r = r if isinstance(r, dict) else {}
            value, label = str(r.get('value') or '').strip()[:24], str(r.get('label') or '').strip()[:80]
            if value or label:
                if not (value and label):
                    errors['results'] = 'Each result needs both a number and what it measures.'
                rows.append({'value': value, 'label': label})
        p.results = rows
    if 'gallery' in d:
        rows = []
        for g in (d['gallery'] if isinstance(d['gallery'], list) else [])[:MAX_GALLERY]:
            g = g if isinstance(g, dict) else {}
            src, caption = str(g.get('src') or '').strip()[:500], str(g.get('caption') or '').strip()[:160]
            if not src:
                continue
            if not IMAGE_ADDRESS.match(src):
                errors['gallery'] = 'Gallery pictures must be uploaded pictures or https:// addresses.'
            rows.append({'src': src, 'caption': caption})
        p.gallery = rows
    if 'slug' in d:
        slug = slugify(str(d['slug'] or ''))[:120]
        if slug and Project.objects.filter(slug=slug).exclude(pk=p.pk).exists():
            errors['slug'] = 'Another project already uses this page address.'
        elif slug:
            p.slug = slug
    if not p.title:
        errors['title'] = 'Give the project a title.'
    if p.status == Project.PUBLISHED and not p.summary:
        errors['summary'] = 'Write a short summary before publishing: it is shown on the project card.'
    if not p.slug and p.title:
        p.slug = _unique_slug(p.title, exclude=p.pk)
    return errors


class ManageProjectsView(APIView):
    permission_classes = [IsAdmin]

    def get(self, request):
        projects = Project.objects.all()
        counts = {'all': projects.count(), 'published': projects.filter(status=Project.PUBLISHED).count(),
                  'draft': projects.filter(status=Project.DRAFT).count(), 'featured': projects.filter(featured=True).count()}
        return Response({'results': [admin_data(p) for p in projects], 'counts': counts})

    def post(self, request):
        p = Project(sort_order=0)
        errors = apply(p, request.data)
        if errors:
            return Response({'detail': next(iter(errors.values())), 'errors': errors}, status=status.HTTP_400_BAD_REQUEST)
        with transaction.atomic():
            Project.objects.update(sort_order=F('sort_order') + 1)  # new projects go first
            p.save()
        return Response(admin_data(p), status=status.HTTP_201_CREATED)


class ManageProjectView(APIView):
    permission_classes = [IsAdmin]

    def get(self, request, pk):
        return Response(admin_data(get_object_or_404(Project, pk=pk)))

    def patch(self, request, pk):
        p = get_object_or_404(Project, pk=pk)
        errors = apply(p, request.data)
        if errors:
            return Response({'detail': next(iter(errors.values())), 'errors': errors}, status=status.HTTP_400_BAD_REQUEST)
        p.save()
        return Response(admin_data(p))

    def delete(self, request, pk):
        get_object_or_404(Project, pk=pk).delete()
        return Response(status=status.HTTP_204_NO_CONTENT)


class ReorderView(APIView):
    permission_classes = [IsAdmin]

    def post(self, request):
        ids = [i for i in request.data.get('ids', []) if isinstance(i, int)]
        with transaction.atomic():
            for order, pk in enumerate(ids):
                Project.objects.filter(pk=pk).update(sort_order=order)
        return Response({'ok': True})
