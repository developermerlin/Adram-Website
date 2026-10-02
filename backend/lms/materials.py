"""
Downloading a course's lesson materials: documents, resources, reading notes (as a web page file), uploaded videos
when the course allows it, and everything at once as a ZIP. For enrolled students and the course's managers.

Files are fetched with signed links (a download link can't send the sign-in token), and the student must still be
enrolled when they use the link.
"""
import os
import re
import tempfile
import zipfile
from html import escape

from django.contrib.auth import get_user_model
from django.http import FileResponse, Http404, HttpResponse
from django.shortcuts import get_object_or_404
from django.utils import timezone
from rest_framework import status
from rest_framework.permissions import AllowAny, IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView

from catalog.models import Course

from . import access
from .media import read_token, sign
from .models import Lesson

User = get_user_model()


def paragraphs(text):
    """A blank line starts a new paragraph (as in the lesson editor)."""
    return [p.strip() for p in re.split(r'\n\s*\n', text or '') if p.strip()]


def _size(field):
    try:
        return field.size if field else 0
    except (OSError, ValueError):
        return 0


def _safe(name, limit=80):
    """A file or folder name that works on every computer."""
    name = re.sub(r'[\\/:*?"<>|\r\n\t]+', ' ', str(name or '')).strip().strip('.')
    return (name or 'untitled')[:limit].strip()


def can_download(user, course):
    """(allowed, enrollment): managers always; students when enrolled and the course allows downloads."""
    if not (user and user.is_authenticated):
        return False, None
    if access.can_manage(user, course):
        return True, None
    enrollment = access.enrollment_for(user, course)
    return bool(enrollment and course.allow_downloads), enrollment


def _notes_link(lesson, user_id):
    return f'/api/v1/lms/lessons/{lesson.id}/notes-file/?t={sign("notes", lesson.id, user_id)}'


def _media(kind, pk, user_id):
    return f'/api/v1/lms/media/{kind}/{pk}/?t={sign(kind, pk, user_id)}&download=1'


def lesson_files(lesson, user_id, videos=False):
    """Everything downloadable in one lesson: [{kind, name, size, url}]."""
    files = []
    if lesson.kind == Lesson.TEXT and lesson.body.strip():
        files.append({'kind': 'notes', 'name': f'{_safe(lesson.title)}.html', 'size': len(lesson.body), 'url': _notes_link(lesson, user_id)})
    if lesson.kind == Lesson.DOCUMENT and lesson.document_file:
        files.append({'kind': 'document', 'name': lesson.document_name or 'document', 'size': _size(lesson.document_file),
                      'url': _media('document', lesson.id, user_id)})
    if videos and lesson.kind == Lesson.VIDEO and lesson.video_source == Lesson.UPLOAD and lesson.video_file:
        files.append({'kind': 'video', 'name': lesson.video_name or 'video.mp4', 'size': _size(lesson.video_file),
                      'url': _media('video', lesson.id, user_id)})
    for r in lesson.resources.all():
        files.append({'kind': 'resource', 'name': r.filename or r.title, 'title': r.title, 'size': r.size or _size(r.file),
                      'url': _media('resource', r.id, user_id)})
    return files


def notes_page(lesson):
    """A reading lesson as a small web page that opens in any browser (and prints nicely)."""
    course = lesson.section.course
    body = ''.join(f'<p>{escape(p)}</p>' for p in paragraphs(lesson.body))
    summary = f'<p class="summary">{escape(lesson.summary)}</p>' if lesson.summary else ''
    return f'''<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>{escape(lesson.title)} - {escape(course.title)}</title>
<style>body{{max-width:720px;margin:40px auto;padding:0 20px;font:17px/1.65 Georgia,serif;color:#1d1e27}}
small{{color:#6a6f73;font:13px system-ui,sans-serif;text-transform:uppercase;letter-spacing:.06em}}
h1{{font:700 30px/1.2 system-ui,sans-serif;margin:6px 0 12px}}.summary{{color:#4b5563;font-style:italic}}
footer{{margin-top:48px;color:#6a6f73;font:13px system-ui,sans-serif}}</style></head>
<body><small>{escape(course.title)} &middot; {escape(lesson.section.title)}</small><h1>{escape(lesson.title)}</h1>{summary}{body}
<footer>ADRAM Technologies &middot; downloaded {timezone.now():%d %B %Y}</footer></body></html>'''


def outline_page(course, lessons):
    rows, section = [], None
    for lesson in lessons:
        if lesson.section_id != section:
            section = lesson.section_id
            rows.append(f'<h2>{escape(lesson.section.title)}</h2>')
        minutes = f' &middot; {round(lesson.duration_seconds / 60)} min' if lesson.duration_seconds else ''
        rows.append(f'<p>{escape(lesson.title)} <small>({escape(lesson.get_kind_display())}{minutes})</small></p>')
    return (f'<!doctype html><html lang="en"><head><meta charset="utf-8"><title>{escape(course.title)}: course outline</title>'
            '<style>body{max-width:720px;margin:40px auto;padding:0 20px;font:16px/1.6 system-ui,sans-serif;color:#1d1e27}'
            'h2{margin-top:28px;font-size:19px}small{color:#6a6f73}</style></head>'
            f'<body><h1>{escape(course.title)}</h1><p>{escape(course.subtitle or course.summary)}</p>{"".join(rows)}</body></html>')


class MaterialsView(APIView):
    """GET /lms/courses/<slug>/materials/: every downloadable file, lesson by lesson, and a link to the whole ZIP."""
    permission_classes = [IsAuthenticated]

    def get(self, request, slug):
        course = get_object_or_404(Course, slug=slug)
        allowed, _ = can_download(request.user, course)
        if not allowed:
            detail = 'Downloads are turned off for this course.' if access.enrollment_for(request.user, course) else 'Enrol on this course to download its materials.'
            return Response({'detail': detail, 'code': 'downloads_off' if 'turned off' in detail else 'enrollment_required'}, status=status.HTTP_403_FORBIDDEN)
        videos = course.allow_video_downloads
        lessons = access.published_lessons(course)
        sections, total = [], 0
        for lesson in lessons:
            files = lesson_files(lesson, request.user.id, videos)
            if not files:
                continue
            if not sections or sections[-1]['id'] != lesson.section_id:
                sections.append({'id': lesson.section_id, 'title': lesson.section.title, 'lessons': []})
            sections[-1]['lessons'].append({'id': lesson.id, 'title': lesson.title, 'kind': lesson.kind, 'files': files})
            total += sum(f['size'] for f in files)
        return Response({
            'course': {'slug': course.slug, 'title': course.title},
            'videos_included': videos,
            'sections': sections,
            'file_count': sum(len(l['files']) for s in sections for l in s['lessons']),
            'total_size': total,
            'zip_url': f'/api/v1/lms/courses/{course.slug}/materials/zip/?t={sign("zip", course.id, request.user.id)}',
        })


class _SignedDownload(APIView):
    """A download opened from a link: the signed token says who asked, and they must still be allowed today."""
    permission_classes = [AllowAny]
    authentication_classes = []

    def signed_user(self, request, kind, pk, course):
        user_id = read_token(request.query_params.get('t', ''), kind, pk)
        user = User.objects.filter(pk=user_id, is_active=True).first() if user_id else None
        if not user or not can_download(user, course)[0]:
            raise Http404
        return user


class NotesFileView(_SignedDownload):
    """GET /lms/lessons/<id>/notes-file/?t=…: a reading lesson as an .html file."""

    def get(self, request, pk):
        lesson = get_object_or_404(Lesson.objects.select_related('section__course'), pk=pk, kind=Lesson.TEXT)
        self.signed_user(request, 'notes', pk, lesson.section.course)
        response = HttpResponse(notes_page(lesson), content_type='text/html; charset=utf-8')
        response['Content-Disposition'] = f'attachment; filename="{_safe(lesson.title)}.html"'
        return response


class MaterialsZipView(_SignedDownload):
    """GET /lms/courses/<slug>/materials/zip/?t=…: the whole course's materials, one folder per section."""

    def get(self, request, slug):
        course = get_object_or_404(Course, slug=slug)
        self.signed_user(request, 'zip', course.id, course)
        lessons = access.published_lessons(course)
        section_no, last_section = 0, None
        spool = tempfile.TemporaryFile()
        with zipfile.ZipFile(spool, 'w', zipfile.ZIP_DEFLATED) as archive:
            archive.writestr('Course outline.html', outline_page(course, lessons))
            for lesson_no, lesson in enumerate(lessons, start=1):
                if lesson.section_id != last_section:
                    section_no, last_section = section_no + 1, lesson.section_id
                folder = f'{section_no:02d} {_safe(lesson.section.title, 60)}'
                prefix = f'{folder}/{lesson_no:02d} {_safe(lesson.title, 60)}'
                if lesson.kind == Lesson.TEXT and lesson.body.strip():
                    archive.writestr(f'{prefix}.html', notes_page(lesson))
                files = []
                if lesson.kind == Lesson.DOCUMENT and lesson.document_file:
                    files.append((lesson.document_file, lesson.document_name or 'document'))
                if course.allow_video_downloads and lesson.kind == Lesson.VIDEO and lesson.video_source == Lesson.UPLOAD and lesson.video_file:
                    files.append((lesson.video_file, lesson.video_name or 'video.mp4'))
                files += [(r.file, r.filename or r.title) for r in lesson.resources.all()]
                for field, name in files:
                    try:
                        path = field.path
                    except (ValueError, NotImplementedError):
                        continue
                    if os.path.exists(path):
                        # Videos and most documents are already compressed: store them as they are
                        kind = zipfile.ZIP_STORED if name.lower().endswith(('.mp4', '.mov', '.webm', '.zip', '.pdf', '.jpg', '.png')) else zipfile.ZIP_DEFLATED
                        archive.write(path, f'{prefix} - {_safe(name, 80)}', compress_type=kind)
        spool.seek(0)
        return FileResponse(spool, as_attachment=True, filename=f'{_safe(course.title)} - materials.zip', content_type='application/zip')
