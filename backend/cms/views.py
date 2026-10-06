"""
Public: GET /api/v1/content/<slug>/  (the admin's edits for one page; empty when nothing has been changed)
Admin:  GET/PUT/DELETE /api/v1/content/manage/<slug>/   read, save and reset a page
        GET/POST /api/v1/content/media/, DELETE /api/v1/content/media/<id>/   the image library
"""
import os

from django.http import Http404
from django.shortcuts import get_object_or_404
from rest_framework import generics, parsers
from rest_framework.permissions import AllowAny
from rest_framework.response import Response
from rest_framework.views import APIView

from accounts.models import User
from accounts.permissions import IsAdmin
from lms.access import IsAdminOrInstructor
from rest_framework.permissions import BasePermission


class CanUseMediaLibrary(BasePermission):
    """Administrators (whole library); instructors and team members (their own uploads)."""
    message = 'Only staff can upload pictures.'

    def has_permission(self, request, view):
        return IsAdminOrInstructor().has_permission(request, view) or (
            request.user.is_authenticated and request.user.role == User.TEAM_MEMBER)

from .models import CONTENT_PAGES, PageContent, PageRevision, SiteImage
from .serializers import PageContentSerializer, PageRevisionSerializer, SiteImageSerializer


def _page_or_404(slug):
    if slug not in CONTENT_PAGES:
        raise Http404
    return slug


def _empty(slug):
    return {'slug': slug, 'data': {}, 'updated_at': None, 'updated_by_name': ''}


class PublicPageContent(APIView):
    permission_classes = [AllowAny]

    def get(self, request, slug):
        _page_or_404(slug)
        page = PageContent.objects.filter(slug=slug).first()
        return Response(PageContentSerializer(page).data if page else _empty(slug))


class ManagePageContent(APIView):
    permission_classes = [IsAdmin]

    def get(self, request, slug):
        _page_or_404(slug)
        page = PageContent.objects.filter(slug=slug).select_related('updated_by').first()
        return Response(PageContentSerializer(page).data if page else _empty(slug))

    def put(self, request, slug):
        _page_or_404(slug)
        page = PageContent.objects.filter(slug=slug).first() or PageContent(slug=slug)
        serializer = PageContentSerializer(page, data=request.data, partial=True)
        serializer.is_valid(raise_exception=True)
        serializer.save(updated_by=request.user)
        PageRevision.record(slug, serializer.instance.data, PageRevision.SAVED, request.user)
        return Response(serializer.data)

    def delete(self, request, slug):
        """Reset: forget every edit, so the page shows its original content again."""
        _page_or_404(slug)
        if PageContent.objects.filter(slug=slug).delete()[0]:
            PageRevision.record(slug, {}, PageRevision.RESET, request.user)
        return Response(_empty(slug))


class PageHistory(APIView):
    """GET: the page's recent changes, newest first."""
    permission_classes = [IsAdmin]

    def get(self, request, slug):
        _page_or_404(slug)
        revisions = PageRevision.objects.filter(slug=slug).select_related('user')
        return Response(PageRevisionSerializer(revisions, many=True).data)


class RestoreRevision(APIView):
    """POST: put the page back the way it was at that point in its history."""
    permission_classes = [IsAdmin]

    def post(self, request, slug, pk):
        _page_or_404(slug)
        revision = get_object_or_404(PageRevision, pk=pk, slug=slug)
        page = PageContent.objects.filter(slug=slug).first() or PageContent(slug=slug)
        page.data = revision.data
        page.updated_by = request.user
        page.save()
        PageRevision.record(slug, page.data, PageRevision.RESTORED, request.user)
        return Response(PageContentSerializer(page).data)


class MediaListCreate(generics.ListCreateAPIView):
    """Administrators see the whole library; instructors and team members upload pictures and see only their own."""
    permission_classes = [CanUseMediaLibrary]
    serializer_class = SiteImageSerializer
    queryset = SiteImage.objects.all()
    parser_classes = [parsers.MultiPartParser, parsers.FormParser]
    pagination_class = None

    def get_queryset(self):
        queryset = super().get_queryset()
        if self.request.user.role != User.ADMIN:
            queryset = queryset.filter(uploaded_by=self.request.user)
        return queryset[:120]

    def perform_create(self, serializer):
        upload = serializer.validated_data['image']
        serializer.save(uploaded_by=self.request.user, name=os.path.splitext(upload.name)[0][:150])


class MediaDelete(generics.DestroyAPIView):
    permission_classes = [CanUseMediaLibrary]

    def get_queryset(self):
        if self.request.user.role == User.ADMIN:
            return SiteImage.objects.all()
        return SiteImage.objects.filter(uploaded_by=self.request.user)

    def perform_destroy(self, instance):
        instance.image.delete(save=False)
        instance.delete()


# ---------------------------------------------------------------- videos for the pages' video sections

VIDEO_FOLDER = 'site/videos'
VIDEO_TYPES = {'.mp4', '.webm', '.m4v'}


def _video_row(name):
    from django.core.files.storage import default_storage
    path = f'{VIDEO_FOLDER}/{name}'
    return {'name': name, 'url': default_storage.url(path), 'size': default_storage.size(path),
            'uploaded_at': default_storage.get_modified_time(path)}


class SiteVideosView(APIView):
    """GET: the uploaded videos (newest first). POST {file}: upload one (MP4 or WebM).
    Long videos are better on YouTube or Vimeo: paste their link in the video section instead."""
    permission_classes = [IsAdmin]
    parser_classes = [parsers.MultiPartParser]

    def get(self, request):
        from django.core.files.storage import default_storage
        try:
            _, files = default_storage.listdir(VIDEO_FOLDER)
        except FileNotFoundError:
            files = []
        rows = [_video_row(f) for f in files if os.path.splitext(f)[1].lower() in VIDEO_TYPES]
        return Response(sorted(rows, key=lambda r: r['uploaded_at'], reverse=True))

    def post(self, request):
        import uuid

        from django.conf import settings
        from django.core.files.storage import default_storage
        from django.utils.text import slugify
        upload = request.FILES.get('file')
        if not upload:
            return Response({'detail': 'Choose a video file.'}, status=400)
        ext = os.path.splitext(upload.name)[1].lower()
        if ext not in VIDEO_TYPES:
            return Response({'detail': 'Upload an MP4 or WebM video, or paste a YouTube or Vimeo link instead.'}, status=400)
        limit = getattr(settings, 'SITE_MAX_VIDEO_MB', 200)
        if upload.size > limit * 1024 * 1024:
            return Response({'detail': f'Videos can be up to {limit} MB. Put longer videos on YouTube and paste the link.'}, status=400)
        head = upload.read(12)
        upload.seek(0)
        real = (ext in ('.mp4', '.m4v') and head[4:8] == b'ftyp') or (ext == '.webm' and head[:4] == b'\x1aE\xdf\xa3')
        if not real:
            return Response({'detail': 'That file isn’t a real video.'}, status=400)
        stem = slugify(os.path.splitext(upload.name)[0])[:60] or 'video'
        saved = default_storage.save(f'{VIDEO_FOLDER}/{uuid.uuid4().hex[:8]}-{stem}{ext}', upload)
        return Response(_video_row(saved.rsplit('/', 1)[-1]), status=201)


class SiteVideoDelete(APIView):
    permission_classes = [IsAdmin]

    def delete(self, request, name):
        from django.core.files.storage import default_storage
        if '/' in name or '\\' in name or os.path.splitext(name)[1].lower() not in VIDEO_TYPES:
            raise Http404
        path = f'{VIDEO_FOLDER}/{name}'
        if not default_storage.exists(path):
            raise Http404
        default_storage.delete(path)
        return Response(status=204)
