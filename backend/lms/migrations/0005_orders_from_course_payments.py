from django.db import migrations

STATUS = {'pending': 'pending', 'submitted': 'processing', 'confirmed': 'successful', 'rejected': 'failed'}


def forwards(apps, schema_editor):
    """Coupons move to the many-courses field, and each course payment becomes an order of one course (same reference)."""
    Coupon = apps.get_model('lms', 'Coupon')
    for coupon in Coupon.objects.exclude(course=None):
        coupon.courses.add(coupon.course_id)

    CoursePayment = apps.get_model('lms', 'CoursePayment')
    Order = apps.get_model('lms', 'Order')
    OrderItem = apps.get_model('lms', 'OrderItem')
    Transaction = apps.get_model('lms', 'Transaction')
    for payment in CoursePayment.objects.select_related('enrollment__course').order_by('pk'):
        course = payment.enrollment.course
        status = STATUS.get(payment.status, 'pending')
        order = Order.objects.create(
            number=f'CRS-{payment.pk:05d}', student_id=payment.enrollment.student_id, status=status,
            subtotal=payment.price, discount=payment.discount, total=payment.amount, coupon_id=payment.coupon_id,
            provider='free' if payment.amount <= 0 else 'manual', method=payment.method, transaction_id=payment.transaction_id,
            receipt=payment.receipt.name if payment.receipt else '', receipt_name=payment.receipt_name,
            decision_note=payment.decision_note, submitted_at=payment.submitted_at,
            paid_at=payment.verified_at if status == 'successful' else None, verified_by_id=payment.verified_by_id,
        )
        Order.objects.filter(pk=order.pk).update(created_at=payment.created_at)
        OrderItem.objects.create(order=order, course=course, title=course.title, instructor_id=course.instructor_id,
                                 price=payment.price, discount=payment.discount, amount=payment.amount)
        if payment.submitted_at:
            Transaction.objects.create(order=order, provider=order.provider, amount=payment.amount,
                                       status={'successful': 'success', 'failed': 'failed'}.get(status, 'pending'),
                                       reference=payment.transaction_id, data={'method': payment.method})


class Migration(migrations.Migration):
    dependencies = [('lms', '0004_lmssettings_certificate_revoke_reason_and_more'), ('catalog', '0009_course_status_from_published')]
    operations = [migrations.RunPython(forwards, migrations.RunPython.noop)]
