"""
Branded ADRAM emails: one-time codes, account decisions and contact-form messages.

Every email is sent as HTML with a plain-text alternative. The HTML uses tables and inline styles only,
because Gmail, Outlook and phone mail apps ignore most modern CSS.

Uses Django's email settings (see .env). Optional settings, all with sensible defaults:
  EMAIL_LOGO_URL    public URL of a logo image (e.g. https://yourdomain/brand/mark-192.png)
  COMPANY_PHONE, COMPANY_WHATSAPP, COMPANY_ADDRESS
"""
import logging
from datetime import date
from html import escape

from django.conf import settings
from django.core.mail import EmailMultiAlternatives

logger = logging.getLogger(__name__)

# ---------------------------------------------------------------- Brand

NAVY = '#06123d'
NAVY_2 = '#0b1f5c'
BLUE = '#1454e8'
CYAN = '#16c8f5'
INK = '#0e1630'
TEXT = '#3b4563'
MUTED = '#6b7591'
LINE = '#e4e9f4'
SOFT = '#f4f7fd'
FONT = "'Segoe UI', Roboto, Helvetica, Arial, sans-serif"

TONES = {  # notice boxes and the header pill
    'info': ('#eef3ff', '#1a4fd6', '#d5e1ff'),
    'success': ('#e7f7ef', '#0f7a55', '#bfe8d3'),
    'warning': ('#fff6e0', '#8a5a00', '#f5dfa6'),
    'danger': ('#fdecea', '#b42318', '#f6c9c4'),
}


def _setting(name, default):
    return getattr(settings, name, None) or default


def _company():
    return {
        'name': 'ADRAM Technologies',
        'tagline': 'Building Solutions for a Better Future',
        'email': settings.CONTACT_NOTIFY_EMAIL,
        'phone': _setting('COMPANY_PHONE', '+232 76 978 720'),
        'whatsapp': _setting('COMPANY_WHATSAPP', 'https://wa.me/23276978720'),
        'address': _setting('COMPANY_ADDRESS', 'Freetown, Sierra Leone'),
        'site': settings.FRONTEND_URL.rstrip('/'),
    }


def _frontend(path):
    return f"{settings.FRONTEND_URL.rstrip('/')}{path}"


# ---------------------------------------------------------------- Building blocks (HTML, inline styles)

def _logo():
    url = _setting('EMAIL_LOGO_URL', '')
    if url:
        return f'<img src="{escape(url)}" width="40" height="40" alt="ADRAM" style="display:block;border:0;border-radius:50%;">'
    # Text monogram so the header still looks right without a hosted image.
    return (
        f'<table role="presentation" cellpadding="0" cellspacing="0"><tr><td width="40" height="40" align="center" '
        f'style="width:40px;height:40px;border-radius:50%;background:{BLUE};color:#ffffff;font:700 20px {FONT};">A</td></tr></table>'
    )


def paragraph(text, size=15, color=TEXT, margin='0 0 16px'):
    return f'<p style="margin:{margin};font:{size}px/1.65 {FONT};color:{color};">{text}</p>'


def button(label, url):
    """A table-based button, which Outlook renders correctly."""
    return (
        '<table role="presentation" cellpadding="0" cellspacing="0" style="margin:26px 0 8px;"><tr>'
        f'<td bgcolor="{BLUE}" style="border-radius:8px;">'
        f'<a href="{escape(url)}" target="_blank" style="display:inline-block;padding:13px 26px;font:600 15px {FONT};'
        f'color:#ffffff;text-decoration:none;border-radius:8px;">{escape(label)} &rarr;</a>'
        '</td></tr></table>'
    )


def code_box(code, minutes):
    spaced = '&nbsp;'.join(escape(code))
    return (
        '<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:8px 0 22px;"><tr>'
        f'<td align="center" style="background:{SOFT};border:1px solid {LINE};border-radius:12px;padding:24px 16px;">'
        f'<div style="font:600 12px {FONT};letter-spacing:2px;text-transform:uppercase;color:{MUTED};margin-bottom:10px;">Your verification code</div>'
        f'<div style="font:700 36px \'Courier New\', Courier, monospace;letter-spacing:6px;color:{NAVY};">{spaced}</div>'
        f'<div style="font:13px {FONT};color:{MUTED};margin-top:10px;">Valid for {minutes} minutes &middot; single use</div>'
        '</td></tr></table>'
    )


def notice(text, tone='info', title=''):
    bg, fg, border = TONES[tone]
    heading = f'<div style="font:700 14px {FONT};color:{fg};margin-bottom:4px;">{escape(title)}</div>' if title else ''
    return (
        '<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:20px 0;"><tr>'
        f'<td style="background:{bg};border:1px solid {border};border-left:4px solid {fg};border-radius:8px;padding:14px 16px;">'
        f'{heading}<div style="font:14px/1.6 {FONT};color:{TEXT};">{text}</div>'
        '</td></tr></table>'
    )


def details(rows):
    """Two-column summary table: [(label, value), ...]. Values are escaped."""
    cells = ''.join(
        f'<tr><td style="padding:10px 14px;border-bottom:1px solid {LINE};font:600 13px {FONT};color:{MUTED};width:34%;vertical-align:top;">{escape(label)}</td>'
        f'<td style="padding:10px 14px;border-bottom:1px solid {LINE};font:14px/1.5 {FONT};color:{INK};">{escape(str(value or "—"))}</td></tr>'
        for label, value in rows
    )
    return (
        f'<table role="presentation" width="100%" cellpadding="0" cellspacing="0" '
        f'style="margin:6px 0 20px;border:1px solid {LINE};border-radius:10px;border-collapse:separate;overflow:hidden;">{cells}</table>'
    )


def quote(text):
    safe = escape(text).replace('\n', '<br>')
    return (
        f'<div style="margin:6px 0 20px;padding:14px 16px;background:{SOFT};border-left:3px solid {CYAN};'
        f'border-radius:6px;font:14px/1.65 {FONT};color:{TEXT};">{safe}</div>'
    )


def layout(*, preheader, label, tone, title, body, reason):
    """
    The frame every email uses.
      preheader: inbox preview text (hidden in the email body)
      label/tone: the small pill above the title, e.g. ("Sign-in code", "info")
      reason: footer line explaining why the person received the email
    """
    c = _company()
    pill_bg, pill_fg, _ = TONES[tone]
    year = date.today().year
    return f"""<!doctype html>
<html lang="en"><head>
<meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="color-scheme" content="light"><meta name="supported-color-schemes" content="light">
<title>{escape(title)}</title>
</head>
<body style="margin:0;padding:0;background:#eef1f7;-webkit-text-size-adjust:100%;">
<div style="display:none;max-height:0;overflow:hidden;opacity:0;color:transparent;">{escape(preheader)}&#847;&zwnj;&nbsp;&#847;&zwnj;&nbsp;&#847;&zwnj;&nbsp;</div>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" bgcolor="#eef1f7" style="background:#eef1f7;">
<tr><td align="center" style="padding:32px 12px;">

  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:600px;">
    <!-- Brand header -->
    <tr><td style="padding:0 4px 16px;">
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr>
        <td width="48" valign="middle">{_logo()}</td>
        <td valign="middle" style="padding-left:10px;">
          <div style="font:800 18px {FONT};color:{NAVY};letter-spacing:1px;">ADRAM</div>
          <div style="font:600 10px {FONT};color:{MUTED};letter-spacing:3px;">TECHNOLOGIES</div>
        </td>
        <td align="right" valign="middle" style="font:13px {FONT};">
          <a href="{escape(c['site'])}" style="color:{BLUE};text-decoration:none;">Visit website</a>
        </td>
      </tr></table>
    </td></tr>

    <!-- Card -->
    <tr><td bgcolor="#ffffff" style="background:#ffffff;border-radius:14px;border:1px solid {LINE};overflow:hidden;">
      <div style="height:5px;line-height:5px;font-size:0;background:{BLUE};background-image:linear-gradient(90deg,{BLUE},{CYAN});">&nbsp;</div>
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr><td style="padding:34px 36px 30px;">
        <span style="display:inline-block;padding:5px 12px;border-radius:999px;background:{pill_bg};color:{pill_fg};font:700 12px {FONT};letter-spacing:.3px;">{escape(label)}</span>
        <h1 style="margin:16px 0 18px;font:700 24px/1.3 {FONT};color:{INK};">{escape(title)}</h1>
        {body}
        <p style="margin:26px 0 0;font:15px/1.6 {FONT};color:{TEXT};">Kind regards,<br><strong style="color:{INK};">The ADRAM Technologies Team</strong></p>
      </td></tr></table>

      <!-- Help strip -->
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr>
        <td style="background:{SOFT};border-top:1px solid {LINE};padding:18px 36px;font:13px/1.7 {FONT};color:{MUTED};">
          <strong style="color:{INK};">Need help?</strong> We’re here Monday to Friday, 9:00 AM to 6:00 PM.<br>
          <a href="tel:{escape(c['phone'].replace(' ', ''))}" style="color:{BLUE};text-decoration:none;">{escape(c['phone'])}</a>
          &nbsp;&middot;&nbsp; <a href="{escape(c['whatsapp'])}" style="color:{BLUE};text-decoration:none;">WhatsApp</a>
          &nbsp;&middot;&nbsp; <a href="mailto:{escape(c['email'])}" style="color:{BLUE};text-decoration:none;">{escape(c['email'])}</a>
        </td>
      </tr></table>
    </td></tr>

    <!-- Footer -->
    <tr><td style="padding:24px 12px 8px;" align="center">
      <div style="font:700 13px {FONT};color:{NAVY};">{escape(c['name'])}</div>
      <div style="font:12px/1.7 {FONT};color:{MUTED};">{escape(c['tagline'])} &middot; {escape(c['address'])}</div>
      <div style="font:12px/1.7 {FONT};color:{MUTED};margin-top:10px;">{escape(reason)}</div>
      <div style="font:12px/1.7 {FONT};color:#9aa3b8;margin-top:6px;">&copy; {year} {escape(c['name'])}. All rights reserved.</div>
    </td></tr>
  </table>

</td></tr>
</table>
</body></html>"""


def _plain(title, lines, reason):
    c = _company()
    body = '\n\n'.join(line for line in lines if line)
    return (
        f'{title}\n{"=" * len(title)}\n\n{body}\n\nKind regards,\nThe ADRAM Technologies Team\n\n'
        f'---\nNeed help? {c["phone"]} | WhatsApp: {c["whatsapp"]} | {c["email"]}\n'
        f'{c["name"]} · {c["address"]}\n{reason}\n'
    )


def _send(to, subject, text, html, reply_to=None):
    message = EmailMultiAlternatives(subject, text, settings.DEFAULT_FROM_EMAIL, [to], reply_to=reply_to)
    message.attach_alternative(html, 'text/html')
    message.send(fail_silently=False)


def _greeting(user):
    return f'Hello {user.first_name},' if getattr(user, 'first_name', '') else 'Hello,'


# ---------------------------------------------------------------- One-time codes

# label for the pill, title, "use this code ..." wording, subject ("123456 is your ADRAM ...")
OTP_COPY = {
    'REGISTER': ('Email verification', 'Verify your email address', 'to confirm your email address and finish creating your ADRAM account', 'verification code'),
    'LOGIN': ('Sign-in code', 'Your sign-in code', 'to finish signing in to your ADRAM account', 'sign-in code'),
    'PASSWORD_RESET': ('Password reset', 'Reset your password', 'to reset the password for your ADRAM account', 'password reset code'),
}


def send_otp_email(user, code, purpose, minutes):
    """Raises on delivery failure so the API can tell the user the code wasn't sent."""
    label, title, use_for, subject_label = OTP_COPY[purpose]
    reason = f'You received this email because a {subject_label} was requested for {user.email}.'
    security = (
        'Never share this code with anyone, including ADRAM staff. We will never ask you for it by phone, '
        'WhatsApp or email. If you didn’t request it, you can safely ignore this email; your account stays secure.'
    )
    html = layout(
        preheader=f'{code} is your code {use_for}. It expires in {minutes} minutes.',
        label=label, tone='info', title=title, reason=reason,
        body=paragraph(escape(_greeting(user))) + paragraph(f'Use the code below {escape(use_for)}.')
        + code_box(code, minutes) + notice(security, 'warning', 'Keep this code private'),
    )
    text = _plain(title, [
        _greeting(user),
        f'Use this code {use_for}:',
        f'    {code}',
        f'The code is valid for {minutes} minutes and can only be used once.',
        security,
    ], reason)
    _send(user.email, f'{code} is your ADRAM {subject_label}', text, html)


# ---------------------------------------------------------------- Account decisions

def _notify(user, *, subject, label, tone, title, paragraphs, extra_html='', extra_text='', cta=None, preheader=''):
    """Account status emails are informative: a delivery failure is logged, not raised."""
    try:
        reason = f'You received this email because it concerns your ADRAM account ({user.email}).'
        html = layout(
            preheader=preheader or paragraphs[0], label=label, tone=tone, title=title, reason=reason,
            body=paragraph(escape(_greeting(user))) + ''.join(paragraph(p) for p in paragraphs)
            + extra_html + (button(*cta) if cta else ''),
        )
        text = _plain(title, [_greeting(user), *paragraphs, extra_text, f'{cta[0]}: {cta[1]}' if cta else ''], reason)
        _send(user.email, subject, text, html)
    except Exception:
        logger.exception('Could not send "%s" email to %s', subject, user.email)


def send_approved_email(user):
    _notify(
        user, subject='Your ADRAM account has been approved', label='Account approved', tone='success',
        title='Welcome aboard, your account is approved',
        paragraphs=[
            'Good news! An administrator has reviewed and approved your ADRAM account.',
            'You can now sign in to the portal to explore scholarships, follow your training and stay in touch with our team.',
        ],
        extra_html=notice('For your security, each sign-in is confirmed with a one-time code sent to this email address.', 'info'),
        cta=('Sign in to your account', _frontend('/login')),
    )


def send_rejected_email(user, reason=''):
    extra_html = notice(escape(reason), 'danger', 'Reason given') if reason else ''
    _notify(
        user, subject='An update on your ADRAM account request', label='Account update', tone='danger',
        title='We couldn’t approve your account',
        paragraphs=[
            'Thank you for your interest in ADRAM Technologies. After reviewing your account request, we are unable to approve it at this time.',
            'If you believe this is a mistake or would like to provide more information, please get in touch and we’ll be glad to help.',
        ],
        extra_html=extra_html, extra_text=f'Reason given: {reason}' if reason else '',
        cta=('Contact our team', _frontend('/contact?subject=Account%20request')),
    )


def send_suspended_email(user):
    _notify(
        user, subject='Your ADRAM account has been disabled', label='Account disabled', tone='warning',
        title='Your account has been disabled',
        paragraphs=[
            'An administrator has disabled your ADRAM account, and you have been signed out on all devices.',
            'If you have any questions about this, please contact our team.',
        ],
        cta=('Contact our team', _frontend('/contact?subject=Account%20disabled')),
    )


def send_reactivated_email(user):
    _notify(
        user, subject='Your ADRAM account has been enabled', label='Account enabled', tone='success',
        title='Your account has been enabled',
        paragraphs=['An administrator has enabled your ADRAM account again. You can sign in whenever you’re ready.'],
        cta=('Sign in to your account', _frontend('/login')),
    )


def notify_admins_new_account(user):
    """Tell the team a new account is waiting for approval."""
    try:
        review = _frontend('/admin/users?status=pending')
        rows = [
            ('Name', user.get_full_name()), ('Email', user.email), ('Phone', user.phone_number),
            ('Country', user.country), ('Role requested', user.get_role_display()),
            ('Registered', user.created_at.strftime('%d %b %Y, %H:%M UTC') if user.created_at else ''),
        ]
        title = 'New account awaiting approval'
        reason = 'You received this email because you are an ADRAM portal administrator.'
        html = layout(
            preheader=f'{user.get_full_name()} verified their email and is waiting for approval.',
            label='Action needed', tone='warning', title=title, reason=reason,
            body=paragraph('A new user has verified their email address and is waiting for an administrator to review their account.')
            + details(rows) + button('Review in the admin dashboard', review),
        )
        text = _plain(title, ['A new user is waiting for approval.', '\n'.join(f'{k}: {v or "—"}' for k, v in rows), f'Review: {review}'], reason)
        _send(settings.CONTACT_NOTIFY_EMAIL, f'Action needed: {user.get_full_name()} is awaiting approval', text, html)
    except Exception:
        logger.exception('Could not send new-account notification for %s', user.email)


# ---------------------------------------------------------------- Contact form

def send_contact_notification(message):
    """To the team: a new enquiry from the website. Replying goes straight to the sender."""
    rows = [('Name', message.name), ('Email', message.email), ('Subject', message.subject),
            ('Received', message.created_at.strftime('%d %b %Y, %H:%M UTC'))]
    title = 'New enquiry from the website'
    reason = 'You received this email because the ADRAM website contact form was submitted.'
    html = layout(
        preheader=f'{message.name}: {message.subject}', label='New enquiry', tone='info', title=title, reason=reason,
        body=paragraph('Someone has sent a message through the contact form. Reply to this email to answer them directly.')
        + details(rows) + paragraph('<strong>Message</strong>', 14, INK, '0 0 6px') + quote(message.message)
        + button('Open the admin inbox', _frontend(f'/admin/messages?open={message.pk}')),
    )
    text = _plain(title, ['\n'.join(f'{k}: {v}' for k, v in rows), f'Message:\n{message.message}'], reason)
    _send(settings.CONTACT_NOTIFY_EMAIL, f'New enquiry: {message.subject}', text, html, reply_to=[message.email])


def send_contact_confirmation(message):
    """To the sender: we received your message."""
    title = 'Thanks for getting in touch'
    reason = f'You received this email because you contacted ADRAM Technologies using {message.email}.'
    first = message.name.split(' ')[0]
    html = layout(
        preheader='We’ve received your message and will reply within one working day.',
        label='Message received', tone='success', title=title, reason=reason,
        body=paragraph(f'Hello {escape(first)},')
        + paragraph('Thank you for contacting ADRAM Technologies. We’ve received your message and a member of our team will reply within one working day.')
        + details([('Subject', message.subject)]) + quote(message.message)
        + paragraph('For anything urgent, call us or send us a WhatsApp message using the details below.', 14, MUTED),
    )
    text = _plain(title, [f'Hello {first},', 'Thank you for contacting ADRAM Technologies. We’ve received your message and will reply within one working day.',
                          f'Subject: {message.subject}', f'Your message:\n{message.message}'], reason)
    _send(message.email, 'We received your message – ADRAM Technologies', text, html)
