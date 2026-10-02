"""
The rules of buying courses: pricing a cart (sale prices, coupons), placing an order, and what happens when it is
paid, fails, is cancelled or refunded. Views call these; payment providers report results through mark_paid/mark_failed.
"""
from decimal import ROUND_HALF_UP, Decimal

from django.db import transaction
from django.utils import timezone

from portal.models import TrainingEnrollment

from . import emails
from .models import CartItem, Coupon, Gift, LmsSettings, Order, OrderItem, PremiumEnrollment, Transaction, Wishlist
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
    """Has the course for good (a place taken only through Premium doesn't count: they may still buy it)."""
    return TrainingEnrollment.objects.filter(
        student=student, course=course, status__in=[TrainingEnrollment.ACTIVE, TrainingEnrollment.COMPLETED],
        premium__isnull=True).exists()


def purchase_problem(student, course, gift=False):
    """Why this student can't buy this course (for themselves, or as a gift), or None."""
    if not course.is_published:
        return 'This course is not available.'
    if gift:
        return None  # anyone can give a course, even one they own or teach
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


def bundle_price(bundle, courses):
    """What `courses` (some or all of the bundle's) cost bought as the bundle: its price, less the share of courses left out."""
    every = list(bundle.courses.all())
    full = sum((Decimal(c.sale_price or 0) for c in every), ZERO)
    wanted = sum((Decimal(c.sale_price or 0) for c in courses), ZERO)
    if not full:
        return ZERO
    return min(Decimal(bundle.price), (Decimal(bundle.price) * wanted / full).quantize(CENT, ROUND_HALF_UP))


def quote(student, courses, code='', bundle=None):
    """
    Prices a list of courses: {lines: [{course, list_price, price, discount, amount}], subtotal, discount, total,
    coupon, coupon_error}. The coupon's discount is shared across the courses it applies to, in proportion to price.
    Bought as a `bundle`, the courses share the bundle's price (in proportion to their own) and coupons don't apply.
    """
    lines = [{'course': c, 'list_price': Decimal(c.price or 0), 'price': Decimal(c.sale_price or 0), 'discount': ZERO} for c in courses]
    if bundle is not None:
        own = sum((line['price'] for line in lines), ZERO)
        target, left = bundle_price(bundle, courses), bundle_price(bundle, courses)
        for i, line in enumerate(lines):
            share = left if i == len(lines) - 1 else (target * line['price'] / own).quantize(CENT, ROUND_HALF_UP) if own else ZERO
            line['price'], left = min(share, left), left - min(share, left)
    subtotal = sum((line['price'] for line in lines), ZERO)
    coupon, error = None, ''
    if bundle is not None and (code or '').strip():
        error = 'Coupons can’t be used on bundles: the bundle price is already discounted.'
    elif (code or '').strip():
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
def place_order(student, courses, code='', bundle=None, gift=None, affiliate=''):
    """
    Creates an order for these courses. A free total is paid at once. Raises OrderError.
    `bundle`: bought as that bundle. `gift`: {name, email, message}: bought for someone else, who redeems it once paid.
    `affiliate`: the code of the partner whose link brought the student (they earn a commission once it is paid).
    """
    from . import payments
    if not courses:
        raise OrderError('Your cart is empty.')
    for course in courses:
        problem = purchase_problem(student, course, gift=bool(gift))
        if problem:
            raise OrderError(f'{course.title}: {problem}')
    q = quote(student, courses, code, bundle)
    if q['coupon_error']:
        raise OrderError(q['coupon_error'], 'coupon')
    if gift and q['total'] <= 0:
        raise OrderError('Free courses can’t be given as gifts: share the course link instead.')

    if not gift:  # an unpaid order for the same courses is replaced by this one
        stale = Order.objects.filter(student=student, status__in=[Order.PENDING, Order.FAILED], is_gift=False,
                                     items__course__in=courses).distinct()
        for old in stale:
            old.status = Order.CANCELLED
            old.save(update_fields=['status'])

    free = q['total'] <= 0
    provider = payments.get('free') if free else payments.default_provider()
    partner = affiliate_for(affiliate, student) if q['total'] > 0 else None
    commission = (q['total'] * partner.commission_percent / 100).quantize(CENT, ROUND_HALF_UP) if partner else ZERO
    order = Order.objects.create(student=student, subtotal=q['subtotal'], discount=q['discount'], total=q['total'],
                                 coupon=q['coupon'], provider=provider.key, bundle=bundle, is_gift=bool(gift),
                                 affiliate=partner, affiliate_commission=commission)
    if gift:
        Gift.objects.create(order=order, recipient_name=gift['name'][:120], recipient_email=gift['email'], message=gift.get('message', '')[:1000])
    for line in q['lines']:
        course = line['course']
        percent = commission_for(course)
        share = (line['amount'] * (100 - percent) / 100).quantize(CENT, ROUND_HALF_UP)
        OrderItem.objects.create(order=order, course=course, title=course.title, instructor_id=course.instructor_id,
                                 price=line['price'], discount=line['discount'], amount=line['amount'],
                                 commission_percent=percent, instructor_share=share)
    if free:
        mark_paid(order, None)
    else:
        provider.start(order)
        unlock = 'to send your gift' if gift else 'to unlock your courses'
        notify(student, 'purchase', f'Order {order.number} placed', f'Pay {order.currency} {money(order.total)} {unlock}.', f'/orders/{order.id}')
    if not gift:
        CartItem.objects.filter(student=student, course__in=courses).delete()
    return order


def commission_for(course):
    """The platform's share of a sale (%). Courses ADRAM teaches itself (no instructor account) earn the platform everything."""
    return LmsSettings.load().commission_percent if course.instructor_id else Decimal('100')


def affiliate_for(code, student):
    """The approved partner behind this code, unless it is the student's own (or affiliates are switched off)."""
    from .models import Affiliate
    code = str(code or '').strip().upper()
    if not code or not LmsSettings.load().affiliates_enabled:
        return None
    partner = Affiliate.objects.filter(code=code, status=Affiliate.APPROVED).first()
    return partner if partner and partner.user_id != student.id else None


def enroll_in(student, courses):
    """Opens these courses to the student (bought, or redeemed as a gift)."""
    for course in courses:
        enrollment, created = TrainingEnrollment.objects.get_or_create(
            student=student, course=course, defaults={'status': TrainingEnrollment.ACTIVE})
        if not created and enrollment.status in (TrainingEnrollment.REQUESTED, TrainingEnrollment.CANCELLED, TrainingEnrollment.DECLINED):
            enrollment.status = TrainingEnrollment.ACTIVE
            enrollment.save(update_fields=['status', 'updated_at'])
        Wishlist.objects.filter(student=student, course=course).delete()
        CartItem.objects.filter(student=student, course=course).delete()
        PremiumEnrollment.objects.filter(enrollment=enrollment).delete()  # owned now, not just through Premium


def send_gift(order):
    """The gift is paid: tell the recipient (email, and in-app if they have an account) and the buyer."""
    from accounts.models import User
    gift = order.gift
    gift.sent_at = timezone.now()
    gift.save(update_fields=['sent_at'])
    recipient = User.objects.filter(email__iexact=gift.recipient_email, is_active=True).first()
    sender = order.student.get_full_name() or 'Someone'
    if recipient:
        notify(recipient, 'purchase', f'{sender} sent you a course', ', '.join(i.title for i in order.items.all()), f'/gift/{gift.code}')
    notify(order.student, 'purchase', f'Your gift to {gift.recipient_name} is on its way',
           f'We emailed {gift.recipient_email} a link to start learning. Gift code: {gift.code}', f'/orders/{order.id}')
    transaction.on_commit(lambda: emails.send_gift(gift))


def _enroll(order):
    courses = [item.course for item in order.items.select_related('course') if item.course]
    enroll_in(order.student, courses)
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
    from .premium import on_paid
    from .referrals import reward
    reward(order)  # a referred student's first purchase rewards the friend who invited them
    on_paid(order)  # starts Premium, or moves a payment plan on
    if order.plan_id or (order.instalment_number or 1) > 1:
        pass  # Premium, or a later part of a course already open: no "you're enrolled"
    elif order.is_gift:
        send_gift(order)
    else:
        courses = _enroll(order)
        titles = ', '.join(c.title for c in courses)
        notify(order.student, 'enrollment', 'You’re enrolled!' if len(courses) == 1 else f'You’re enrolled on {len(courses)} courses',
               f'{titles}: every lesson is now open.', '/student/learning')
    for item in order.items.select_related('instructor', 'course'):
        if item.instructor:
            notify(item.instructor, 'purchase', f'New enrolment: {item.title}', f'{order.student.get_full_name() or "A student"} bought your course.',
                   f'/instructor/courses/{item.course.slug}/students' if item.course else '/instructor')
    if order.total > 0 and not order.is_gift and not order.plan_id:
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


def submit_receipt(order, method, transaction_id, receipt, payer=''):
    """The student says they paid (manual provider): the order waits for an administrator."""
    if order.receipt:
        order.receipt.delete(save=False)
    order.method, order.transaction_id, order.payer = method, transaction_id.strip(), (payer or '').strip()[:100]
    order.receipt, order.receipt_name = receipt, receipt.name[:200]
    order.status, order.submitted_at, order.decision_note = Order.PROCESSING, timezone.now(), ''
    order.save()
    Transaction.objects.create(order=order, provider=order.provider, amount=order.total, status=Transaction.PENDING,
                               reference=order.transaction_id, data={'method': method, 'payer': order.payer})
    notify_admins('payment', f'Payment to check: {order.number}', f'{order.student.get_full_name()} sent a receipt for {order.currency} {money(order.total)}.', '/admin/course-sales')
    transaction.on_commit(lambda: emails.notify_team_order(order))
    return order


def cancel(order):
    if order.status not in (Order.PENDING, Order.FAILED):
        raise OrderError('Only unpaid orders can be cancelled.')
    if (order.instalment_number or 1) > 1:
        raise OrderError('This is a part of a payment plan: pay it to keep the course open.')
    if order.instalment_plan_id:
        from .models import InstalmentPlan
        InstalmentPlan.objects.filter(pk=order.instalment_plan_id).update(status=InstalmentPlan.CANCELLED)
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
    from .premium import on_refund
    on_refund(order)
    course_ids = [i.course_id for i in order.items.all() if i.course_id]
    learner = order.student
    if order.is_gift:  # the courses go back from whoever redeemed the gift
        gift = order.gift
        gift.revoked_at = timezone.now()
        gift.save(update_fields=['revoked_at'])
        learner = gift.redeemed_by
    if learner is not None:
        still = kept_courses(learner, course_ids, exclude=order)
        TrainingEnrollment.objects.filter(student=learner, course_id__in=set(course_ids) - still).update(
            status=TrainingEnrollment.CANCELLED, updated_at=timezone.now())
    notify(order.student, 'refund', f'Order {order.number} refunded', reason or 'Your payment has been refunded.', f'/orders/{order.id}')
    return order


def kept_courses(student, course_ids, exclude=None):
    """Of these courses, the ones the student still has through another paid order or a redeemed gift."""
    bought = OrderItem.objects.filter(order__student=student, order__status=Order.SUCCESSFUL, order__is_gift=False, course_id__in=course_ids)
    given = OrderItem.objects.filter(order__gift__redeemed_by=student, order__status=Order.SUCCESSFUL, course_id__in=course_ids)
    if exclude is not None:
        bought, given = bought.exclude(order=exclude), given.exclude(order=exclude)
        if exclude.instalment_plan_id:  # the other parts of a refunded payment plan don't keep the course
            bought = bought.exclude(order__instalment_plan_id=exclude.instalment_plan_id)
    return set(bought.values_list('course_id', flat=True)) | set(given.values_list('course_id', flat=True))
