"""
Course bundles and gifts.

Bundles (several courses for one lower price):
  GET  /lms/bundles/?course=<slug>        published bundles (those including a course, with ?course=)
  GET  /lms/bundles/<slug>/               one bundle: its courses, full and bundle price, and your price
  POST /lms/bundles/<slug>/buy/           {gift?: {name, email, message}}  an order for the courses you don't own yet
  GET/POST /lms/manage/bundles/   PATCH/DELETE /lms/manage/bundles/<id>/     (administrators)
Gifts (buying a course or bundle for someone; they redeem it once it is paid):
  POST /lms/gifts/                        {course | bundle, name, email, message}
  GET  /lms/gifts/<code>/                 what the gift is (anyone with the code)
  POST /lms/gifts/<code>/redeem/          the signed-in person enrols on its courses
"""
from decimal import Decimal

from django.core.validators import validate_email
from django.core.exceptions import ValidationError
from django.db import transaction
from django.shortcuts import get_object_or_404
from django.utils import timezone
from django.utils.text import slugify
from rest_framework import status
from rest_framework.permissions import AllowAny, IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView

from accounts.permissions import IsAdmin
from catalog.models import Course

from . import orders
from .briefs import course_brief
from .commerce import order_data
from .models import Bundle, Gift, Order
from .notify import notify
from .stats import stats_for


def _money(value):
    return f'{Decimal(value or 0):.2f}'


def bundle_data(bundle, user=None, full=False):
    courses = [c for c in bundle.courses.all() if c.is_published]
    separate = sum((Decimal(c.sale_price or 0) for c in courses), Decimal('0'))
    owned = [c for c in courses if user and user.is_authenticated and orders.owns(user, c)]
    left = [c for c in courses if c not in owned]
    yours = orders.bundle_price(bundle, left) if owned else Decimal(bundle.price)
    data = {'id': bundle.id, 'slug': bundle.slug, 'title': bundle.title, 'summary': bundle.summary,
            'course_count': len(courses), 'price': _money(bundle.price), 'separate_price': _money(separate),
            'savings': _money(max(Decimal('0'), separate - Decimal(bundle.price))),
            'savings_percent': round(100 * (separate - Decimal(bundle.price)) / separate) if separate > bundle.price else 0,
            'thumbnails': [c.thumbnail for c in courses[:4]], 'is_published': bundle.is_published}
    if full:
        stats = stats_for(courses)
        data.update({'description': bundle.description, 'courses': [course_brief(c, stats[c.id]) for c in courses],
                     'owned': [c.slug for c in owned], 'your_price': _money(yours), 'owns_all': bool(courses) and not left})
    return data


def clean_gift(data):
    """{name, email, message} or raises ValueError."""
    data = data if isinstance(data, dict) else {}
    name = str(data.get('name', '')).strip()
    email = str(data.get('email', '')).strip().lower()
    if not name:
        raise ValueError('Who is the gift for? Add their name.')
    try:
        validate_email(email)
    except ValidationError:
        raise ValueError('Add the email address the gift should be sent to.') from None
    return {'name': name[:120], 'email': email, 'message': str(data.get('message', '')).strip()[:1000]}


def _order_response(student, courses, bundle=None, gift=None, affiliate=''):
    try:
        order = orders.place_order(student, courses, bundle=bundle, gift=gift, affiliate=affiliate)
    except orders.OrderError as exc:
        return Response({exc.field: exc.message}, status=status.HTTP_400_BAD_REQUEST)
    return Response(order_data(order), status=status.HTTP_201_CREATED)


class BundlesView(APIView):
    permission_classes = [AllowAny]

    def get(self, request):
        bundles = Bundle.objects.filter(is_published=True).prefetch_related('courses')
        if request.query_params.get('course'):
            bundles = bundles.filter(courses__slug=request.query_params['course'])
        return Response([bundle_data(b, request.user) for b in bundles.distinct()])


class BundleView(APIView):
    permission_classes = [AllowAny]

    def get(self, request, slug):
        bundle = get_object_or_404(Bundle.objects.prefetch_related('courses'), slug=slug, is_published=True)
        return Response(bundle_data(bundle, request.user, full=True))


class BundleBuyView(APIView):
    permission_classes = [IsAuthenticated]

    def post(self, request, slug):
        bundle = get_object_or_404(Bundle.objects.prefetch_related('courses'), slug=slug, is_published=True)
        gift = None
        if request.data.get('gift'):
            try:
                gift = clean_gift(request.data['gift'])
            except ValueError as exc:
                return Response({'gift': str(exc)}, status=status.HTTP_400_BAD_REQUEST)
        courses = [c for c in bundle.courses.all() if c.is_published]
        if not gift:
            courses = [c for c in courses if not orders.owns(request.user, c)]
            if not courses:
                return Response({'detail': 'You already own every course in this bundle.'}, status=status.HTTP_400_BAD_REQUEST)
        return _order_response(request.user, courses, bundle=bundle, gift=gift, affiliate=request.data.get('affiliate', ''))


class GiftBuyView(APIView):
    """Buy one course as a gift (bundles are given from their own page)."""
    permission_classes = [IsAuthenticated]

    def post(self, request):
        try:
            gift = clean_gift(request.data)
        except ValueError as exc:
            return Response({'gift': str(exc)}, status=status.HTTP_400_BAD_REQUEST)
        if request.data.get('bundle'):
            bundle = get_object_or_404(Bundle.objects.prefetch_related('courses'), slug=request.data['bundle'], is_published=True)
            return _order_response(request.user, [c for c in bundle.courses.all() if c.is_published], bundle=bundle, gift=gift,
                                   affiliate=request.data.get('affiliate', ''))
        course = get_object_or_404(Course, slug=str(request.data.get('course', '')), is_published=True)
        return _order_response(request.user, [course], gift=gift, affiliate=request.data.get('affiliate', ''))


def gift_data(gift, user):
    order = gift.order
    paid = order.status == Order.SUCCESSFUL and not gift.revoked_at
    courses = [i.course for i in order.items.select_related('course') if i.course]
    return {'code': gift.code, 'from': order.student.get_full_name() or 'Someone', 'recipient_name': gift.recipient_name,
            'message': gift.message, 'bundle': order.bundle.title if order.bundle else None,
            'courses': [{'slug': c.slug, 'title': c.title, 'thumbnail': c.thumbnail} for c in courses],
            'ready': paid and not gift.redeemed_at, 'paid': paid, 'revoked': bool(gift.revoked_at),
            'redeemed': bool(gift.redeemed_at), 'redeemed_by_you': bool(user.is_authenticated and gift.redeemed_by_id == user.id),
            'redeemed_at': gift.redeemed_at}


class GiftView(APIView):
    permission_classes = [AllowAny]

    def get(self, request, code):
        gift = get_object_or_404(Gift.objects.select_related('order__student', 'order__bundle'), code=code.strip().upper())
        return Response(gift_data(gift, request.user))


class GiftRedeemView(APIView):
    permission_classes = [IsAuthenticated]

    def post(self, request, code):
        with transaction.atomic():
            gift = get_object_or_404(Gift.objects.select_for_update().select_related('order__student'), code=code.strip().upper())
            if gift.revoked_at:
                return Response({'detail': 'This gift was cancelled.'}, status=status.HTTP_400_BAD_REQUEST)
            if gift.order.status != Order.SUCCESSFUL:
                return Response({'detail': 'This gift hasn’t been paid for yet. Try again once it has.'}, status=status.HTTP_400_BAD_REQUEST)
            if gift.redeemed_at:
                mine = gift.redeemed_by_id == request.user.id
                return Response({'detail': 'You already opened this gift.' if mine else 'This gift was already used.'},
                                status=status.HTTP_400_BAD_REQUEST)
            courses = [i.course for i in gift.order.items.select_related('course') if i.course]
            orders.enroll_in(request.user, courses)
            gift.redeemed_by, gift.redeemed_at = request.user, timezone.now()
            gift.save(update_fields=['redeemed_by', 'redeemed_at'])
        request.user.join_track('training')
        notify(gift.order.student, 'purchase', f'{gift.recipient_name} opened your gift', ', '.join(c.title for c in courses), f'/orders/{gift.order_id}')
        return Response(gift_data(gift, request.user))


# ---------------------------------------------------------------- managing bundles (administrators)

def _apply(bundle, data):
    errors = {}
    for field, limit in (('title', 200), ('summary', 300), ('description', 5000)):
        if field in data:
            setattr(bundle, field, str(data[field] or '').strip()[:limit])
    if not bundle.title:
        errors['title'] = 'Give the bundle a title.'
    if 'price' in data:
        try:
            bundle.price = Decimal(str(data['price']))
            if bundle.price <= 0:
                raise ValueError
        except Exception:
            errors['price'] = 'Enter the bundle price, more than 0.'
    elif bundle.price is None:
        errors['price'] = 'Enter the bundle price.'
    if 'is_published' in data:
        bundle.is_published = bool(data['is_published'])
    if not bundle.slug and bundle.title:
        base = slugify(bundle.title)[:100] or 'bundle'
        slug, n = base, 2
        while Bundle.objects.filter(slug=slug).exists():
            slug, n = f'{base}-{n}', n + 1
        bundle.slug = slug
    courses = None
    if 'courses' in data:
        slugs = [str(s) for s in data['courses']] if isinstance(data['courses'], list) else []
        courses = list(Course.objects.filter(slug__in=slugs))
        if len(courses) < 2:
            errors['courses'] = 'A bundle needs at least two courses.'
        elif any(c.is_free for c in courses):
            errors['courses'] = 'Bundles are for paid courses: take the free ones out.'
    return errors, courses


def manage_data(bundle):
    return {**bundle_data(bundle), 'description': bundle.description, 'courses': [c.slug for c in bundle.courses.all()],
            'sold': bundle.orders.filter(status=Order.SUCCESSFUL).count()}


class ManageBundlesView(APIView):
    permission_classes = [IsAdmin]

    def get(self, request):
        return Response([manage_data(b) for b in Bundle.objects.prefetch_related('courses')])

    def post(self, request):
        bundle = Bundle(price=None)
        errors, courses = _apply(bundle, request.data)
        if courses is None:
            errors['courses'] = 'Choose at least two courses.'
        if errors:
            return Response(errors, status=status.HTTP_400_BAD_REQUEST)
        bundle.save()
        bundle.courses.set(courses)
        return Response(manage_data(bundle), status=status.HTTP_201_CREATED)


class ManageBundleView(APIView):
    permission_classes = [IsAdmin]

    def patch(self, request, pk):
        bundle = get_object_or_404(Bundle, pk=pk)
        errors, courses = _apply(bundle, request.data)
        if errors:
            return Response(errors, status=status.HTTP_400_BAD_REQUEST)
        bundle.save()
        if courses is not None:
            bundle.courses.set(courses)
        return Response(manage_data(bundle))

    def delete(self, request, pk):
        get_object_or_404(Bundle, pk=pk).delete()  # past orders keep their courses and prices
        return Response(status=status.HTTP_204_NO_CONTENT)
