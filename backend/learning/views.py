"""
Learning hub API (mounted at /api/v1/learning/).

Public (drafts are visible to administrators only, for previewing)
  GET  fields/                               published fields, with how far a signed-in learner has got
  GET  fields/<slug>/                        a field and its roadmap: levels -> topics -> notes
  GET  fields/<slug>/notes/<note>/           one note, with the field outline and the previous / next note
  GET  fields/<slug>/pdf/                    the whole field as a PDF book (?drafts=1 for administrators)
  GET  search/?q=                            notes whose title, summary or text match
  GET  me/                                   (signed in) the fields a learner has started, with the next note
  POST/DELETE notes/<id>/progress/           (signed in) mark a note finished / not finished
Admin
  GET/POST          manage/fields/                 PATCH/DELETE manage/fields/<id>/  (GET: with the whole curriculum)
  POST              manage/fields/reorder/  {ids}
  POST              manage/fields/<id>/publish-notes/  {publish: true|false}   every note in the field at once
  POST              manage/topics/                 PATCH/DELETE manage/topics/<id>/
  POST              manage/topics/reorder/  {ids}
  POST              manage/notes/                  GET/PATCH/DELETE manage/notes/<id>/
  POST              manage/notes/reorder/   {ids}
  POST              manage/upload/                 a document for a note's resources (PDF, Word, PowerPoint, ...)
"""
import os
import re
import uuid

from django.core.files.storage import default_storage
from django.db import transaction
from django.db.models import Q
from django.shortcuts import get_object_or_404
from django.utils.text import slugify
from rest_framework import status
from rest_framework.parsers import MultiPartParser
from rest_framework.permissions import AllowAny, IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView

from accounts.permissions import IsAdmin

from .models import LEVELS, Field, Note, NoteProgress, Topic

URL = re.compile(r'^(https?://\S+|/media/\S+)$')
RESOURCE_KINDS = ('link', 'video', 'file')
UPLOAD_TYPES = {'.pdf', '.doc', '.docx', '.ppt', '.pptx', '.xls', '.xlsx', '.txt', '.csv', '.zip', '.pkt', '.png', '.jpg', '.jpeg'}
MAX_UPLOAD_MB = 25


def is_admin(user):
    return bool(user and user.is_authenticated and getattr(user, 'role', '') == 'ADMIN')


def done_ids(user, field=None):
    if not (user and user.is_authenticated):
        return set()
    rows = NoteProgress.objects.filter(user=user)
    if field is not None:
        rows = rows.filter(note__field=field)
    return set(rows.values_list('note_id', flat=True))


def ordered_notes(field, drafts=False):
    notes = Note.objects.filter(field=field).select_related('topic')
    if not drafts:
        notes = notes.filter(is_published=True)
    return list(notes.order_by('topic__level', 'topic__sort_order', 'topic__id', 'sort_order', 'id'))


def note_row(n, done):
    return {'id': n.id, 'slug': n.slug, 'title': n.title, 'kind': n.kind, 'summary': n.summary, 'minutes': n.minutes,
            'done': n.id in done, **({} if n.is_published else {'draft': True})}


def roadmap(field, notes, done):
    """levels -> topics -> notes, keeping only topics that have something to read."""
    by_topic = {}
    for n in notes:
        by_topic.setdefault(n.topic_id, []).append(n)
    levels = []
    for level, _ in LEVELS:
        topics = [{'id': t.id, 'title': t.title, 'summary': t.summary, 'notes': [note_row(n, done) for n in by_topic[t.id]]}
                  for t in field.topics.filter(level=level) if t.id in by_topic]
        if topics:
            levels.append({'level': level, 'topics': topics})
    return levels


def field_card(f, notes, done):
    finished = sum(1 for n in notes if n.id in done)
    return {'id': f.id, 'slug': f.slug, 'name': f.name, 'icon': f.icon, 'summary': f.summary, 'cover': f.cover,
            'notes': len(notes), 'topics': len({n.topic_id for n in notes}), 'levels': sorted({n.topic.level for n in notes}),
            'minutes': sum(n.minutes for n in notes), 'done': finished,
            'labs': sum(1 for n in notes if n.kind == Note.LAB), **({} if f.is_published else {'draft': True})}


def next_note(notes, done):
    return next((n for n in notes if n.id not in done), None)


# ---------------------------------------------------------------- public

class FieldsView(APIView):
    permission_classes = [AllowAny]

    def get(self, request):
        done = done_ids(request.user)
        cards = []
        for f in Field.objects.filter(is_published=True):
            notes = ordered_notes(f)
            if notes:
                cards.append(field_card(f, notes, done))
        return Response({'results': cards, 'signed_in': request.user.is_authenticated})


class FieldView(APIView):
    permission_classes = [AllowAny]

    def get(self, request, slug):
        admin = is_admin(request.user)
        f = get_object_or_404(Field, slug=slug)
        if not f.is_published and not admin:
            return Response({'detail': 'Not found.'}, status=status.HTTP_404_NOT_FOUND)
        notes = ordered_notes(f, drafts=admin)
        done = done_ids(request.user, f)
        upcoming = next_note(notes, done)
        return Response({**field_card(f, notes, done), 'description': f.description, 'roadmap': roadmap(f, notes, done),
                         'next': {'slug': upcoming.slug, 'title': upcoming.title} if upcoming else None,
                         'signed_in': request.user.is_authenticated})


class NoteView(APIView):
    permission_classes = [AllowAny]

    def get(self, request, slug, note):
        admin = is_admin(request.user)
        f = get_object_or_404(Field, slug=slug)
        n = get_object_or_404(Note.objects.select_related('topic'), field=f, slug=note)
        if not admin and not (f.is_published and n.is_published):
            return Response({'detail': 'Not found.'}, status=status.HTTP_404_NOT_FOUND)
        notes = ordered_notes(f, drafts=admin)
        done = done_ids(request.user, f)
        at = next((i for i, x in enumerate(notes) if x.id == n.id), None)
        prev = notes[at - 1] if at else None
        nxt = notes[at + 1] if at is not None and at + 1 < len(notes) else None
        return Response({
            'id': n.id, 'slug': n.slug, 'title': n.title, 'kind': n.kind, 'summary': n.summary, 'objectives': n.objectives,
            'body': n.body, 'resources': n.resources, 'minutes': n.minutes, 'updated_at': n.updated_at, 'done': n.id in done,
            'draft': not (f.is_published and n.is_published),
            'topic': {'id': n.topic_id, 'title': n.topic.title, 'level': n.topic.level},
            'field': field_card(f, notes, done), 'outline': roadmap(f, notes, done),
            'position': (at or 0) + 1, 'prev': {'slug': prev.slug, 'title': prev.title} if prev else None,
            'next': {'slug': nxt.slug, 'title': nxt.title} if nxt else None, 'signed_in': request.user.is_authenticated,
        })


class FieldPdfView(APIView):
    """GET fields/<slug>/pdf/ — every published note of a field as one PDF book. Admins can add ?drafts=1 to include drafts."""
    permission_classes = [AllowAny]

    def get(self, request, slug):
        from django.core.cache import cache
        from django.db.models import Max
        from django.http import HttpResponse

        from cms.models import PageContent
        from .pdf import build_pdf

        admin = is_admin(request.user)
        f = get_object_or_404(Field, slug=slug)
        drafts = admin and request.query_params.get('drafts') == '1'
        if not f.is_published and not admin:
            return Response({'detail': 'Not found.'}, status=status.HTTP_404_NOT_FOUND)
        notes = ordered_notes(f, drafts=drafts)
        if not notes:
            return Response({'detail': 'This field has no published notes yet.'}, status=status.HTTP_404_NOT_FOUND)
        # one cached copy per version: it changes whenever a note, the field, the wording or the theme changes
        stamp = max(filter(None, [f.updated_at, f.notes.aggregate(m=Max('updated_at'))['m'],
                                  PageContent.objects.filter(slug__in=['site', 'learning']).aggregate(m=Max('updated_at'))['m']]))
        key = f'learning:pdf:{f.pk}:{int(drafts)}:{len(notes)}:{stamp.timestamp()}'
        pdf = None if drafts else cache.get(key)
        if pdf is None:
            pdf = build_pdf(f, notes)
            if not drafts:
                cache.set(key, pdf, 60 * 60 * 24)
        name = f'{f.name} - ADRAM learning notes{" (with drafts)" if drafts else ""}.pdf'
        response = HttpResponse(pdf, content_type='application/pdf')
        response['Content-Disposition'] = f'attachment; filename="{name}"'
        return response


class ProgressView(APIView):
    permission_classes = [IsAuthenticated]

    def _answer(self, request, n):
        notes = ordered_notes(n.field)
        done = done_ids(request.user, n.field)
        upcoming = next_note(notes, done)
        return Response({'done': n.id in done, 'field_done': sum(1 for x in notes if x.id in done), 'field_notes': len(notes),
                         'next': {'slug': upcoming.slug, 'title': upcoming.title} if upcoming else None})

    def post(self, request, pk):
        n = get_object_or_404(Note.objects.select_related('field'), pk=pk, is_published=True, field__is_published=True)
        NoteProgress.objects.get_or_create(user=request.user, note=n)
        return self._answer(request, n)

    def delete(self, request, pk):
        n = get_object_or_404(Note.objects.select_related('field'), pk=pk)
        NoteProgress.objects.filter(user=request.user, note=n).delete()
        return self._answer(request, n)


class SearchView(APIView):
    permission_classes = [AllowAny]

    def get(self, request):
        q = str(request.query_params.get('q') or '').strip()[:80]
        if len(q) < 2:
            return Response({'results': []})
        notes = (Note.objects.filter(is_published=True, field__is_published=True)
                 .filter(Q(title__icontains=q) | Q(summary__icontains=q) | Q(body__icontains=q) | Q(topic__title__icontains=q))
                 .select_related('field', 'topic')[:30])
        # title matches first
        ranked = sorted(notes, key=lambda n: (q.lower() not in n.title.lower(), n.topic.level))
        return Response({'results': [{'slug': n.slug, 'title': n.title, 'kind': n.kind, 'summary': n.summary, 'minutes': n.minutes,
                                      'level': n.topic.level, 'topic': n.topic.title,
                                      'field': {'slug': n.field.slug, 'name': n.field.name, 'icon': n.field.icon}} for n in ranked]})


class MyLearningView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request):
        done = done_ids(request.user)
        started = Field.objects.filter(is_published=True, notes__progress__user=request.user).distinct()
        rows = []
        for f in started:
            notes = ordered_notes(f)
            upcoming = next_note(notes, done)
            rows.append({**field_card(f, notes, done), 'next': {'slug': upcoming.slug, 'title': upcoming.title} if upcoming else None})
        return Response({'results': rows})


# ---------------------------------------------------------------- admin

def _text(d, key, limit):
    return str(d.get(key) or '').strip()[:limit]


def _unique_field_slug(text, exclude=None):
    base, n = slugify(text)[:70] or 'field', 2
    slug = base
    while Field.objects.filter(slug=slug).exclude(pk=exclude).exists():
        slug, n = f'{base}-{n}', n + 1
    return slug


def _unique_note_slug(field_id, text, exclude=None):
    base, n = slugify(text)[:110] or 'note', 2
    slug = base
    while Note.objects.filter(field_id=field_id, slug=slug).exclude(pk=exclude).exists():
        slug, n = f'{base}-{n}', n + 1
    return slug


def admin_field(f, curriculum=False):
    data = {'id': f.id, 'slug': f.slug, 'name': f.name, 'icon': f.icon, 'summary': f.summary, 'description': f.description,
            'cover': f.cover, 'is_published': f.is_published, 'sort_order': f.sort_order, 'updated_at': f.updated_at,
            'topics': f.topics.count(), 'notes': f.notes.count(), 'published_notes': f.notes.filter(is_published=True).count()}
    if curriculum:
        notes = {}
        for n in f.notes.all():
            notes.setdefault(n.topic_id, []).append({'id': n.id, 'slug': n.slug, 'title': n.title, 'kind': n.kind,
                                                     'is_published': n.is_published, 'minutes': n.minutes, 'updated_at': n.updated_at})
        data['curriculum'] = [{'id': t.id, 'level': t.level, 'title': t.title, 'summary': t.summary, 'sort_order': t.sort_order,
                               'notes': notes.get(t.id, [])} for t in f.topics.all()]
    return data


def admin_note(n):
    return {'id': n.id, 'topic': n.topic_id, 'field': {'id': n.field_id, 'slug': n.field.slug, 'name': n.field.name},
            'level': n.topic.level, 'title': n.title, 'slug': n.slug, 'kind': n.kind, 'summary': n.summary, 'objectives': n.objectives,
            'body': n.body, 'resources': n.resources, 'is_published': n.is_published, 'minutes': n.minutes,
            'created_at': n.created_at, 'updated_at': n.updated_at}


def _errors(errors):
    return Response({'detail': next(iter(errors.values())), 'errors': errors}, status=status.HTTP_400_BAD_REQUEST)


def apply_field(f, d):
    errors = {}
    for key, limit in (('name', 80), ('summary', 300), ('description', 6000), ('icon', 40)):
        if key in d:
            setattr(f, key, _text(d, key, limit))
    if 'cover' in d:
        f.cover = _text(d, 'cover', 500)
        if f.cover and not re.match(r'^(https://|/(?!/))', f.cover):
            errors['cover'] = 'Choose an uploaded picture, or a full address starting with https://.'
    if 'is_published' in d:
        f.is_published = bool(d['is_published'])
    if 'slug' in d and _text(d, 'slug', 80):
        slug = slugify(_text(d, 'slug', 80))
        if Field.objects.filter(slug=slug).exclude(pk=f.pk).exists():
            errors['slug'] = 'Another field already uses this page address.'
        else:
            f.slug = slug
    if not f.name:
        errors['name'] = 'Give the field a name, e.g. Networking.'
    elif not f.slug:
        f.slug = _unique_field_slug(f.name, exclude=f.pk)
    return errors


def apply_note(n, d):
    errors = {}
    for key, limit in (('title', 160), ('summary', 300), ('body', 60000)):
        if key in d:
            setattr(n, key, _text(d, key, limit) if key != 'body' else str(d.get('body') or '')[:limit])
    if 'kind' in d:
        if d['kind'] not in dict(Note.KINDS):
            errors['kind'] = 'Choose a note type.'
        else:
            n.kind = d['kind']
    if 'topic' in d:
        topic = Topic.objects.filter(pk=d['topic']).first()
        if not topic:
            errors['topic'] = 'Choose a topic.'
        elif n.pk and topic.field_id != n.field_id:
            errors['topic'] = 'A note can only move to a topic in the same field.'
        else:
            n.topic = topic
    if 'objectives' in d:
        items = d['objectives'] if isinstance(d['objectives'], list) else []
        n.objectives = [s for s in (str(x or '').strip()[:200] for x in items[:12]) if s]
    if 'resources' in d:
        rows = []
        for r in (d['resources'] if isinstance(d['resources'], list) else [])[:20]:
            r = r if isinstance(r, dict) else {}
            title, url, kind = str(r.get('title') or '').strip()[:150], str(r.get('url') or '').strip()[:500], r.get('kind')
            if not (title or url):
                continue
            if not URL.match(url):
                errors['resources'] = 'Each resource needs a link starting with https:// or an uploaded file.'
            if not title:
                errors['resources'] = 'Give each resource a title.'
            rows.append({'kind': kind if kind in RESOURCE_KINDS else 'link', 'title': title, 'url': url})
        n.resources = rows
    if 'is_published' in d:
        n.is_published = bool(d['is_published'])
    if not n.title:
        errors['title'] = 'Give the note a title.'
    if not getattr(n, 'topic_id', None):
        errors.setdefault('topic', 'Choose a topic.')
    if n.is_published and not n.body.strip():
        errors['body'] = 'Write the note before publishing it.'
    if not errors:
        field_id = n.topic.field_id
        if 'slug' in d and _text(d, 'slug', 120):
            slug = slugify(_text(d, 'slug', 120))
            if Note.objects.filter(field_id=field_id, slug=slug).exclude(pk=n.pk).exists():
                errors['slug'] = 'Another note in this field already uses this page address.'
            else:
                n.slug = slug
        if not n.slug:
            n.slug = _unique_note_slug(field_id, n.title, exclude=n.pk)
    return errors


class ManageFieldsView(APIView):
    permission_classes = [IsAdmin]

    def get(self, request):
        return Response({'results': [admin_field(f) for f in Field.objects.all()]})

    def post(self, request):
        f = Field(sort_order=Field.objects.count())
        errors = apply_field(f, request.data)
        if errors:
            return _errors(errors)
        f.save()
        return Response(admin_field(f, curriculum=True), status=status.HTTP_201_CREATED)


class ManageFieldView(APIView):
    permission_classes = [IsAdmin]

    def get(self, request, pk):
        return Response(admin_field(get_object_or_404(Field, pk=pk), curriculum=True))

    def patch(self, request, pk):
        f = get_object_or_404(Field, pk=pk)
        errors = apply_field(f, request.data)
        if errors:
            return _errors(errors)
        f.save()
        return Response(admin_field(f, curriculum=True))

    def delete(self, request, pk):
        get_object_or_404(Field, pk=pk).delete()
        return Response(status=status.HTTP_204_NO_CONTENT)


def _reorder(model, ids):
    ids = [i for i in ids if isinstance(i, int)]
    with transaction.atomic():
        for order, pk in enumerate(ids):
            model.objects.filter(pk=pk).update(sort_order=order)


class PublishNotesView(APIView):
    """Publish (or unpublish) every note in a field at once. Notes with no text are left as drafts."""
    permission_classes = [IsAdmin]

    def post(self, request, pk):
        f = get_object_or_404(Field, pk=pk)
        publish = bool(request.data.get('publish', True))
        notes = f.notes.filter(is_published=not publish)
        if publish:
            notes = notes.exclude(body='')
        changed = notes.update(is_published=publish)
        return Response({**admin_field(f, curriculum=True), 'changed': changed})


class ReorderView(APIView):
    permission_classes = [IsAdmin]
    model = None

    def post(self, request):
        _reorder(self.model, request.data.get('ids', []))
        return Response({'ok': True})


class ManageTopicsView(APIView):
    permission_classes = [IsAdmin]

    def post(self, request):
        d = request.data
        field = Field.objects.filter(pk=d.get('field')).first()
        title = _text(d, 'title', 120)
        try:
            level = int(d.get('level') or 1)
        except (TypeError, ValueError):
            level = 0
        errors = {}
        if not field:
            errors['field'] = 'Choose a field.'
        if not title:
            errors['title'] = 'Give the topic a title, e.g. IP addressing & subnetting.'
        if level not in dict(LEVELS):
            errors['level'] = 'Choose a level.'
        if errors:
            return _errors(errors)
        Topic.objects.create(field=field, level=level, title=title, summary=_text(d, 'summary', 300),
                             sort_order=field.topics.filter(level=level).count())
        return Response(admin_field(field, curriculum=True), status=status.HTTP_201_CREATED)


class ManageTopicView(APIView):
    permission_classes = [IsAdmin]

    def patch(self, request, pk):
        t = get_object_or_404(Topic, pk=pk)
        d = request.data
        if 'title' in d:
            t.title = _text(d, 'title', 120)
            if not t.title:
                return _errors({'title': 'Give the topic a title.'})
        if 'summary' in d:
            t.summary = _text(d, 'summary', 300)
        if 'level' in d:
            try:
                level = int(d['level'])
            except (TypeError, ValueError):
                level = 0
            if level not in dict(LEVELS):
                return _errors({'level': 'Choose a level.'})
            if level != t.level:
                t.level, t.sort_order = level, t.field.topics.filter(level=level).count()
        t.save()
        return Response(admin_field(t.field, curriculum=True))

    def delete(self, request, pk):
        t = get_object_or_404(Topic, pk=pk)
        if t.notes.exists():
            return _errors({'topic': 'Move or delete this topic’s notes first.'})
        field = t.field
        t.delete()
        return Response(admin_field(field, curriculum=True))


class ManageNotesView(APIView):
    permission_classes = [IsAdmin]

    def post(self, request):
        n = Note()
        topic = Topic.objects.filter(pk=request.data.get('topic')).first()
        if topic:
            n.topic, n.field_id = topic, topic.field_id
            n.sort_order = topic.notes.count()
        errors = apply_note(n, request.data)
        if errors:
            return _errors(errors)
        n.save()
        return Response(admin_note(n), status=status.HTTP_201_CREATED)


class ManageNoteView(APIView):
    permission_classes = [IsAdmin]

    def get(self, request, pk):
        return Response(admin_note(get_object_or_404(Note.objects.select_related('topic', 'field'), pk=pk)))

    def patch(self, request, pk):
        n = get_object_or_404(Note.objects.select_related('topic', 'field'), pk=pk)
        moving = 'topic' in request.data and str(request.data['topic']) != str(n.topic_id)
        errors = apply_note(n, request.data)
        if errors:
            return _errors(errors)
        if moving:
            n.sort_order = n.topic.notes.exclude(pk=n.pk).count()
        n.save()
        return Response(admin_note(n))

    def delete(self, request, pk):
        get_object_or_404(Note, pk=pk).delete()
        return Response(status=status.HTTP_204_NO_CONTENT)


class UploadView(APIView):
    """A document for a note's resources. Stored with the site's public media: notes are public too."""
    permission_classes = [IsAdmin]
    parser_classes = [MultiPartParser]

    def post(self, request):
        upload = request.FILES.get('file')
        if not upload:
            return _errors({'file': 'Choose a file.'})
        ext = os.path.splitext(upload.name)[1].lower()
        if ext not in UPLOAD_TYPES:
            return _errors({'file': 'Upload a PDF, Word, PowerPoint, Excel, text, ZIP, Packet Tracer or picture file.'})
        if upload.size > MAX_UPLOAD_MB * 1024 * 1024:
            return _errors({'file': f'Files can be up to {MAX_UPLOAD_MB} MB. Link to bigger ones instead.'})
        if ext == '.pdf' and upload.read(4) != b'%PDF':
            return _errors({'file': 'That file isn’t a real PDF.'})
        upload.seek(0)
        stem = slugify(os.path.splitext(upload.name)[0])[:60] or 'file'
        path = default_storage.save(f'learning/{uuid.uuid4().hex[:8]}-{stem}{ext}', upload)
        return Response({'url': default_storage.url(path), 'name': upload.name, 'size': upload.size}, status=status.HTTP_201_CREATED)
