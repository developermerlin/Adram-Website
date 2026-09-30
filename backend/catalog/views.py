"""
Public read-only endpoints for the website, and admin endpoints to edit, publish and reorder.
Lists are short (tens of items), so they are not paginated.
"""
from django.db import transaction
from rest_framework import generics, viewsets
from rest_framework.decorators import action
from rest_framework.permissions import AllowAny
from rest_framework.response import Response

from accounts.models import User
from accounts.permissions import IsAdmin
from portal.models import PortalEvent
from portal.services import track
from .models import Course, Scholarship
from .permissions import CanManageScholarships, is_scholarship_editor
from .serializers import (
    CourseManageSerializer, CourseSerializer, ReorderSerializer, ScholarshipManageSerializer, ScholarshipSerializer,
)


# ---------------------------------------------------------------- Public website

class PublicScholarshipList(generics.ListAPIView):
    """GET /api/v1/catalog/scholarships/"""
    queryset = Scholarship.objects.filter(is_published=True)
    serializer_class = ScholarshipSerializer
    permission_classes = [AllowAny]
    pagination_class = None
    filter_backends = []


class PublicScholarshipDetail(generics.RetrieveAPIView):
    """GET /api/v1/catalog/scholarships/<slug>/ (editors can also open drafts, to preview them)."""
    serializer_class = ScholarshipSerializer
    permission_classes = [AllowAny]
    lookup_field = 'slug'

    def get_queryset(self):
        if is_scholarship_editor(self.request.user):
            return Scholarship.objects.all()
        return Scholarship.objects.filter(is_published=True)

    def retrieve(self, request, *args, **kwargs):
        response = super().retrieve(request, *args, **kwargs)
        if request.user.is_authenticated and request.user.role == User.STUDENT:
            track(request.user, PortalEvent.VIEWED, self.get_object())  # for the admin's activity timeline
        return response


class PublicCourseList(generics.ListAPIView):
    """GET /api/v1/catalog/courses/"""
    queryset = Course.objects.filter(is_published=True)
    serializer_class = CourseSerializer
    permission_classes = [AllowAny]
    pagination_class = None
    filter_backends = []


# ---------------------------------------------------------------- Admin portal

class ManageViewSet(viewsets.ModelViewSet):
    """
    /api/v1/catalog/manage/<kind>/?search=&published=true|false
    POST .../reorder/ {ids: [...]} saves the website order (first id is listed first).
    """
    pagination_class = None

    def get_queryset(self):
        queryset = self.queryset.select_related('updated_by')
        published = self.request.query_params.get('published')
        if published in ('true', 'false'):
            queryset = queryset.filter(is_published=published == 'true')
        return queryset

    def perform_create(self, serializer):
        # New items go to the end of the list unless an order was given.
        if 'sort_order' in serializer.validated_data:
            serializer.save()
            return
        last = self.queryset.model.objects.order_by('-sort_order').values_list('sort_order', flat=True).first()
        serializer.save(sort_order=(last or 0) + 10)

    @action(detail=False, methods=['post'])
    def reorder(self, request):
        serializer = ReorderSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        ids = serializer.validated_data['ids']
        model = self.queryset.model
        items = model.objects.in_bulk(ids)
        for position, pk in enumerate(ids):
            if pk in items:
                items[pk].sort_order = (position + 1) * 10
        with transaction.atomic():
            model.objects.bulk_update(items.values(), ['sort_order'])
        return Response({'updated': len(items)})


class ScholarshipManageViewSet(ManageViewSet):
    queryset = Scholarship.objects.all()
    serializer_class = ScholarshipManageSerializer
    permission_classes = [CanManageScholarships]
    search_fields = ['name', 'provider', 'fields', 'summary']

    def get_queryset(self):
        queryset = super().get_queryset()
        country = self.request.query_params.get('country')
        return queryset.filter(country=country) if country else queryset


class CourseManageViewSet(ManageViewSet):
    queryset = Course.objects.all()
    serializer_class = CourseManageSerializer
    permission_classes = [IsAdmin]
    search_fields = ['title', 'summary']

    def get_queryset(self):
        queryset = super().get_queryset().select_related('instructor', 'category', 'subcategory')
        wanted = self.request.query_params.get('status')
        return queryset.filter(status=wanted) if wanted else queryset

    def perform_update(self, serializer):
        from lms import audit
        was_published = serializer.instance.is_published
        course = serializer.save()
        if course.is_published != was_published:
            audit.record(self.request, 'course_published' if course.is_published else 'course_unpublished', course)

    def perform_destroy(self, instance):
        from lms import audit
        audit.record(self.request, 'course_deleted', instance)
        instance.delete()
