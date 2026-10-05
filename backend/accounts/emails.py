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
# A plain, transactional look (like the receipts and codes big companies send): white panel, one accent colour,
# neutral greys, no coloured strips or pills. The accent follows the website colour scheme the admin chose.

BLUE = '#1454e8'      # ADRAM blue, used when no other main colour is set
NAVY = '#06123d'
CYAN = '#16c8f5'
INK = '#1a1f36'       # headings and values
TEXT = '#414552'      # body text
MUTED = '#687385'     # labels, footer
FAINT = '#8792a2'
LINE = '#e3e8ee'      # hairlines
SOFT = '#f6f8fa'      # page background and grey panels
FONT = "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Helvetica, Arial, sans-serif"
MONO = "'SFMono-Regular', Menlo, Consolas, 'Liberation Mono', 'Courier New', monospace"

TONES = {  # notice titles only; panels stay neutral grey
    'info': INK,
    'success': '#0e6245',
    'warning': '#8a4b00',
    'danger': '#a41c1c',
}


def _accent():
    """The website's main colour (Site content → Colours), so emails match the site. Falls back to ADRAM blue."""
    try:
        from cms.models import PageContent
        data = PageContent.objects.filter(slug='site').values_list('data', flat=True).first() or {}
        colour = (data.get('theme') or {}).get('primary', '')
        if isinstance(colour, str) and len(colour) == 7 and colour.startswith('#'):
            int(colour[1:], 16)
            return colour
    except Exception:
        pass
    return BLUE


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
        return f'<img src="{escape(url)}" height="32" alt="ADRAM Technologies" style="display:block;border:0;height:32px;width:auto;">'
    # A text wordmark, so the header looks right without a hosted image
    return (f'<span style="font:700 19px {FONT};letter-spacing:.5px;color:{INK};">ADRAM</span>'
            f'<span style="font:400 19px {FONT};color:{MUTED};"> Technologies</span>')


def paragraph(text, size=15, color=TEXT, margin='0 0 16px'):
    return f'<p style="margin:{margin};font:{size}px/1.6 {FONT};color:{color};">{text}</p>'


def button(label, url):
    """A table-based button, which Outlook renders correctly."""
    accent = _accent()
    return (
        '<table role="presentation" cellpadding="0" cellspacing="0" style="margin:24px 0 8px;"><tr>'
        f'<td bgcolor="{accent}" style="border-radius:6px;">'
        f'<a href="{escape(url)}" target="_blank" style="display:inline-block;padding:12px 22px;font:600 15px {FONT};'
        f'color:#ffffff;text-decoration:none;border-radius:6px;">{escape(label)}</a>'
        '</td></tr></table>'
    )


def code_box(code, minutes):
    return (
        '<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:8px 0 8px;"><tr>'
        f'<td align="center" style="background:{SOFT};border-radius:6px;padding:22px 16px;">'
        # user-select:all: one tap or click selects the whole code, ready to copy (mail apps run no scripts,
        # so a real copy button isn't possible). Plain digits, so Gmail and iPhones can offer their own "copy code".
        f'<div style="font:600 32px/1 {MONO};letter-spacing:10px;color:{INK};padding-left:10px;'
        f'-webkit-user-select:all;-moz-user-select:all;user-select:all;cursor:text;">{escape(code)}</div>'
        '</td></tr></table>'
        + paragraph(f'Tap or click the code to select it, then copy it. It expires in {minutes} minutes and can only be used once.',
                    13, MUTED, '0 0 20px')
    )


def notice(text, tone='info', title=''):
    heading = f'<div style="font:600 14px {FONT};color:{TONES.get(tone, INK)};margin-bottom:4px;">{escape(title)}</div>' if title else ''
    return (
        '<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:20px 0;"><tr>'
        f'<td style="background:{SOFT};border-radius:6px;padding:14px 16px;">'
        f'{heading}<div style="font:14px/1.6 {FONT};color:{TEXT};">{text}</div>'
        '</td></tr></table>'
    )


def details(rows):
    """Label/value rows separated by hairlines: [(label, value), ...]. Values are escaped."""
    cells = ''.join(
        f'<tr><td style="padding:10px 0;border-top:1px solid {LINE};font:14px {FONT};color:{MUTED};width:38%;vertical-align:top;">{escape(label)}</td>'
        f'<td style="padding:10px 0;border-top:1px solid {LINE};font:14px/1.5 {FONT};color:{INK};text-align:right;">{escape(str(value or "—"))}</td></tr>'
        for label, value in rows
    )
    return (
        f'<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:8px 0 20px;border-bottom:1px solid {LINE};">'
        f'{cells}</table>'
    )


def quote(text):
    safe = escape(text).replace('\n', '<br>')
    return (
        '<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:6px 0 20px;"><tr>'
        f'<td style="background:{SOFT};border-radius:6px;padding:14px 16px;font:14px/1.6 {FONT};color:{TEXT};">{safe}</td>'
        '</tr></table>'
    )


def layout(*, preheader, label, tone, title, body, reason):
    """
    The frame every email uses.
      preheader: inbox preview text (hidden in the email body)
      label/tone: kept for callers; the plain design shows no label pill (tone only colours notice titles)
      reason: footer line explaining why the person received the email
    """
    c = _company()
    accent = _accent()
    year = date.today().year
    link = f'color:{MUTED};text-decoration:underline;'
    return f"""<!doctype html>
<html lang="en"><head>
<meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="color-scheme" content="light"><meta name="supported-color-schemes" content="light">
<title>{escape(title)}</title>
</head>
<body style="margin:0;padding:0;background:{SOFT};-webkit-text-size-adjust:100%;">
<div style="display:none;max-height:0;overflow:hidden;opacity:0;color:transparent;">{escape(preheader)}&#847;&zwnj;&nbsp;&#847;&zwnj;&nbsp;&#847;&zwnj;&nbsp;</div>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" bgcolor="{SOFT}" style="background:{SOFT};">
<tr><td align="center" style="padding:40px 16px;">

  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;">
    <tr><td style="padding:0 0 24px;"><a href="{escape(c['site'])}" style="text-decoration:none;">{_logo()}</a></td></tr>

    <tr><td bgcolor="#ffffff" style="background:#ffffff;border:1px solid {LINE};border-radius:8px;padding:36px 32px 32px;">
      <h1 style="margin:0 0 20px;font:600 22px/1.35 {FONT};color:{INK};">{escape(title)}</h1>
      {body}
      <p style="margin:28px 0 0;font:15px/1.6 {FONT};color:{TEXT};">Thanks,<br>The ADRAM Technologies team</p>
    </td></tr>

    <tr><td style="padding:24px 4px 0;font:12px/1.7 {FONT};color:{FAINT};">
      <p style="margin:0 0 10px;">Questions? Contact us at <a href="mailto:{escape(c['email'])}" style="{link}">{escape(c['email'])}</a>,
        call <a href="tel:{escape(c['phone'].replace(' ', ''))}" style="{link}">{escape(c['phone'])}</a>
        or message us on <a href="{escape(c['whatsapp'])}" style="{link}">WhatsApp</a> (Monday to Friday, 9:00 AM to 6:00 PM).</p>
      <p style="margin:0 0 10px;">{escape(reason)}</p>
      <p style="margin:0;">{escape(c['name'])} &middot; {escape(c['address'])} &middot; <a href="{escape(c['site'])}" style="color:{accent};text-decoration:none;">{escape(c['site'].split('://')[-1])}</a><br>&copy; {year} {escape(c['name'])}</p>
    </td></tr>
  </table>

</td></tr>
</table>
</body></html>"""


def _plain(title, lines, reason):
    c = _company()
    body = '\n\n'.join(line for line in lines if line)
    return (
        f'{title}\n\n{body}\n\nThanks,\nThe ADRAM Technologies team\n\n'
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
