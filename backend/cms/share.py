"""
The tags in the page's <head> that search engines and link previews (WhatsApp, Facebook, LinkedIn, X) read.

Those crawlers do not run JavaScript, so they only see what the server sends. When Django serves the built website
(SERVE_FRONTEND), cms.spa fills these tags in from the admin's edits before sending index.html:
  - the site-wide "Link previews" fields (Site content → Contact details & footer): title, description, picture
  - a page's own "Search & browser title" fields, when the admin has edited them
  - a service page: the service's name and tagline, when the admin has edited the services
Anything not edited keeps the text already in index.html.
"""
import html
import re

from .models import PageContent

# Path prefix -> content page. Same routes as the website (frontend/src/content/PageMeta.jsx).
ROUTES = [
    ('/about/team', 'team'),
    ('/about', 'about'),
    ('/services', 'services'),
    ('/courses', 'courses'),
    ('/scholarships', 'scholarships'),
    ('/contact', 'contact'),
    ('/join', 'other'),
]


def _slug_for(path):
    if path == '/':
        return 'home'
    for prefix, slug in ROUTES:
        if path == prefix or path.startswith(prefix + '/'):
            return slug
    return None


def _data(slug):
    page = PageContent.objects.filter(slug=slug).first()
    return page.data if page and isinstance(page.data, dict) else {}


def _text(value):
    return value.strip() if isinstance(value, str) and value.strip() else ''


def build_meta(path):
    """Returns {title, description, image, favicon}; a key is missing when nothing was edited for it."""
    site = _data('site')
    share = site.get('share') if isinstance(site.get('share'), dict) else {}
    meta = {
        'title': _text(share.get('title')),
        'description': _text(share.get('description')),
        'image': _text(share.get('image')),
        'favicon': _text(site.get('favicon')),
    }
    site_name = _text(site.get('name')) or 'ADRAM Technologies'

    slug = _slug_for(path)
    if slug:
        page = _data(slug)
        seo = page.get('seo') if isinstance(page.get('seo'), dict) else {}
        # The page's own title and description win, with {name} filled in
        if _text(seo.get('title')):
            meta['title'] = _text(seo['title']).replace('{name}', site_name)
        if _text(seo.get('description')):
            meta['description'] = _text(seo['description']).replace('{name}', site_name)

        # /services/<id>: the service's name and tagline, if the services were edited
        parts = path.strip('/').split('/')
        if slug == 'services' and len(parts) == 2:
            for item in page.get('items') or []:
                if isinstance(item, dict) and item.get('id') == parts[1] and _text(item.get('title')):
                    details = item.get('details') if isinstance(item.get('details'), dict) else {}
                    meta['title'] = f"{_text(item['title'])} | {site_name}"
                    meta['description'] = _text(details.get('tagline')) or _text(item.get('summary')) or meta['description']
    return {key: value for key, value in meta.items() if value}


def _set_meta(page, attr, name, value):
    """Replace content="..." of <meta attr="name" ...>; leaves the page alone when the tag isn't there."""
    pattern = re.compile(r'(<meta\s+[^>]*?%s="%s"[^>]*?content=")[^"]*(")' % (attr, re.escape(name)), re.IGNORECASE | re.DOTALL)
    return pattern.sub(lambda m: m.group(1) + html.escape(value, quote=True) + m.group(2), page, count=1)


def apply_meta(index_html, meta, absolute):
    """`absolute(path)` turns a path into a full address (og:image and og:url must be absolute)."""
    page = index_html
    title, description, image = meta.get('title'), meta.get('description'), meta.get('image')
    if title:
        page = re.sub(r'<title>.*?</title>', lambda _: f'<title>{html.escape(title)}</title>', page, count=1, flags=re.DOTALL)
        page = _set_meta(page, 'property', 'og:title', title)
    if description:
        page = _set_meta(page, 'name', 'description', description)
        page = _set_meta(page, 'property', 'og:description', description)
    image_url = absolute(image) if image else None
    if image_url:
        page = _set_meta(page, 'property', 'og:image', image_url)
        # The picture's real size is unknown, so drop the fixed width and height of the original one
        page = re.sub(r'\s*<meta property="og:image:(width|height)"[^>]*/>', '', page)
    if meta.get('favicon'):
        icon = html.escape(absolute(meta['favicon']), quote=True)
        page = re.sub(r'<link rel="icon"[^>]*/>\s*', '', page)
        page = page.replace('<link rel="apple-touch-icon"', f'<link rel="icon" href="{icon}" />\n    <link rel="apple-touch-icon"', 1)
    return page
