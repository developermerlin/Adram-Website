"""
Buying courses.

Students:
  GET    /lms/cart/?coupon=CODE              the cart, priced (sale prices and the coupon)
  POST   /lms/cart/                          {slug} add a course (also removes it from the wishlist)
  DELETE /lms/cart/<slug>/                   remove it
  POST   /lms/cart/checkout/                 {coupon?} turn the cart into an order
  POST   /lms/courses/<slug>/buy/            {coupon?} "buy now": an order for one course
  GET    /lms/me/orders/                     purchase history
  GET    /lms/orders/<id>/                   one order: items, status, how to pay, invoice details
  POST   /lms/orders/<id>/payment/           multipart {method, transaction_id, receipt}
  POST   /lms/orders/<id>/cancel/
  GET    /lms/orders/<id>/receipt/           the uploaded receipt (the student and administrators)
Administrators:
  GET    /lms/manage/orders/?status=&q=      orders, counts, revenue and refunds
  GET    /lms/manage/orders/<id>/
  POST   /lms/manage/orders/<id>/decision/   {action: confirm|reject, note}
  POST   /lms/manage/orders/<id>/refund/     {reason}
  GET/POST /lms/manage/coupons/   PATCH/DELETE /lms/manage/coupons/<id>/
  GET/PUT  /lms/manage/settings/             commission and certificate signature
  GET      /lms/manage/earnings/             every instructor's earnings;  GET/POST /lms/manage/payouts/
"""
from decimal import Decimal

from django.db import transaction
from django.db.models import Q, Sum
from django.http import FileResponse, Http404
from django.shortcuts import get_object_or_404
from django.utils import timezone
from rest_framework import serializers, status
from rest_framework.parsers import FormParser, JSONParser, MultiPartParser
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView

from accounts.models import User
from accounts.permissions import IsAdmin
from catalog.models import Course
from portal.serializers import validate_upload

from . import audit, orders, payments
from .access import is_admin
from .briefs import course_brief
from .models import CartItem, Coupon, LmsSettings, Order, OrderItem, Payout, Wishlist
from .notify import notify
from .stats import stats_for

money = orders.money


def _error(exc):
    return Response({exc.field: exc.message}, status=status.HTTP_400_BAD_REQUEST)


# ---------------------------------------------------------------- output

def order_data(order, admin=False):
    provider = payments.get(order.provider)
    student = order.student
    data = {
        'id': order.id, 'number': order.number, 'reference': order.number,
        'status': order.status, 'status_display': order.get_status_display(),
        'currency': order.currency, 'subtotal': money(order.subtotal), 'discount': money(order.discount), 'total': money(order.total),
        'coupon': order.coupon.code if order.coupon else None,
        'provider': order.provider, 'provider_label': provider.label, 'needs_receipt': provider.needs_receipt,
        'method': order.method, 'transaction_id': order.transaction_id, 'receipt_name': order.receipt_name,
        'has_receipt': bool(order.receipt), 'decision_note': order.decision_note, 'refund_reason': order.refund_reason,
        'created_at': order.created_at, 'submitted_at': order.submitted_at, 'paid_at': order.paid_at, 'refunded_at': order.refunded_at,
        'items': [{'id': i.id, 'title': i.title, 'course_slug': i.course.slug if i.course else None,
                   'thumbnail': i.course.thumbnail if i.course else '', 'price': money(i.price), 'discount': money(i.discount),
                   'amount': money(i.amount)} for i in order.items.select_related('course')],
        'billed_to': {'name': student.get_full_name() or student.email, 'email': student.email, 'country': student.country or ''},
        'can_pay': order.status in (Order.PENDING, Order.FAILED) and provider.needs_receipt,
        'can_cancel': order.status in (Order.PENDING, Order.FAILED),
        'how_to_pay': provider.instructions(order) if order.status in (Order.PENDING, Order.FAILED) else None,
    }
    if admin:
        data['student'] = {'id': student.id, 'name': student.get_full_name() or student.email, 'email': student.email}
        data['transactions'] = [{'id': t.id, 'kind': t.kind, 'status': t.status, 'amount': money(t.amount), 'provider': t.provider,
                                 'reference': t.reference, 'created_at': t.created_at} for t in order.transactions.all()]
        data['verified_by'] = order.verified_by.get_full_name() if order.verified_by else None
    return data


def cart_payload(user, code=''):
    items = list(CartItem.objects.filter(student=user).select_related('course__instructor', 'course__category', 'course__subcategory'))
    courses = [i.course for i in items]
    q = orders.quote(user, courses, code)
    data = orders.quote_data(q)
    stats = stats_for(courses)
    for row, course in zip(data['items'], courses):
        row['course']['stats'] = stats[course.id]
        row['problem'] = orders.purchase_problem(user, course)
    data['count'] = len(items)
    return data


# ---------------------------------------------------------------- cart

class CartView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request):
        return Response(cart_payload(request.user, request.query_params.get('coupon', '')))

    def post(self, request):
        course = get_object_or_404(Course, slug=str(request.data.get('slug', '')), is_published=True)
        if course.is_free:
            return Response({'detail': 'This course is free: enrol on it directly.', 'code': 'free_course'}, status=status.HTTP_400_BAD_REQUEST)
        problem = orders.purchase_problem(request.user, course)
        if problem:
            return Response({'detail': problem}, status=status.HTTP_400_BAD_REQUEST)
        CartItem.objects.get_or_create(student=request.user, course=course)
        Wishlist.objects.filter(student=request.user, course=course).delete()
        return Response(cart_payload(request.user), status=status.HTTP_201_CREATED)


class CartItemView(APIView):
    permission_classes = [IsAuthenticated]

    def delete(self, request, slug):
        CartItem.objects.filter(student=request.user, course__slug=slug).delete()
        return Response(cart_payload(request.user))


class CartCheckoutView(APIView):
    permission_classes = [IsAuthenticated]

    def post(self, request):
        courses = [i.course for i in CartItem.objects.filter(student=request.user).select_related('course')]
        try:
            order = orders.place_order(request.user, courses, request.data.get('coupon', ''))
        except orders.OrderError as exc:
            return _error(exc)
        return Response(order_data(order), status=status.HTTP_201_CREATED)


class BuyNowView(APIView):
    permission_classes = [IsAuthenticated]

    def post(self, request, slug):
        course = get_object_or_404(Course, slug=slug, is_published=True)
        if course.is_free:
            return Response({'detail': 'This course is free: enrol on it directly.', 'code': 'free_course'}, status=status.HTTP_400_BAD_REQUEST)
        try:
            order = orders.place_order(request.user, [course], request.data.get('coupon', ''))
        except orders.OrderError as exc:
            return _error(exc)
        return Response(order_data(order), status=status.HTTP_201_CREATED)


# ---------------------------------------------------------------- orders (students)

def _own_order(request, pk):
    order = get_object_or_404(Order.objects.select_related('student', 'coupon'), pk=pk)
    if order.student_id != request.user.id and not is_admin(request.user):
        raise Http404
    return order


class MyOrdersView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request):
        rows = Order.objects.filter(student=request.user).select_related('student', 'coupon').prefetch_related('items__course')[:100]
        return Response([order_data(o) for o in rows])


class OrderView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request, pk):
        order = _own_order(request, pk)
        return Response(order_data(order, admin=is_admin(request.user)))


class PaymentSerializer(serializers.Serializer):
    method = serializers.ChoiceField(choices=payments.ManualMobileMoneyProvider.METHODS)
    transaction_id = serializers.CharField(max_length=100)
    receipt = serializers.FileField(validators=[validate_upload])


class OrderPaymentView(APIView):
    permission_classes = [IsAuthenticated]
    parser_classes = [MultiPartParser, FormParser]

    def post(self, request, pk):
        order = get_object_or_404(Order, pk=pk, student=request.user)
        if order.status not in (Order.PENDING, Order.FAILED) or not payments.get(order.provider).needs_receipt:
            return Response({'detail': 'This order is not waiting for a payment.'}, status=status.HTTP_400_BAD_REQUEST)
        serializer = PaymentSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        data = serializer.validated_data
        with transaction.atomic():
            orders.submit_receipt(order, data['method'], data['transaction_id'], data['receipt'])
        return Response(order_data(order))


class OrderCancelView(APIView):
    permission_classes = [IsAuthenticated]

    def post(self, request, pk):
        order = get_object_or_404(Order, pk=pk, student=request.user)
        try:
            orders.cancel(order)
        except orders.OrderError as exc:
            return _error(exc)
        return Response(order_data(order))


class OrderReceiptView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request, pk):
        order = _own_order(request, pk)
        if not order.receipt:
            raise Http404
        return FileResponse(order.receipt.open('rb'), filename=order.receipt_name or 'receipt')


# ---------------------------------------------------------------- administrators

class ManageOrdersView(APIView):
    permission_classes = [IsAdmin]

    def get(self, request):
        queryset = Order.objects.select_related('student', 'coupon').prefetch_related('items__course')
        counts = {s: queryset.filter(status=s).count() for s, _ in Order.STATUSES}
        wanted = request.query_params.get('status')
        if wanted in counts:
            queryset = queryset.filter(status=wanted)
        query = request.query_params.get('q', '').strip()
        if query:
            queryset = queryset.filter(Q(number__icontains=query) | Q(student__email__icontains=query) | Q(student__first_name__icontains=query)
                                       | Q(student__last_name__icontains=query) | Q(items__title__icontains=query) | Q(transaction_id__icontains=query)).distinct()
        revenue = Order.objects.filter(status=Order.SUCCESSFUL).aggregate(t=Sum('total'))['t'] or Decimal('0')
        refunded = Order.objects.filter(status=Order.REFUNDED).aggregate(t=Sum('total'))['t'] or Decimal('0')
        return Response({'counts': counts, 'revenue': money(revenue), 'refunded': money(refunded),
                         'orders': [order_data(o, admin=True) for o in queryset[:200]]})


class ManageOrderView(APIView):
    permission_classes = [IsAdmin]

    def get(self, request, pk):
        return Response(order_data(get_object_or_404(Order, pk=pk), admin=True))


class OrderDecisionView(APIView):
    permission_classes = [IsAdmin]

    def post(self, request, pk):
        order = get_object_or_404(Order.objects.select_related('student'), pk=pk)
        action = request.data.get('action')
        note = str(request.data.get('note', '')).strip()[:1000]
        if action not in ('confirm', 'reject'):
            return Response({'action': 'Choose confirm or reject.'}, status=status.HTTP_400_BAD_REQUEST)
        if order.status not in (Order.PENDING, Order.PROCESSING, Order.FAILED):
            return Response({'detail': f'This order is {order.get_status_display().lower()}.'}, status=status.HTTP_400_BAD_REQUEST)
        if action == 'confirm':
            orders.mark_paid(order, request.user)
            audit.record(request, 'payment_confirmed', order, amount=money(order.total))
        else:
            orders.mark_failed(order, request.user, note)
            audit.record(request, 'payment_rejected', order, note=note)
        return Response(order_data(order, admin=True))


class OrderRefundView(APIView):
    permission_classes = [IsAdmin]

    def post(self, request, pk):
        order = get_object_or_404(Order.objects.select_related('student'), pk=pk)
        reason = str(request.data.get('reason', '')).strip()[:1000]
        try:
            orders.refund(order, request.user, reason)
        except orders.OrderError as exc:
            return _error(exc)
        audit.record(request, 'payment_refunded', order, amount=money(order.total), reason=reason)
        return Response(order_data(order, admin=True))


class CouponSerializer(serializers.ModelSerializer):
    courses = serializers.SlugRelatedField(slug_field='slug', queryset=Course.objects.all(), many=True, required=False)
    course_titles = serializers.SerializerMethodField()
    uses = serializers.SerializerMethodField()

    class Meta:
        model = Coupon
        fields = ['id', 'code', 'description', 'kind', 'value', 'courses', 'course_titles', 'max_uses', 'per_user_limit',
                  'min_purchase', 'starts_at', 'ends_at', 'is_active', 'uses', 'created_at']
        read_only_fields = ['id', 'created_at']

    def get_uses(self, obj):
        return obj.uses()

    def get_course_titles(self, obj):
        return [c.title for c in obj.courses.all()]

    def validate_code(self, value):
        value = value.strip().upper()
        if not value.replace('-', '').replace('_', '').isalnum():
            raise serializers.ValidationError('Use letters, numbers, dashes and underscores only.')
        if Coupon.objects.filter(code=value).exclude(pk=getattr(self.instance, 'pk', None)).exists():
            raise serializers.ValidationError('That code already exists.')
        return value

    def validate(self, attrs):
        kind = attrs.get('kind', getattr(self.instance, 'kind', Coupon.PERCENT))
        value = attrs.get('value', getattr(self.instance, 'value', None))
        if value is not None and value <= 0:
            raise serializers.ValidationError({'value': 'The discount must be more than 0.'})
        if kind == Coupon.PERCENT and value is not None and value > 100:
            raise serializers.ValidationError({'value': 'A percentage cannot be more than 100.'})
        starts = attrs.get('starts_at', getattr(self.instance, 'starts_at', None))
        ends = attrs.get('ends_at', getattr(self.instance, 'ends_at', None))
        if starts and ends and ends <= starts:
            raise serializers.ValidationError({'ends_at': 'The end must be after the start.'})
        if attrs.get('min_purchase') is not None and attrs['min_purchase'] < 0:
            raise serializers.ValidationError({'min_purchase': 'Must be 0 or more.'})
        return attrs


class CouponsView(APIView):
    permission_classes = [IsAdmin]
    parser_classes = [JSONParser]

    def get(self, request):
        return Response(CouponSerializer(Coupon.objects.prefetch_related('courses'), many=True).data)

    def post(self, request):
        serializer = CouponSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        coupon = serializer.save()
        audit.record(request, 'coupon_created', coupon)
        if request.data.get('notify_students'):
            # Tell students about the code (only the courses it works on, if it is limited)
            titles = ', '.join(c.title for c in coupon.courses.all()) or 'any course'
            off = f'{coupon.value:g}% off' if coupon.kind == Coupon.PERCENT else f'NLe {coupon.value:,.2f} off'
            notify(list(User.objects.filter(role=User.STUDENT, is_active=True)), 'coupon', f'Use code {coupon.code} for {off}',
                   f'Valid on {titles}{coupon.ends_at and f" until {coupon.ends_at:%d %b %Y}" or ""}. Enter it in your cart.', '/courses')
        return Response(serializer.data, status=status.HTTP_201_CREATED)


class CouponDetailView(APIView):
    permission_classes = [IsAdmin]
    parser_classes = [JSONParser]

    def patch(self, request, pk):
        coupon = get_object_or_404(Coupon, pk=pk)
        serializer = CouponSerializer(coupon, data=request.data, partial=True)
        serializer.is_valid(raise_exception=True)
        serializer.save()
        return Response(serializer.data)

    def delete(self, request, pk):
        coupon = get_object_or_404(Coupon, pk=pk)
        audit.record(request, 'coupon_deleted', coupon)
        coupon.delete()
        return Response(status=status.HTTP_204_NO_CONTENT)


class SettingsSerializer(serializers.ModelSerializer):
    commission_percent = serializers.DecimalField(max_digits=5, decimal_places=2, min_value=0, max_value=100)

    class Meta:
        model = LmsSettings
        fields = ['commission_percent', 'certificate_signer_name', 'certificate_signer_title', 'certificate_signature', 'updated_at']
        read_only_fields = ['updated_at']


class LmsSettingsView(APIView):
    permission_classes = [IsAdmin]

    def get(self, request):
        return Response(SettingsSerializer(LmsSettings.load()).data)

    def put(self, request):
        row = LmsSettings.load()
        before = row.commission_percent
        serializer = SettingsSerializer(row, data=request.data, partial=True)
        serializer.is_valid(raise_exception=True)
        serializer.save()
        if row.commission_percent != before:
            audit.record(request, 'commission_changed', row, label='Platform commission', before=str(before), after=str(row.commission_percent))
        return Response(serializer.data)


def earnings_summary(instructor):
    items = OrderItem.objects.filter(instructor=instructor)
    sold = items.filter(order__status=Order.SUCCESSFUL)
    gross = sold.aggregate(t=Sum('amount'))['t'] or Decimal('0')
    net = sold.aggregate(t=Sum('instructor_share'))['t'] or Decimal('0')
    refunds = items.filter(order__status=Order.REFUNDED).aggregate(t=Sum('amount'))['t'] or Decimal('0')
    paid = Payout.objects.filter(instructor=instructor).aggregate(t=Sum('amount'))['t'] or Decimal('0')
    return {'gross': money(gross), 'commission': money(gross - net), 'refunds': money(refunds), 'net': money(net),
            'paid': money(paid), 'pending': money(net - paid), 'sales': sold.count()}


class ManageEarningsView(APIView):
    permission_classes = [IsAdmin]

    def get(self, request):
        teachers = User.objects.filter(Q(role=User.INSTRUCTOR) | Q(sold_items__isnull=False)).distinct()
        return Response({
            'commission_percent': str(LmsSettings.load().commission_percent),
            'instructors': [{'id': t.id, 'name': t.get_full_name() or t.email, 'email': t.email, **earnings_summary(t)} for t in teachers],
        })


class PayoutsView(APIView):
    permission_classes = [IsAdmin]

    def get(self, request):
        rows = Payout.objects.select_related('instructor')
        if request.query_params.get('instructor'):
            rows = rows.filter(instructor_id=request.query_params['instructor'])
        return Response([{'id': p.id, 'instructor': {'id': p.instructor_id, 'name': p.instructor.get_full_name()}, 'amount': money(p.amount),
                          'method': p.method, 'reference': p.reference, 'note': p.note, 'paid_at': p.paid_at} for p in rows[:300]])

    def post(self, request):
        instructor = User.objects.filter(pk=request.data.get('instructor')).first()
        try:
            amount = Decimal(str(request.data.get('amount')))
        except Exception:
            amount = Decimal('0')
        if not instructor:
            return Response({'instructor': 'Choose the instructor.'}, status=status.HTTP_400_BAD_REQUEST)
        if amount <= 0:
            return Response({'amount': 'Enter the amount paid.'}, status=status.HTTP_400_BAD_REQUEST)
        payout = Payout.objects.create(instructor=instructor, amount=amount.quantize(Decimal('0.01')), method=str(request.data.get('method', ''))[:60],
                                       reference=str(request.data.get('reference', ''))[:120], note=str(request.data.get('note', ''))[:300],
                                       paid_at=timezone.now(), created_by=request.user)
        audit.record(request, 'payout_recorded', payout, label=f'{instructor.get_full_name()}: NLe {payout.amount}')
        notify(instructor, 'payment', 'You’ve been paid', f'NLe {payout.amount:,.2f} was paid out to you.', '/instructor/earnings')
        return Response({'id': payout.id, 'amount': money(payout.amount)}, status=status.HTTP_201_CREATED)

