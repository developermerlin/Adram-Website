"""
Flash sales (administrators): a percentage off chosen courses (or every paid course) between two times.

  GET    /lms/manage/flash-sales/          every sale, newest first, with its state (scheduled, live, ended, off)
  POST   /lms/manage/flash-sales/          {name, percent_off, starts_at, ends_at, course_ids?, is_enabled?, notify_students?}
  PATCH  /lms/manage/flash-sales/<id>/     the same fields
  DELETE /lms/manage/flash-sales/<id>/
"""
from django.shortcuts import get_object_or_404
from django.utils import timezone
from rest_framework import serializers, status
from rest_framework.response import Response
from rest_framework.views import APIView

from accounts.models import User
from accounts.permissions import IsAdmin
from catalog.models import Course, FlashSale
from catalog.pricing import forget_flash_sales

from . import audit
from .notify import notify


class FlashSaleSerializer(serializers.ModelSerializer):
    course_ids = serializers.PrimaryKeyRelatedField(source='courses', many=True, queryset=Course.objects.all(), required=False)
    percent_off = serializers.IntegerField(min_value=1, max_value=90)
    state = serializers.SerializerMethodField()
    course_titles = serializers.SerializerMethodField()

    class Meta:
        model = FlashSale
        fields = ['id', 'name', 'percent_off', 'starts_at', 'ends_at', 'course_ids', 'course_titles', 'is_enabled', 'state',
                  'created_at', 'updated_at']
        read_only_fields = ['id', 'created_at', 'updated_at']

    def get_state(self, obj):
        now = timezone.now()
        if not obj.is_enabled:
            return 'off'
        if now < obj.starts_at:
            return 'scheduled'
        return 'live' if now < obj.ends_at else 'ended'

    def get_course_titles(self, obj):
        return [c.title for c in obj.courses.all()]

    def validate(self, attrs):
        starts = attrs.get('starts_at', getattr(self.instance, 'starts_at', None))
        ends = attrs.get('ends_at', getattr(self.instance, 'ends_at', None))
        if starts and ends and ends <= starts:
            raise serializers.ValidationError({'ends_at': 'The sale must end after it starts.'})
        return attrs


def _announce(sale):
    """Tell every student about a flash sale (in their notifications), with a link to the sale's courses."""
    students = list(User.objects.filter(role=User.STUDENT, is_active=True))
    which = 'selected courses' if sale.courses.exists() else 'every paid course'
    when = sale.ends_at.strftime('%d %b, %H:%M')
    notify(students, 'coupon', f'{sale.name}: {sale.percent_off}% off', f'On {which} until {when}.', '/courses?price=discounted')


class FlashSalesView(APIView):
    permission_classes = [IsAdmin]

    def get(self, request):
        sales = FlashSale.objects.prefetch_related('courses')
        return Response(FlashSaleSerializer(sales, many=True).data)

    def post(self, request):
        serializer = FlashSaleSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        sale = serializer.save()
        forget_flash_sales()  # the chosen courses are saved after the sale itself
        audit.record(request, 'flash_sale_created', sale, label=f'{sale.name} ({sale.percent_off}% off)')
        if request.data.get('notify_students') in (True, 'true', '1', 1):
            _announce(sale)
        return Response(FlashSaleSerializer(sale).data, status=status.HTTP_201_CREATED)


class FlashSaleDetailView(APIView):
    permission_classes = [IsAdmin]

    def patch(self, request, pk):
        sale = get_object_or_404(FlashSale, pk=pk)
        serializer = FlashSaleSerializer(sale, data=request.data, partial=True)
        serializer.is_valid(raise_exception=True)
        sale = serializer.save()
        forget_flash_sales()
        audit.record(request, 'flash_sale_changed', sale, label=f'{sale.name} ({sale.percent_off}% off)')
        return Response(FlashSaleSerializer(sale).data)

    def delete(self, request, pk):
        sale = get_object_or_404(FlashSale, pk=pk)
        audit.record(request, 'flash_sale_deleted', sale, label=sale.name)
        sale.delete()
        return Response(status=status.HTTP_204_NO_CONTENT)
