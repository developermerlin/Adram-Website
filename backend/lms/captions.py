"""
Subtitles for uploaded videos: one WebVTT file per language. SubRip (.srt) files are converted on upload.
(YouTube and Vimeo videos keep the subtitles set on those sites.)

  POST   /lms/manage/lessons/<id>/captions/   multipart: file (.vtt or .srt), language (en, fr…), label (English…)
                                              uploading the same language again replaces it
  DELETE /lms/manage/captions/<id>/
"""
import re

from django.core.files.base import ContentFile
from django.shortcuts import get_object_or_404
from rest_framework import parsers, status
from rest_framework.response import Response
from rest_framework.views import APIView

from . import access
from .builder import _check, lesson_for
from .models import Lesson, LessonCaption

MAX_BYTES = 1024 * 1024
TIME = re.compile(r'(\d{1,2}:\d{2}:\d{2}),(\d{3})')


def srt_to_vtt(text):
    """SubRip to WebVTT: a header, and dots instead of commas in the times."""
    text = text.replace('\r\n', '\n').replace('\r', '\n').strip()
    return 'WEBVTT\n\n' + TIME.sub(r'\1.\2', text) + '\n'


def clean_captions(upload):
    """The file as WebVTT text, or raises ValueError."""
    if upload.size > MAX_BYTES:
        raise ValueError('Subtitle files can be at most 1 MB.')
    raw = upload.read()
    for encoding in ('utf-8-sig', 'cp1252'):
        try:
            text = raw.decode(encoding)
            break
        except UnicodeDecodeError:
            continue
    else:
        raise ValueError('Save the subtitles as UTF-8 text and try again.')
    name = upload.name.lower()
    if name.endswith('.srt'):
        text = srt_to_vtt(text)
    elif not name.endswith('.vtt'):
        raise ValueError('Upload a .vtt or .srt subtitle file.')
    if not text.lstrip().startswith('WEBVTT') or '-->' not in text:
        raise ValueError('That doesn’t look like a subtitle file (no timings found).')
    return text


def caption_data(caption, user_id):
    from .views import media_link
    return {'id': caption.id, 'language': caption.language, 'label': caption.label, 'url': media_link('caption', caption.id, user_id)}


class CaptionsView(APIView):
    permission_classes = [access.IsAdminOrInstructor]
    parser_classes = [parsers.MultiPartParser, parsers.FormParser]

    def post(self, request, pk):
        lesson = lesson_for(request, pk)
        if lesson.kind != Lesson.VIDEO or lesson.video_source != Lesson.UPLOAD:
            return Response({'detail': 'Subtitles can be added to uploaded videos. YouTube and Vimeo videos use the subtitles set there.'},
                            status=status.HTTP_400_BAD_REQUEST)
        upload = request.FILES.get('file')
        language = re.sub(r'[^a-zA-Z-]', '', str(request.data.get('language', '')))[:10].lower()
        label = str(request.data.get('label', '')).strip()[:40]
        if not upload or not language or not label:
            return Response({'detail': 'Choose the file, its language code (e.g. en) and the name students see (e.g. English).'},
                            status=status.HTTP_400_BAD_REQUEST)
        try:
            text = clean_captions(upload)
        except ValueError as exc:
            return Response({'file': str(exc)}, status=status.HTTP_400_BAD_REQUEST)
        old = LessonCaption.objects.filter(lesson=lesson, language=language).first()
        if old:
            old.delete()  # the signal removes its file
        caption = LessonCaption(lesson=lesson, language=language, label=label)
        caption.file.save('captions.vtt', ContentFile(text.encode('utf-8')), save=True)
        return Response(caption_data(caption, request.user.id), status=status.HTTP_201_CREATED)


class CaptionView(APIView):
    permission_classes = [access.IsAdminOrInstructor]

    def delete(self, request, pk):
        caption = get_object_or_404(LessonCaption.objects.select_related('lesson__section__course'), pk=pk)
        _check(request, caption.lesson.section.course)
        caption.delete()
        return Response(status=status.HTTP_204_NO_CONTENT)
