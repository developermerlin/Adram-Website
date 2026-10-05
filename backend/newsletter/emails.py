"""Newsletter emails, in the same plain design as every other ADRAM email (accounts/emails.py)."""
import ipaddress
import os
import re
import mimetypes
from urllib.parse import urlparse

from django.conf import settings
from django.core import signing
from django.core.mail import EmailMultiAlternatives
from django.utils.html import escape

from accounts.emails import FONT, MUTED, TEXT, _plain, _send, button, layout, paragraph

SALT = 'newsletter'


def site_url(path):
    return path if path.startswith('http') else f'{settings.FRONTEND_URL.rstrip("/")}/{path.lstrip("/")}'


def api_url(path):
    base = getattr(settings, 'BACKEND_URL', '') or settings.FRONTEND_URL
    return f'{base.rstrip("/")}/api/v1/newsletter/{path.lstrip("/")}'


def media_url(path):
    """Images uploaded to the site (/media/...) are served by Django; full https:// addresses are used as they are."""
    if not path or path.startswith('http'):
        return path
    base = getattr(settings, 'BACKEND_URL', '') or settings.FRONTEND_URL
    return f'{base.rstrip("/")}/{path.lstrip("/")}'


def is_local(url):
    """True for addresses only this computer or network can open (localhost, 127.0.0.1, 192.168.x.x...).
    Links like that don't work for subscribers, and spam filters treat links to bare IP addresses as a strong spam sign."""
    host = (urlparse(url).hostname or '').lower()
    if host in ('localhost', '') or host.endswith(('.local', '.localhost')):
        return True
    try:
        ip = ipaddress.ip_address(host)
    except ValueError:
        return False
    return ip.is_private or ip.is_loopback or ip.is_link_local


def public_api():
    """Click tracking and mail apps' one-click unsubscribe need the API on a public address."""
    return not is_local(api_url(''))


def warnings(issue):
    """Things that make a newsletter likely to land in spam (or not work), shown to the admin before sending."""
    out = []
    if is_local(site_url('/')):
        out.append(f'Links in this email point to {site_url("/").rstrip("/")}, which only works on this computer. '
                   'Set FRONTEND_URL (and BACKEND_URL) in the server settings to your website’s real address before sending to real subscribers.')
    if not public_api():
        out.append('Until the server has a public address, button clicks aren’t counted and mail apps can’t show their own Unsubscribe button. '
                   'The unsubscribe link inside the email still works.')
    if 'lorem ipsum' in (issue.body or '').lower():
        out.append('The text contains “Lorem Ipsum” placeholder text, which spam filters look for. Use your real content.')
    if len(re.findall(r'\w+', issue.body or '')) < 15:
        out.append('Very short emails are more likely to be filtered as spam. Write a few sentences.')
    if (issue.subject or '').strip().lower() in ('test', 'testing', 'hello', 'hi'):
        out.append('Use a descriptive subject line. One-word subjects like “testing” are often filtered as spam.')
    return out


def _site_image(path):
    """The file behind an uploaded site image (/media/...), or None. Never leaves MEDIA_ROOT."""
    media = settings.MEDIA_URL if settings.MEDIA_URL.startswith('/') else '/media/'
    if not path or not path.startswith(media):
        return None
    root = os.path.realpath(settings.MEDIA_ROOT)
    full = os.path.realpath(os.path.join(root, path[len(media):]))
    if not full.startswith(root + os.sep) or not os.path.isfile(full) or os.path.getsize(full) > 5 * 1024 * 1024:
        return None
    return full


def confirm_link(sub):
    return site_url(f'/newsletter/confirm/{sub.token}')


def unsubscribe_page(sub, delivery=None):
    return site_url(f'/newsletter/unsubscribe/{sub.token}' + (f'?d={delivery.id}' if delivery else ''))


def unsubscribe_one_click(sub, delivery=None):
    """For mail apps' own "Unsubscribe" button (RFC 8058): they POST here without opening a page."""
    return api_url(f'unsubscribe/{sub.token}/' + (f'?d={delivery.id}' if delivery else ''))


def click_link(delivery):
    return api_url(f'c/{signing.dumps({"d": delivery.id}, salt=SALT)}/')


def personal(text, sub):
    first = (sub.name or '').split(' ')[0] if sub else ''
    return text.replace('{name}', first or 'there')


# ---------------------------------------------------------------- body: paragraphs, bullet lists, line breaks

def body_html(body, sub=None):
    """Blank lines separate paragraphs; lines starting with "- " become a bullet list. Everything is escaped."""
    out = []
    for block in re.split(r'\n\s*\n', personal(body, sub).strip()):
        lines = [line.rstrip() for line in block.strip().split('\n') if line.strip()]
        if not lines:
            continue
        if all(line.lstrip().startswith(('- ', '* ')) for line in lines):
            items = ''.join(f'<li style="margin:0 0 6px;">{escape(line.lstrip()[2:])}</li>' for line in lines)
            out.append(f'<ul style="margin:0 0 16px;padding-left:22px;font:15px/1.6 {FONT};color:{TEXT};">{items}</ul>')
        else:
            out.append(paragraph('<br>'.join(escape(line) for line in lines)))
    return ''.join(out)


def body_text(body, sub=None):
    return personal(body, sub).strip()


# ---------------------------------------------------------------- confirmation and welcome

def send_confirmation(sub):
    link = confirm_link(sub)
    title = 'Confirm your subscription'
    reason = f'You received this email because {sub.email} was entered in the newsletter form on our website.'
    html = layout(
        preheader='One click to confirm and start receiving the ADRAM newsletter.', label='Newsletter', tone='info', title=title, reason=reason,
        body=paragraph('Thanks for signing up to the ADRAM Technologies newsletter. Please confirm that this is your email address.')
        + button('Confirm subscription', link)
        + paragraph('If you didn’t sign up, ignore this email and you won’t hear from us.', 13, MUTED, '18px 0 0'),
    )
    text = _plain(title, ['Thanks for signing up to the ADRAM Technologies newsletter. Confirm your email address here:', link,
                          'If you didn’t sign up, ignore this email and you won’t hear from us.'], reason)
    _send(sub.email, 'Confirm your ADRAM newsletter subscription', text, html)


def send_welcome(sub):
    title = 'You’re subscribed'
    stop = unsubscribe_page(sub)
    reason = f'You received this email because {sub.email} subscribed to the ADRAM newsletter.'
    html = layout(
        preheader='Thanks for subscribing to the ADRAM Technologies newsletter.', label='Newsletter', tone='success', title=title, reason=reason,
        body=paragraph(escape(personal('Hello {name},', sub)))
        + paragraph('Thanks for subscribing. We’ll send you news about our services, new training programmes and scholarship opportunities, '
                    'a few times a month at most.')
        + button('Visit our website', site_url('/'))
        + paragraph(f'Changed your mind? <a href="{escape(stop)}" style="color:{MUTED};text-decoration:underline;">Unsubscribe</a> at any time.',
                    13, MUTED, '18px 0 0'),
    )
    text = _plain(title, [personal('Hello {name},', sub), 'Thanks for subscribing to the ADRAM Technologies newsletter.',
                          f'Unsubscribe at any time: {stop}'], reason)
    _send(sub.email, 'Welcome to the ADRAM newsletter', text, html)


# ---------------------------------------------------------------- an issue

def build_issue(issue, sub, delivery=None, for_email=True):
    """(subject, text, html, headers, inline_image_path) for one subscriber.
    Without a delivery (a test or a preview), links aren't tracked. While the server only has a local address, links
    go straight to their target, no one-click unsubscribe header is added, and an uploaded picture is embedded in the
    email itself (for_email) so it shows without the site being online."""
    title = personal(issue.title or issue.subject, sub)
    link = ''
    if issue.button_label and issue.button_link:
        link = click_link(delivery) if delivery and public_api() else site_url(issue.button_link)
    stop = unsubscribe_page(sub, delivery) if sub and sub.pk else site_url('/newsletter/unsubscribe/preview')
    image = media_url(issue.image)
    inline = None
    if for_email and image and is_local(image):
        inline = _site_image(issue.image)
        image = 'cid:newsletter-image' if inline else ''
    picture = (f'<img src="{escape(image)}" alt="" width="100%" style="display:block;width:100%;max-width:100%;height:auto;'
               f'border:0;border-radius:6px;margin:0 0 22px;">' if image else '')
    reason = 'You received this email because you subscribed to the ADRAM newsletter on our website.'
    html = layout(
        preheader=issue.preheader or title, label='Newsletter', tone='info', title=title, reason=reason,
        body=picture + body_html(issue.body, sub) + (button(issue.button_label, link) if link else '')
        + paragraph(f'<a href="{escape(stop)}" style="color:{MUTED};text-decoration:underline;">Unsubscribe from this newsletter</a>',
                    12, MUTED, '24px 0 0'),
    )
    text = _plain(title, [body_text(issue.body, sub), f'{issue.button_label}: {link}' if link else '', f'Unsubscribe: {stop}'], reason)
    headers = {}
    if sub and sub.pk and public_api():
        headers = {'List-Unsubscribe': f'<{unsubscribe_one_click(sub, delivery)}>', 'List-Unsubscribe-Post': 'List-Unsubscribe=One-Click'}
    return personal(issue.subject, sub), text, html, headers, inline


class NewsletterMessage(EmailMultiAlternatives):
    """Puts an embedded picture next to the HTML part (multipart/related), where cid: links find it."""

    def __init__(self, *args, inline=None, **kwargs):
        super().__init__(*args, **kwargs)
        self.inline = inline

    def message(self, *args, **kwargs):
        msg = super().message(*args, **kwargs)
        kind = mimetypes.guess_type(self.inline or '')[0] or ''
        html = msg.get_body(('html',)) if self.inline and kind.startswith('image/') else None
        if html is not None:
            try:
                with open(self.inline, 'rb') as fh:
                    data = fh.read()
                html.add_related(data, *kind.split('/', 1), cid='<newsletter-image>', filename=os.path.basename(self.inline))
            except OSError:
                pass  # the file went missing: the email goes without the picture
        return msg


def send_issue_to(connection, issue, sub, delivery=None, to=None):
    subject, text, html, headers, inline = build_issue(issue, sub, delivery)
    message = NewsletterMessage(subject, text, settings.DEFAULT_FROM_EMAIL, [to or sub.email], connection=connection,
                                headers=headers, inline=inline)
    message.attach_alternative(html, 'text/html')
    message.send(fail_silently=False)
