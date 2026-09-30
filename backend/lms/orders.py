"""
The rules of buying courses: pricing a cart (sale prices, coupons), placing an order, and what happens when it is
paid, fails, is cancelled or refunded. Views call these; payment providers report results through mark_paid/mark_failed.
"""
from decimal import ROUND_HALF_UP, Decimal

from django.db import transaction
from django.utils import timezone

from portal.models import TrainingEnrollment

from . import emails
from .models import CartItem, Coupon, LmsSettings, Order, OrderItem, Transaction, Wishlist
from .notify import notify, notify_admins

CENT = Decimal('0.01')
ZERO = Decimal('0')


def money(value):
    return f'{Decimal(value or 0):.2f}'


class OrderError(Exception):
    def __init__(self, message, field='detail'):
        super().__init__(message)
        self.message, self.field = message, field


def owns(student, course):
    return TrainingEnrollment.objects.filter(
        student=student, course=course, status__in=[TrainingEnrollment.ACTIVE, TrainingEnrollment.COMPLETED]).exists()


def purchase_problem(student, course):
    """Why this student can't buy this course, or None."""
    if not course.is_published:
        return 'This course is not available.'
    if course.instructor_id and course.instructor_id == student.id:
        return 'You teach this course.'
    if owns(student, course):
        return 'You already own this course.'
    if OrderItem.objects.filter(order__student=student, order__status=Order.PROCESSING, course=course).exists():
        return 'Your payment for this course is already being checked.'
    return None


def find_coupon(code):
    code = (code or '').strip().upper()
    return Coupon.objects.filter(code=code).first() if code else None


def quote(student, courses, code=''):
    """
    Prices a list of courses: {lines: [{course, list_price, price, discount, amount}], subtotal, discount, total,
    coupon, coupon_error}. The coupon's discount is shared across the courses it applies to, in proportion to price.
    """
    lines = [{'course': c, 'list_price': Decimal(c.price or 0), 'price': Decimal(c.sale_price or 0), 'discount': ZERO} for c in courses]
    subtotal = sum((line['price'] for line in lines), ZERO)
    coupon, error = None, ''
    if (code or '').strip():
        coupon = find_coupon(code)
        if not coupon:
            error = 'That code is not valid.'
        else:
            error = coupon.problem(courses, student, subtotal, timezone.now()) or ''
            if error:
                coupon = None
    if coupon:
        eligible = [line for line in lines if line['course'] in coupon.eligible(courses) and line['price'] > 0]
        base = sum((line['price'] for line in eligible), ZERO)
        off = coupon.discount(base) if base else ZERO
        left = off
        for i, line in enumerate(eligible):
            share = left if i == len(eligible) - 1 else (off * line['price'] / base).quantize(CENT, ROUND_HALF_UP)
            share = min(share, line['price'], left)
            line['discount'], left = share, left - share
    for line in lines:
        line['amount'] = line['price'] - line['discount']
    discount = sum((line['discount'] for line in lines), ZERO)
    return {'lines': lines, 'subtotal': subtotal, 'discount': discount, 'total': subtotal - discount,
            'coupon': coupon, 'coupon_error': error}


def quote_data(q):
    from .briefs import course_brief
    return {
        'items': [{'course': course_brief(line['course']), 'list_price': money(line['list_price']), 'price': money(line['price']),
                   'discount': money(line['discount']), 'amount': money(line['amount'])} for line in q['lines']],
        'subtotal': money(q['subtotal']), 'discount': money(q['discount']), 'total': money(q['total']),
        'coupon': {'code': q['coupon'].code, 'description': q['coupon'].description} if q['coupon'] else None,
        'coupon_error': q['coupon_error'],
    }


@transaction.atomic
def place_order(student, courses, code=''):
    """Creates an order for these courses. A free total is paid at once. Raises OrderError."""
    from . import payments
    if not courses:
        raise OrderError('Your cart is empty.')
    for course in courses:
        problem = purchase_problem(student, course)
        if problem:
            raise OrderError(f'{course.title}: {problem}')
    q = quote(student, courses, code)
    if q['coupon_error']:
        raise OrderError(q['coupon_error'], 'coupon')

    # An unpaid order for the same courses is replaced by this one
    stale = Order.objects.filter(student=student, status__in=[Order.PENDING, Order.FAILED], items__course__in=courses).distinct()
    for old in stale:
        old.status = Order.CANCELLED
        old.save(update_fields=['status'])

    free = q['total'] <= 0
    provider = payments.get('free') if free else payments.default_provider()
    order = Order.objects.create(student=student, subtotal=q['subtotal'], discount=q['discount'], total=q['total'],
                                 coupon=q['coupon'], provider=provider.key)
    commission = LmsSettings.load().commission_percent
    for line in q['lines']:
        course = line['course']
        # Courses ADRAM teaches itself (no instructor account) earn the platform everything
        percent = commission if course.instructor_id else Decimal('100')
        share = (line['amount'] * (100 - percent) / 100).quantize(CENT, ROUND_HALF_UP)
        OrderItem.objects.create(order=order, course=course, title=course.title, instructor_id=course.instructor_id,
                                 price=line['price'], discount=line['discount'], amount=line['amount'],
                                 commission_percent=percent, instructor_share=share)
    if free:
        mark_paid(order, None)
    else:
        provider.start(order)
        notify(student, 'purchase', f'Order {order.number} placed', f'Pay {order.currency} {money(order.total)} to unlock your courses.', f'/orders/{order.id}')
    CartItem.objects.filter(student=student, course__in=courses).delete()
    return order


def _enroll(order):
    courses = []
    for item in order.items.select_related('course'):
        if not item.course:
            continue
        enrollment, created = TrainingEnrollment.objects.get_or_create(
            student=order.student, course=item.course, defaults={'status': TrainingEnrollment.ACTIVE})
        if not created and enrollment.status in (TrainingEnrollment.REQUESTED, TrainingEnrollment.CANCELLED):
            enrollment.status = TrainingEnrollment.ACTIVE
            enrollment.save(update_fields=['status', 'updated_at'])
        Wishlist.objects.filter(student=order.student, course=item.course).delete()
        courses.append(item.course)
    return courses


@transaction.atomic
def mark_paid(order, actor, reference=''):
    """The payment is confirmed: the courses unlock."""
    if order.status == Order.SUCCESSFUL:
        return order
    order.status, order.paid_at, order.decision_note = Order.SUCCESSFUL, timezone.now(), ''
    if actor is not None:
        order.verified_by = actor
    order.save()
    if order.total > 0:
        pending = order.transactions.filter(kind=Transaction.PAYMENT, status=Transaction.PENDING).first()
        if pending:
            pending.status = Transaction.SUCCESS
            pending.save(update_fields=['status'])
        elif not order.transactions.filter(kind=Transaction.PAYMENT, status=Transaction.SUCCESS).exists():
            Transaction.objects.create(order=order, provider=order.provider, amount=order.total, status=Transaction.SUCCESS,
                                       reference=reference or order.transaction_id)
    courses = _enroll(order)
    titles = ', '.join(c.title for c in courses)
    notify(order.student, 'enrollment', 'You’re enrolled!' if len(courses) == 1 else f'You’re enrolled on {len(courses)} courses',
           f'{titles}: every lesson is now open.', '/student/learning')
    for item in order.items.select_related('instructor', 'course'):
        if item.instructor:
            notify(item.instructor, 'purchase', f'New enrolment: {item.title}', f'{order.student.get_full_name() or "A student"} bought your course.',
                   f'/instructor/courses/{item.course.slug}/students' if item.course else '/instructor')
    if order.total > 0:
        transaction.on_commit(lambda: emails.send_order_paid(order))
    return order


@transaction.atomic
def mark_failed(order, actor, note=''):
    order.status, order.decision_note = Order.FAILED, note
    if actor is not None:
        order.verified_by = actor
    order.save()
    order.transactions.filter(kind=Transaction.PAYMENT, status=Transaction.PENDING).update(status=Transaction.FAILED)
    notify(order.student, 'payment', f'We couldn’t confirm the payment for {order.number}', note or 'Please check the details and send your receipt again.', f'/orders/{order.id}')
    transaction.on_commit(lambda: emails.send_order_failed(order))
    return order


def submit_receipt(order, method, transaction_id, receipt):
    """The student says they paid (manual provider): the order waits for an administrator."""
    if order.receipt:
        order.receipt.delete(save=False)
    order.method, order.transaction_id = method, transaction_id.strip()
    order.receipt, order.receipt_name = receipt, receipt.name[:200]
    order.status, order.submitted_at, order.decision_note = Order.PROCESSING, timezone.now(), ''
    order.save()
    Transaction.objects.create(order=order, provider=order.provider, amount=order.total, status=Transaction.PENDING,
                               reference=order.transaction_id, data={'method': method})
    notify_admins('payment', f'Payment to check: {order.number}', f'{order.student.get_full_name()} sent a receipt for {order.currency} {money(order.total)}.', '/admin/course-sales')
    transaction.on_commit(lambda: emails.notify_team_order(order))
    return order


def cancel(order):
    if order.status not in (Order.PENDING, Order.FAILED):
        raise OrderError('Only unpaid orders can be cancelled.')
    order.status = Order.CANCELLED
    order.save(update_fields=['status'])
    return order


@transaction.atomic
def refund(order, actor, reason=''):
    """Money back: the order is refunded and its courses are taken away again."""
    if order.status != Order.SUCCESSFUL:
        raise OrderError('Only paid orders can be refunded.')
    order.status, order.refunded_at, order.refund_reason = Order.REFUNDED, timezone.now(), reason
    order.save()
    if order.total > 0:
        Transaction.objects.create(order=order, provider=order.provider, kind=Transaction.REFUND, amount=order.total,
                                   status=Transaction.SUCCESS, data={'reason': reason, 'by': actor.pk if actor else None})
    course_ids = [i.course_id for i in order.items.all() if i.course_id]
    # Keep courses the student also has through another paid order
    still_paid = set(OrderItem.objects.filter(order__student=order.student, order__status=Order.SUCCESSFUL, course_id__in=course_ids)
                     .exclude(order=order).values_list('course_id', flat=True))
    TrainingEnrollment.objects.filter(student=order.student, course_id__in=set(course_ids) - still_paid).update(
        status=TrainingEnrollment.CANCELLED, updated_at=timezone.now())
    notify(order.student, 'refund', f'Order {order.number} refunded', reason or 'Your payment has been refunded.', f'/orders/{order.id}')
    return order
