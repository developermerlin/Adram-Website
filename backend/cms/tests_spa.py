import tempfile
from pathlib import Path

from django.core.signals import request_finished
from django.db import close_old_connections
from django.test import RequestFactory, TestCase, override_settings

from .models import PageContent
from .spa import spa

INDEX = """<!doctype html>
<html lang="en">
  <head>
    <title>ADRAM Technologies | Building Solutions for a Better Future</title>
    <meta
      name="description"
      content="Original description."
    />
    <meta property="og:title" content="ADRAM Technologies | Building Solutions for a Better Future" />
    <meta property="og:description" content="Original preview description." />
    <meta property="og:image" content="/brand/og-image.png" />
    <meta property="og:image:width" content="1200" />
    <meta property="og:image:height" content="630" />
    <link rel="icon" href="/favicon.ico" sizes="any" />
    <link rel="icon" type="image/png" href="/favicon.png" />
    <link rel="apple-touch-icon" href="/brand/mark-192.png" />
  </head>
  <body><div id="root"></div></body>
</html>
"""


class ServeFrontendTests(TestCase):
    def setUp(self):
        self.dist = tempfile.TemporaryDirectory()
        self.addCleanup(self.dist.cleanup)
        root = Path(self.dist.name)
        (root / 'index.html').write_text(INDEX, encoding='utf-8')
        (root / 'assets').mkdir()
        (root / 'assets' / 'app-123.js').write_text('console.log(1)', encoding='utf-8')
        (root / 'brand').mkdir()
        (root / 'brand' / 'og-image.png').write_bytes(b'\x89PNG fake')
        (Path(self.dist.name).parent / 'outside-secret.txt').write_text('secret', encoding='utf-8')
        self.addCleanup(lambda: (Path(self.dist.name).parent / 'outside-secret.txt').unlink(missing_ok=True))
        self.factory = RequestFactory()
        override = override_settings(FRONTEND_DIST=self.dist.name, ALLOWED_HOSTS=['adram.test', 'testserver'])
        override.enable()
        self.addCleanup(override.disable)

    def get(self, path='/'):
        request = self.factory.get(path, HTTP_HOST='adram.test')
        response = spa(request, path.lstrip('/'))
        self.addCleanup(self.release, response)  # release the file on Windows before the temp folder is removed
        return response

    @staticmethod
    def release(response):
        # Closing a response announces "request finished", which closes the database connection - inside a test's
        # transaction that breaks PostgreSQL. Django's test client pauses that signal the same way.
        request_finished.disconnect(close_old_connections)
        try:
            response.close()
        finally:
            request_finished.connect(close_old_connections)

    def html(self, path='/'):
        response = self.get(path)
        self.assertEqual(response.status_code, 200)
        return response.content.decode()

    def save(self, slug, data):
        PageContent.objects.update_or_create(slug=slug, defaults={'data': data})

    def test_untouched_site_keeps_the_original_tags(self):
        page = self.html('/about')
        self.assertIn('Original description.', page)
        self.assertIn('<title>ADRAM Technologies | Building Solutions for a Better Future</title>', page)

    def test_unknown_addresses_get_the_app_so_it_can_show_its_own_404(self):
        self.assertIn('<div id="root">', self.html('/no/such/page'))

    def test_site_wide_link_preview_fields(self):
        self.save('site', {'share': {'title': 'Share title', 'description': 'Share text.', 'image': '/media/site/pic.png'}})
        page = self.html('/')
        self.assertIn('<title>Share title</title>', page)
        self.assertIn('content="Share text."', page)
        self.assertIn('property="og:title" content="Share title"', page)
        self.assertIn('property="og:image" content="http://adram.test/media/site/pic.png"', page)
        self.assertNotIn('og:image:width', page)

    def test_a_pages_own_title_and_description_win(self):
        self.save('site', {'name': 'Acme', 'share': {'title': 'Share title'}})
        self.save('about', {'seo': {'title': 'Who we are at {name}', 'description': 'About {name}.'}})
        about = self.html('/about')
        self.assertIn('<title>Who we are at Acme</title>', about)
        self.assertIn('content="About Acme."', about)
        # other pages still use the site-wide one
        self.assertIn('<title>Share title</title>', self.html('/contact'))

    def test_an_edited_service_page(self):
        self.save('services', {'items': [{'id': 'hardware', 'title': 'Computers', 'summary': 'Sum', 'details': {'tagline': 'We fix them.'}}]})
        page = self.html('/services/hardware')
        self.assertIn('<title>Computers | ADRAM Technologies</title>', page)
        self.assertIn('content="We fix them."', page)

    def test_values_are_escaped(self):
        self.save('site', {'share': {'title': '"><script>alert(1)</script>', 'description': 'a "quoted" <b>bit</b>'}})
        page = self.html('/')
        self.assertNotIn('<script>alert(1)</script>', page)
        self.assertIn('&lt;script&gt;', page)

    def test_favicon_is_replaced(self):
        self.save('site', {'favicon': '/media/site/icon.png'})
        page = self.html('/')
        self.assertIn('<link rel="icon" href="http://adram.test/media/site/icon.png" />', page)
        self.assertNotIn('/favicon.ico', page)
        self.assertIn('apple-touch-icon', page)

    def test_build_files_are_served_with_caching(self):
        response = self.get('/assets/app-123.js')
        self.assertEqual(response.status_code, 200)
        self.assertIn('immutable', response['Cache-Control'])
        self.assertEqual(self.get('/brand/og-image.png').status_code, 200)

    def test_missing_asset_is_a_404_not_the_app(self):
        from django.http import Http404
        with self.assertRaises(Http404):
            self.get('/assets/missing-999.js')

    def test_cannot_read_files_outside_the_build(self):
        response = self.get('/../outside-secret.txt')
        self.assertNotIn(b'secret', b''.join(response.streaming_content) if response.streaming else response.content)

    def test_only_get_is_allowed(self):
        request = self.factory.post('/')
        self.assertEqual(spa(request, '').status_code, 405)

    def test_missing_build_explains_itself(self):
        with override_settings(FRONTEND_DIST=self.dist.name + '/nope'):
            self.assertEqual(self.get('/').status_code, 503)

    def test_index_is_never_cached(self):
        self.assertEqual(self.get('/')['Cache-Control'], 'no-cache')
