"""
Emails for the "ADRAM applies for you" service: the student hears about each decision, and the team is
told when there is something to review. Delivery failures are logged, never raised.
"""
import logging

from django.conf import settings
from django.utils.html import escape

from accounts.emails import _frontend, _notify, _plain, _send, button, details, layout, notice, paragraph

logger = logging.getLogger(__name__)


def _money(amount):
    return f'NLe {amount:,.2f}' if amount is not None else '—'


def send_service_approved(service):
    app = service.application
    _notify(
        app.student, subject=f'Next steps for your {app.scholarship_name} application', label='Request approved', tone='success',
        title='ADRAM will apply for you',
        paragraphs=[
            f'Good news! We’ve reviewed your request and we’re ready to handle your {app.scholarship_name} application.',
            'Open your portal to read the guidelines and the terms and conditions, then continue to payment and upload your documents.',
        ],
        extra_html=details([('Scholarship', app.scholarship_name), ('Service fee', _money(service.amount)),
                            ('Payment reference', service.reference)]),
        extra_text=f'Service fee: {_money(service.amount)}\nPayment reference: {service.reference}',
        cta=('Read the guidelines', _frontend('/student/applications')),
    )


def send_service_declined(service):
    app = service.application
    note = service.decision_note
    _notify(
        app.student, subject=f'An update on your {app.scholarship_name} request', label='Request update', tone='warning',
        title='We can’t take on this application',
        paragraphs=[f'Thank you for asking ADRAM to apply for {app.scholarship_name}. Unfortunately we can’t handle this application for you.',
                    'You can still track it yourself in your portal, or contact us to talk about other options.'],
        extra_html=notice(escape(note), 'warning', 'Message from ADRAM') if note else '',
        extra_text=f'Message from ADRAM: {note}' if note else '',
        cta=('Contact our team', _frontend('/contact?subject=Scholarship%20consultation')),
    )


def send_payment_confirmed(service):
    app = service.application
    _notify(
        app.student, subject=f'Payment confirmed: {app.scholarship_name}', label='Payment confirmed', tone='success',
        title='Thank you, your payment is confirmed',
        paragraphs=[f'We’ve confirmed your payment of {_money(service.amount)} (reference {service.reference}).',
                    'Our team is now working on your application. Follow its progress and next steps in your portal.'],
        cta=('Open my portal', _frontend('/student/applications')),
    )


def send_payment_rejected(service):
    app = service.application
    note = service.decision_note
    _notify(
        app.student, subject=f'Action needed: your payment for {app.scholarship_name}', label='Action needed', tone='warning',
        title='We couldn’t confirm your payment',
        paragraphs=['We checked the payment receipt you uploaded but couldn’t match it to a payment.',
                    'Please check the details and upload your receipt again from your portal.'],
        extra_html=notice(escape(note), 'warning', 'Message from ADRAM') if note else '',
        extra_text=f'Message from ADRAM: {note}' if note else '',
        cta=('Upload again', _frontend(f'/student/applications/{app.pk}/apply')),
    )


def send_document_returned(document):
    app = document.application
    rows = [('Document', document.name), ('Reason', document.get_review_tag_display())]
    if document.review_note:
        rows.append(('What to change', document.review_note))
    _notify(
        app.student, subject=f'Please re-upload: {document.name}', label='Action needed', tone='warning',
        title='A document needs changing',
        paragraphs=[f'ADRAM reviewed the documents for your {app.scholarship_name} application and returned “{document.name}”.',
                    'Please fix it and upload it again from your portal so we can keep your application on schedule.'],
        extra_html=details(rows), extra_text='\n'.join(f'{k}: {v}' for k, v in rows),
        cta=('Re-upload the document', _frontend(f'/student/applications/{app.pk}/apply')),
    )


RESULT_EMAILS = {
    'submitted': ('Your application has been submitted', 'Application submitted', 'warning',
                  'Your application has been submitted. We’re now waiting for the scholarship result.'),
    'interview': ('Interview stage', 'Interview stage', 'warning',
                  'Your application has moved to the interview stage. We’re waiting for the scholarship result.'),
    'accepted': ('Congratulations! You have been awarded the scholarship', 'Scholarship awarded', 'success',
                 'Congratulations! You have successfully been awarded the scholarship.'),
    'unsuccessful': ('Your scholarship result', 'Scholarship result', 'danger',
                     'Sorry, you did not succeed in the scholarship this time.'),
}


def send_result_update(application):
    title, label, tone, lead = RESULT_EMAILS[application.stage]
    message = application.result_message
    rows = []
    if application.stage == 'interview' and application.interview_at:
        rows.append(('Interview', application.interview_at.strftime('%A %d %B %Y, %H:%M GMT')))
    if application.stage == 'interview' and application.interview_link:
        rows.append(('Interview link', application.interview_link))
    if application.stage in ('submitted', 'interview') and application.result_expected_on:
        rows.append(('Results expected', application.result_expected_on.strftime('%d %B %Y')))
    paragraphs = [f'An update on your {application.scholarship_name} application.', lead]
    if application.stage == 'accepted':
        paragraphs.append('Please contact ADRAM as soon as possible so we can help you with the next steps.')
    _notify(
        application.student, subject=f'{title}: {application.scholarship_name}', label=label, tone=tone, title=title,
        paragraphs=paragraphs,
        extra_html=(details(rows) if rows else '') + (notice(escape(message), tone, 'Message from ADRAM') if message else ''),
        extra_text='\n'.join([*(f'{k}: {v}' for k, v in rows), f'Message from ADRAM: {message}' if message else '']),
        cta=('Open my portal', _frontend('/student/applications')),
    )


def send_result_files_ready(application):
    _notify(
        application.student, subject=f'Your result documents: {application.scholarship_name}', label='New documents', tone='info',
        title='Your result documents are ready',
        paragraphs=[f'ADRAM has added documents about your {application.scholarship_name} result to your portal.',
                    'Sign in to view them.'],
        cta=('View my documents', _frontend(f'/student/applications/{application.pk}/apply')),
    )


def send_training_confirmed(enrollment):
    course = enrollment.course
    rows = [('Programme', course.title)]
    if enrollment.start_date:
        rows.append(('Starts', enrollment.start_date.strftime('%d %B %Y')))
    if enrollment.note:
        rows.append(('Message from ADRAM', enrollment.note))
    _notify(
        enrollment.student, subject=f'You’re enrolled: {course.title}', label='Training', tone='success',
        title='Your training enrollment is confirmed',
        paragraphs=[f'You’re now enrolled in {course.title} at ADRAM Technologies.',
                    'You’ll find the programme, start date and any updates in your portal under My training.'],
        extra_html=details(rows), extra_text='\n'.join(f'{k}: {v}' for k, v in rows),
        cta=('Open My training', _frontend('/student/training')),
    )


def notify_team_training(enrollment):
    try:
        student, course = enrollment.student, enrollment.course
        title = 'New training enrollment request'
        lead = f'{student.get_full_name()} wants to enroll in {course.title}.'
        rows = [('Student', student.get_full_name()), ('Email', student.email), ('Phone', student.phone_number), ('Programme', course.title)]
        review = _frontend(f'/admin/students/{student.pk}')
        reason = 'You received this email because you are an ADRAM portal administrator.'
        html = layout(preheader=lead, label='Action needed', tone='warning', title=title, reason=reason,
                      body=paragraph(escape(lead)) + details(rows) + button('Review in the portal', review))
        text = _plain(title, [lead, '\n'.join(f'{k}: {v or "—"}' for k, v in rows), f'Review: {review}'], reason)
        _send(settings.CONTACT_NOTIFY_EMAIL, f'Training request: {course.title} for {student.get_full_name()}', text, html)
    except Exception:
        logger.exception('Could not send training notification for enrollment %s', enrollment.pk)


def notify_team(service, event):
    """event: 'requested' (a student asked ADRAM to apply) or 'payment' (a receipt was uploaded)."""
    try:
        app = service.application
        student = app.student
        review = _frontend(f'/admin/students/{student.pk}')
        if event == 'requested':
            title, lead = 'New request: apply for a student', f'{student.get_full_name()} asked ADRAM to apply for {app.scholarship_name}.'
            rows = [('Student', student.get_full_name()), ('Email', student.email), ('Phone', student.phone_number),
                    ('Scholarship', app.scholarship_name)]
        else:
            title, lead = 'Payment receipt to check', f'{student.get_full_name()} uploaded a payment receipt for {app.scholarship_name}.'
            rows = [('Student', student.get_full_name()), ('Scholarship', app.scholarship_name), ('Amount', _money(service.amount)),
                    ('Method', service.get_payment_method_display()), ('Transaction ID', service.transaction_id),
                    ('Reference', service.reference)]
        reason = 'You received this email because you are an ADRAM portal administrator.'
        html = layout(preheader=lead, label='Action needed', tone='warning', title=title, reason=reason,
                      body=paragraph(escape(lead)) + details(rows) + button('Review in the portal', review))
        text = _plain(title, [lead, '\n'.join(f'{k}: {v or "—"}' for k, v in rows), f'Review: {review}'], reason)
        _send(settings.CONTACT_NOTIFY_EMAIL, f'Action needed: {title.split(":")[0]} for {student.get_full_name()}', text, html)
    except Exception:
        logger.exception('Could not send team notification (%s) for service %s', event, service.pk)


def _quote(body, limit=600):
    text = body if len(body) <= limit else f'{body[:limit].rstrip()}…'
    return escape(text).replace('\n', '<br>')


def send_new_message(message):
    """The ADRAM team replied: tell the person, in case they aren't signed in."""
    user = message.conversation.user
    sender = message.sender.first_name if message.sender else ''
    who = f'{sender} from the ADRAM team' if sender else 'The ADRAM team'
    _notify(
        user, subject='New message from ADRAM', label='Message', tone='info',
        title='You have a new message',
        paragraphs=[escape(f'{who} sent you a message in your ADRAM portal:')],
        extra_html=notice(_quote(message.preview)), extra_text=message.preview,
        cta=('Read and reply', _frontend('/messages')),
    )


def notify_team_message(message):
    """A user wrote to ADRAM (sent once per unread run, not for every message)."""
    try:
        user = message.conversation.user
        title = f'New message from {user.get_full_name()}'
        lead = f'{user.get_full_name()} ({user.email}) sent a message in the portal.'
        link = _frontend(f'/messages?user={user.pk}')
        reason = 'You received this email because you are an ADRAM portal administrator.'
        html = layout(preheader=message.preview[:120], label='Message', tone='info', title=title, reason=reason,
                      body=paragraph(escape(lead)) + notice(_quote(message.preview)) + button('Reply in the portal', link))
        text = _plain(title, [lead, message.preview, f'Reply: {link}'], reason)
        _send(settings.CONTACT_NOTIFY_EMAIL, title, text, html, reply_to=None)
    except Exception:
        logger.exception('Could not send the team a notification for message %s', message.pk)
