"""
The Premium plan and paying in instalments.

Premium (alongside single purchases): a student pays for a monthly or yearly plan (a normal order, paid like any other).
While it is active they can start any Premium course (Course.is_premium); those places close when Premium ends, unless
they also bought the course. Subscription revenue stays with the platform.

Instalments: courses from LmsSettings.instalment_min_price can be paid in 2–3 parts, a month apart. The first part opens
the course; each later part is an order with a due date. Lessons lock when a part is more than instalment_grace_days
overdue, and open again once it is paid. Refunding any part cancels the plan and the place.

  GET  /lms/premium/                        plans, my Premium, how many courses it opens
  POST /lms/premium/plans/<id>/subscribe/   an order for the plan
  POST /lms/courses/<slug>/premium-enrol/   start a Premium course with my Premium
  POST /lms/courses/<slug>/instalments/     {parts}  the order for the first part
  GET  /lms/me/instalments/                 my payment plans and their schedule
  GET/POST /lms/manage/plans/  PATCH/DELETE /lms/manage/plans/<id>/   (administrators)
"""
from datetime import timedelta
from decimal import ROUND_HALF_UP, Decimal

from django.db import transaction
from django.db.models import Max
from django.shortcuts import get_object_or_404
from django.utils import timezone
from rest_framework import status
from rest_framework.permissions import AllowAny, IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView

from accounts.permissions import IsAdmin
from catalog.models import Course
from portal.models import TrainingEnrollment

from .models import InstalmentPlan, LmsSettings, Order, OrderItem, Plan, PremiumEnrollment, Subscription
from .notify import notify

CENT = Decimal('0.01')
PART_DAYS = 30


def money(value):
    return f'{Decimal(value or 0):.2f}'


# ---------------------------------------------------------------- rules

def premium_until(user):
    """When the student's Premium ends (None if they have none now)."""
    if not (user and user.is_authenticated):
        return None
    end = Subscription.objects.filter(user=user, ends_at__gt=timezone.now()).aggregate(m=Max('ends_at'))['m']
    return end


def overdue_part(student, course):
    """An unpaid instalment for this course more than the grace period past its due date, or None."""
    grace = LmsSettings.load().instalment_grace_days
    return (Order.objects.filter(student=student, instalment_plan__course=course, instalment_plan__status=InstalmentPlan.ACTIVE,
                                 status__in=[Order.PENDING, Order.FAILED], due_at__lt=timezone.now() - timedelta(days=grace))
            .order_by('due_at').first())


def blocked_reason(enrollment):
    """Why an existing place is closed right now: 'premium_ended', 'instalment_overdue', or None."""
    if enrollment is None:
        return None
    if PremiumEnrollment.objects.filter(enrollment=enrollment).exists() and not premium_until(enrollment.student):
        return 'premium_ended'
    if overdue_part(enrollment.student, enrollment.course):
        return 'instalment_overdue'
    return None


def instalment_offer(course, user=None):
    """The ways to split this course's price, or None when it can't be."""
    rates = LmsSettings.load()
    price = Decimal(course.sale_price or 0)
    if not rates.instalments_enabled or price <= 0 or price < rates.instalment_min_price:
        return None
    options = []
    for parts in range(2, max(2, min(rates.instalment_max_parts, 3)) + 1):
        first, rest = split(price, parts)
        options.append({'parts': parts, 'first': money(first), 'each': money(rest), 'total': money(price)})
    return {'options': options, 'grace_days': rates.instalment_grace_days}


def split(total, parts):
    """(first part, each later part): equal parts, the first takes the rounding."""
    each = (total / parts).quantize(CENT, ROUND_HALF_UP)
    return total - each * (parts - 1), each


# ---------------------------------------------------------------- orders

def _order(student, total, **fields):
    from . import payments
    provider = payments.default_provider()
    order = Order.objects.create(student=student, subtotal=total, total=total, provider=provider.key, **fields)
    return order, provider


@transaction.atomic
def subscribe(student, plan):
    from .orders import OrderError
    if not LmsSettings.load().premium_enabled or not plan.is_active:
        raise OrderError('This plan is not available.')
    Order.objects.filter(student=student, plan__isnull=False, status__in=[Order.PENDING, Order.FAILED]).update(status=Order.CANCELLED)
    order, provider = _order(student, Decimal(plan.price), plan=plan)
    provider.start(order)
    notify(student, 'purchase', f'Order {order.number} placed', f'Pay {order.currency} {money(order.total)} to start {plan.name}.', f'/orders/{order.id}')
    return order


def _part_order(plan, number, amount, due_at=None):
    """The order for one part, with the course line (the instructor earns their share of each part)."""
    from .orders import commission_for
    course = plan.course
    order, provider = _order(plan.student, amount, instalment_plan=plan, instalment_number=number, due_at=due_at)
    percent = commission_for(course)
    share = (amount * (100 - percent) / 100).quantize(CENT, ROUND_HALF_UP)
    OrderItem.objects.create(order=order, course=course, title=f'{course.title} (part {number} of {plan.parts})',
                             instructor_id=course.instructor_id, price=amount, discount=0, amount=amount,
                             commission_percent=percent, instructor_share=share)
    provider.start(order)
    return order


@transaction.atomic
def start_instalments(student, course, parts):
    from .orders import OrderError, purchase_problem
    offer = instalment_offer(course, student)
    if not offer or parts not in [o['parts'] for o in offer['options']]:
        raise OrderError('This course can’t be paid in that many parts.')
    problem = purchase_problem(student, course)
    if problem:
        raise OrderError(problem)
    if InstalmentPlan.objects.filter(student=student, course=course, status=InstalmentPlan.ACTIVE).exists():
        raise OrderError('You are already paying for this course in parts.')
    total = Decimal(course.sale_price)
    first, _ = split(total, parts)
    plan = InstalmentPlan.objects.create(student=student, course=course, total=total, parts=parts)
    order = _part_order(plan, 1, first)
    notify(student, 'purchase', f'Order {order.number} placed',
           f'Pay the first part, {order.currency} {money(first)}, to open {course.title}.', f'/orders/{order.id}')
    return order


def on_paid(order):
    """Called by orders.mark_paid: starts Premium, or moves a payment plan on (the first part's place opens as usual)."""
    if order.plan_id:
        now = timezone.now()
        start = max(now, premium_until(order.student) or now)
        Subscription.objects.create(user=order.student, plan=order.plan, order=order, starts_at=start,
                                    ends_at=start + timedelta(days=order.plan.days))
        order.student.join_track('training')
        notify(order.student, 'purchase', f'{order.plan.name} is active', 'Every Premium course is open to you. Enjoy!', '/premium')
    if order.instalment_plan_id:
        plan = order.instalment_plan
        plan.paid_parts += 1
        if plan.paid_parts >= plan.parts:
            plan.status, plan.next_due_at = InstalmentPlan.COMPLETED, None
            notify(plan.student, 'purchase', f'{plan.course.title} is paid in full', 'Thank you! The course is yours.', f'/courses/{plan.course.slug}')
        elif not plan.orders.filter(instalment_number=plan.paid_parts + 1).exists():
            _, each = split(plan.total, plan.parts)
            due = (order.due_at or timezone.now()) + timedelta(days=PART_DAYS)
            nxt = _part_order(plan, plan.paid_parts + 1, each, due_at=due)
            plan.next_due_at = due
            notify(plan.student, 'payment', f'Part {nxt.instalment_number} of {plan.parts} is due {due:%d %b}',
                   f'{plan.course.title}: pay {nxt.currency} {money(nxt.total)} by then to keep your lessons open.', f'/orders/{nxt.id}')
        plan.save(update_fields=['paid_parts', 'status', 'next_due_at'])


def on_refund(order):
    """Called by orders.refund before enrolments are taken back."""
    if order.plan_id:
        Subscription.objects.filter(order=order).update(ends_at=timezone.now())
    if order.instalment_plan_id:
        plan = order.instalment_plan
        plan.status = InstalmentPlan.CANCELLED
        plan.save(update_fields=['status'])
        plan.orders.filter(status__in=Order.OPEN).update(status=Order.CANCELLED)


def remind_instalments(within=timedelta(days=3), now=None):
    """Tell students about a part due soon (once per part). Returns how many were told."""
    now = now or timezone.now()
    told = 0
    for order in Order.objects.filter(instalment_plan__status=InstalmentPlan.ACTIVE, status__in=[Order.PENDING, Order.FAILED],
                                      due_at__gt=now, due_at__lte=now + within).select_related('instalment_plan__course', 'student'):
        link = f'/orders/{order.id}'
        from .models import Notification
        if Notification.objects.filter(user=order.student, kind='payment', link=link, title__startswith='Reminder').exists():
            continue
        notify(order.student, 'payment', f'Reminder: part {order.instalment_number} is due {order.due_at:%d %b}',
               f'{order.instalment_plan.course.title}: pay {order.currency} {money(order.total)} to keep your lessons open.', link)
        told += 1
    return told


def plan_data(plan):
    return {'id': plan.id, 'name': plan.name, 'interval': plan.interval, 'interval_display': plan.get_interval_display(),
            'price': money(plan.price), 'description': plan.description, 'is_active': plan.is_active, 'days': plan.days}


# ---------------------------------------------------------------- views

class PremiumView(APIView):
    permission_classes = [AllowAny]

    def get(self, request):
        rates = LmsSettings.load()
        until = premium_until(request.user)
        return Response({'enabled': rates.premium_enabled, 'plans': [plan_data(p) for p in Plan.objects.filter(is_active=True)],
                         'active_until': until, 'course_count': Course.objects.filter(is_published=True, is_premium=True).count()})


class SubscribeView(APIView):
    permission_classes = [IsAuthenticated]

    def post(self, request, pk):
        from .commerce import order_data
        from .orders import OrderError
        plan = get_object_or_404(Plan, pk=pk)
        try:
            order = subscribe(request.user, plan)
        except OrderError as exc:
            return Response({'detail': exc.message}, status=status.HTTP_400_BAD_REQUEST)
        return Response(order_data(order), status=status.HTTP_201_CREATED)


class PremiumEnrolView(APIView):
    permission_classes = [IsAuthenticated]

    def post(self, request, slug):
        from .orders import enroll_in, owns
        course = get_object_or_404(Course, slug=slug, is_published=True)
        if not course.is_premium:
            return Response({'detail': 'This course isn’t part of Premium.'}, status=status.HTTP_400_BAD_REQUEST)
        if not premium_until(request.user):
            return Response({'detail': 'Get Premium to start this course.', 'code': 'no_premium'}, status=status.HTTP_403_FORBIDDEN)
        if not owns(request.user, course):
            enroll_in(request.user, [course])
            enrollment = TrainingEnrollment.objects.get(student=request.user, course=course)
            PremiumEnrollment.objects.get_or_create(enrollment=enrollment)
        request.user.join_track('training')
        return Response({'enrolled': True, 'learn': f'/learn/{course.slug}'})


class InstalmentsView(APIView):
    permission_classes = [IsAuthenticated]

    def post(self, request, slug):
        from .commerce import order_data
        from .orders import OrderError
        course = get_object_or_404(Course, slug=slug, is_published=True)
        try:
            order = start_instalments(request.user, course, int(request.data.get('parts') or 0))
        except (OrderError, ValueError) as exc:
            return Response({'detail': getattr(exc, 'message', 'Choose 2 or 3 parts.')}, status=status.HTTP_400_BAD_REQUEST)
        return Response(order_data(order), status=status.HTTP_201_CREATED)


class MyInstalmentsView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request):
        grace = LmsSettings.load().instalment_grace_days
        out = []
        for plan in InstalmentPlan.objects.filter(student=request.user).select_related('course'):
            orders = list(plan.orders.exclude(status=Order.CANCELLED).order_by('instalment_number'))
            out.append({'id': plan.id, 'course': {'slug': plan.course.slug, 'title': plan.course.title}, 'total': money(plan.total),
                        'parts': plan.parts, 'paid_parts': plan.paid_parts, 'status': plan.status, 'status_display': plan.get_status_display(),
                        'next_due_at': plan.next_due_at, 'locked': bool(overdue_part(request.user, plan.course)), 'grace_days': grace,
                        'schedule': [{'number': o.instalment_number, 'amount': money(o.total), 'status': o.status,
                                      'status_display': o.get_status_display(), 'due_at': o.due_at, 'paid_at': o.paid_at, 'order_id': o.id}
                                     for o in orders]})
        return Response(out)


class ManagePlansView(APIView):
    permission_classes = [IsAdmin]

    def get(self, request):
        now = timezone.now()
        return Response({'plans': [{**plan_data(p), 'subscribers': p.subscriptions.filter(ends_at__gt=now).values('user').distinct().count()}
                                   for p in Plan.objects.all()],
                         'active_subscribers': Subscription.objects.filter(ends_at__gt=now).values('user').distinct().count(),
                         'premium_courses': Course.objects.filter(is_published=True, is_premium=True).count()})

    def post(self, request):
        plan = Plan()
        errors = _apply(plan, request.data)
        if errors:
            return Response(errors, status=status.HTTP_400_BAD_REQUEST)
        plan.save()
        return Response(plan_data(plan), status=status.HTTP_201_CREATED)


class ManagePlanView(APIView):
    permission_classes = [IsAdmin]

    def patch(self, request, pk):
        plan = get_object_or_404(Plan, pk=pk)
        errors = _apply(plan, request.data)
        if errors:
            return Response(errors, status=status.HTTP_400_BAD_REQUEST)
        plan.save()
        return Response(plan_data(plan))

    def delete(self, request, pk):
        plan = get_object_or_404(Plan, pk=pk)
        if plan.subscriptions.exists():
            plan.is_active = False  # people paid for it: keep it, just stop selling it
            plan.save(update_fields=['is_active'])
            return Response(plan_data(plan))
        plan.delete()
        return Response(status=status.HTTP_204_NO_CONTENT)


def _apply(plan, data):
    errors = {}
    if 'name' in data:
        plan.name = str(data['name'] or '').strip()[:80]
    if 'description' in data:
        plan.description = str(data['description'] or '').strip()[:300]
    if 'interval' in data:
        if data['interval'] not in dict(Plan.INTERVALS):
            errors['interval'] = 'Monthly or yearly.'
        else:
            plan.interval = data['interval']
    if 'price' in data:
        try:
            plan.price = Decimal(str(data['price']))
            if plan.price <= 0:
                raise ValueError
        except Exception:
            errors['price'] = 'Enter a price above 0.'
    if 'is_active' in data:
        plan.is_active = bool(data['is_active'])
    if not plan.name:
        errors['name'] = 'Name the plan.'
    if plan.price is None and 'price' not in errors:
        errors['price'] = 'Enter a price.'
    return errors
