"""Emails for paid courses (a payment to check, confirmed or not) and for the community features. Never raise."""
import logging

from django.conf import settings
from django.utils.html import escape

from accounts.emails import _frontend, _notify, _plain, _send, button, details, layout, notice, paragraph

logger = logging.getLogger(__name__)


def money(amount):
    return f'NLe {amount:,.2f}' if amount is not None else '—'


def _team(subject, title, lead, rows, link_path, link_label):
    reason = 'You received this email because you are an ADRAM portal administrator.'
    link = _frontend(link_path)
    html = layout(preheader=lead, label='Action needed', tone='warning', title=title, reason=reason,
                  body=paragraph(escape(lead)) + (details(rows) if rows else '') + button(link_label, link))
    text = _plain(title, [lead, '\n'.join(f'{k}: {v or "—"}' for k, v in rows), f'Open: {link}'], reason)
    _send(settings.CONTACT_NOTIFY_EMAIL, subject, text, html)


def _titles(order):
    return ', '.join(i.title for i in order.items.all())


def notify_team_order(order):
    """A student uploaded a receipt for an order."""
    try:
        student = order.student
        _team(f'Course payment to check: {order.number}', 'Course payment receipt to check',
              f'{student.get_full_name()} uploaded a payment receipt for {_titles(order)}.',
              [('Student', student.get_full_name()), ('Courses', _titles(order)), ('Amount', money(order.total)),
               ('Method', order.method.replace('_', ' ').title()), ('Transaction ID', order.transaction_id), ('Order', order.number)],
              '/admin/course-sales', 'Review the payment')
    except Exception:
        logger.exception('Could not send the order notification for order %s', order.pk)


def send_order_paid(order):
    try:
        _notify(
            order.student, subject=f'Payment confirmed: order {order.number}', label='Payment confirmed', tone='success',
            title='You’re in! Your payment is confirmed',
            paragraphs=[f'We’ve confirmed your payment of {money(order.total)} (order {order.number}).',
                        f'Every lesson of {_titles(order)} is now open.'],
            cta=('Start learning', _frontend('/student/learning')),
        )
    except Exception:
        logger.exception('Could not send the payment confirmation for order %s', order.pk)


def send_order_failed(order):
    try:
        note = order.decision_note
        _notify(
            order.student, subject=f'Action needed: your payment for order {order.number}', label='Action needed', tone='warning',
            title='We couldn’t confirm your payment',
            paragraphs=['We checked the receipt you uploaded but couldn’t match it to a payment.',
                        'Please check the details and upload your receipt again.'],
            extra_html=notice(escape(note), 'warning', 'Message from ADRAM') if note else '',
            extra_text=f'Message from ADRAM: {note}' if note else '',
            cta=('Open the order', _frontend(f'/orders/{order.id}')),
        )
    except Exception:
        logger.exception('Could not send the payment rejection for order %s', order.pk)


def notify_team_question(thread):
    try:
        _team(f'New question on {thread.course.title}', 'A student asked a question',
              f'{thread.author.get_full_name() or thread.author.email} asked a question in {thread.course.title}.',
              [('Question', thread.title), ('Course', thread.course.title)],
              f'/admin/courses/{thread.course.slug}/content?tab=qa', 'Answer it')
    except Exception:
        logger.exception('Could not send the question notification for thread %s', thread.pk)


def send_answer(reply):
    """ADRAM answered a student's question."""
    try:
        thread = reply.thread
        preview = reply.body if len(reply.body) <= 500 else f'{reply.body[:500].rstrip()}…'
        _notify(
            thread.author, subject=f'An answer to your question in {thread.course.title}', label='New answer', tone='info',
            title='Your question has an answer',
            paragraphs=[escape(f'Your question “{thread.title}” in {thread.course.title} was answered:')],
            extra_html=notice(escape(preview).replace('\n', '<br>')), extra_text=preview,
            cta=('Read the answer', _frontend(f'/learn/{thread.course.slug}/lesson/{thread.lesson_id}' if thread.lesson_id else f'/courses/{thread.course.slug}')),
        )
    except Exception:
        logger.exception('Could not send the answer notification for reply %s', reply.pk)


def send_announcement(announcement, student):
    try:
        course = announcement.course
        preview = announcement.body if len(announcement.body) <= 700 else f'{announcement.body[:700].rstrip()}…'
        _notify(
            student, subject=f'{course.title}: {announcement.title}', label='Announcement', tone='info',
            title=announcement.title,
            paragraphs=[escape(f'A new announcement from your instructor in {course.title}:')],
            extra_html=notice(escape(preview).replace('\n', '<br>')), extra_text=preview,
            cta=('Open the course', _frontend(f'/courses/{course.slug}')),
        )
    except Exception:
        logger.exception('Could not send announcement %s to student %s', announcement.pk, student.pk)


def send_gift(gift):
    """To the person a course was bought for: who sent it, their message, and the link to start."""
    from types import SimpleNamespace
    order = gift.order
    sender = order.student.get_full_name() or 'Someone'
    recipient = SimpleNamespace(email=gift.recipient_email, first_name=gift.recipient_name.split(' ')[0])
    message = gift.message.strip()
    try:
        _notify(
            recipient, subject=f'{sender} sent you a course on ADRAM', label='A gift for you', tone='success',
            title=f'{sender} gave you {_titles(order)}',
            paragraphs=[f'{escape(sender)} bought you {"these courses" if order.items.count() > 1 else "a course"} on ADRAM: {escape(_titles(order))}.',
                        'Open the link to start learning. If you don’t have an ADRAM account yet, you can create one for free.',
                        f'Your gift code is {gift.code}.'],
            extra_html=notice(escape(message), 'info', f'Message from {escape(sender)}') if message else '',
            extra_text=f'Message from {sender}: {message}' if message else '',
            cta=('Open your gift', _frontend(f'/gift/{gift.code}')),
        )
    except Exception:
        logger.exception('Could not send gift %s', gift.pk)
