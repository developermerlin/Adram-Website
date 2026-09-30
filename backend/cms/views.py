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
    """Administrators see the whole library; instructors upload course pictures and see only their own."""
    permission_classes = [IsAdminOrInstructor]
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
    permission_classes = [IsAdminOrInstructor]

    def get_queryset(self):
        if self.request.user.role == User.ADMIN:
            return SiteImage.objects.all()
        return SiteImage.objects.filter(uploaded_by=self.request.user)

    def perform_destroy(self, instance):
        instance.image.delete(save=False)
        instance.delete()
