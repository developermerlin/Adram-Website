import re

from django.contrib.auth import get_user_model
from django.core import mail
from django.core.cache import cache
from django.test import override_settings
from rest_framework.test import APITestCase

from .models import Delivery, Issue, NewsletterSettings, Subscriber

User = get_user_model()
API = '/api/v1/newsletter'


@override_settings(EMAIL_BACKEND='django.core.mail.backends.locmem.EmailBackend', FRONTEND_URL='https://adram.example')
class SignUpTests(APITestCase):
    def setUp(self):
        cache.clear()

    def tearDown(self):
        cache.clear()  # sign-up limits are kept in the cache

    def subscribe(self, email='ama@example.com', **extra):
        return self.client.post(f'{API}/subscribe/', {'email': email, **extra}, format='json')

    def token_from(self, message, kind):
        return re.search(rf'/newsletter/{kind}/([\w-]+)', message.body).group(1)

    def test_double_opt_in(self):
        self.assertTrue(self.client.get(f'{API}/form/').data['enabled'])
        resp = self.subscribe('Ama@Example.com', name='Ama Kamara')
        self.assertEqual((resp.status_code, resp.data['status']), (201, 'check_email'))
        sub = Subscriber.objects.get()
        self.assertEqual((sub.email, sub.status, sub.name), ('ama@example.com', Subscriber.PENDING, 'Ama Kamara'))
        self.assertEqual(mail.outbox[0].subject, 'Confirm your ADRAM newsletter subscription')
        token = self.token_from(mail.outbox[0], 'confirm')
        self.assertEqual(self.client.post(f'{API}/confirm/{token}/').data['status'], Subscriber.SUBSCRIBED)
        self.assertEqual(mail.outbox[-1].subject, 'Welcome to the ADRAM newsletter')
        again = self.subscribe('ama@example.com')
        self.assertEqual(again.data['status'], 'subscribed')  # already on the list: no new email
        self.assertEqual(len(mail.outbox), 2)

    def test_bad_input_bots_and_limits(self):
        self.assertEqual(self.subscribe('not-an-email').status_code, 400)
        self.assertEqual(self.subscribe('bot@example.com', company='Acme').data['status'], 'check_email')
        self.assertFalse(Subscriber.objects.filter(email='bot@example.com').exists())  # honeypot filled: ignored
        for i in range(8):
            self.subscribe(f'p{i}@example.com')
        self.assertEqual(self.subscribe('late@example.com').status_code, 429)

    def test_resend_is_spaced_out(self):
        self.subscribe()
        self.subscribe()
        self.assertEqual(len(mail.outbox), 1)

    def test_single_opt_in_and_closed_form(self):
        NewsletterSettings.objects.update_or_create(pk=NewsletterSettings.load().pk, defaults={'double_opt_in': False, 'welcome_email': False})
        self.assertEqual(self.subscribe().data['status'], 'subscribed')
        self.assertEqual((Subscriber.objects.get().status, len(mail.outbox)), (Subscriber.SUBSCRIBED, 0))
        NewsletterSettings.objects.update(enabled=False)
        self.assertEqual(self.client.get(f'{API}/form/').data, {'enabled': False})
        self.assertEqual(self.subscribe('other@example.com').status_code, 400)

    def test_unsubscribe_and_resubscribe(self):
        sub = Subscriber.objects.create(email='ama@example.com', status=Subscriber.SUBSCRIBED)
        self.assertEqual(self.client.get(f'{API}/unsubscribe/{sub.token}/').data['email'], 'am*@example.com')
        self.assertEqual(self.client.post(f'{API}/unsubscribe/{sub.token}/').data['status'], Subscriber.UNSUBSCRIBED)
        self.assertEqual(self.client.post(f'{API}/resubscribe/{sub.token}/').data['status'], Subscriber.SUBSCRIBED)
        self.assertEqual(self.client.get(f'{API}/unsubscribe/nope/').status_code, 404)


@override_settings(EMAIL_BACKEND='django.core.mail.backends.locmem.EmailBackend', FRONTEND_URL='https://adram.example', BACKEND_URL='https://api.adram.example')
class AdminTests(APITestCase):
    @classmethod
    def setUpTestData(cls):
        cls.admin = User.objects.create_user(email='admin@example.com', password='x', role=User.ADMIN, is_verified=True, first_name='Ada')
        cls.student = User.objects.create_user(email='student@example.com', password='x', role=User.STUDENT, is_verified=True)

    def setUp(self):
        self.client.force_authenticate(self.admin)

    def test_only_admins(self):
        self.client.force_authenticate(self.student)
        for url in ('manage/overview/', 'manage/subscribers/', 'manage/issues/', 'manage/settings/'):
            self.assertEqual(self.client.get(f'{API}/{url}').status_code, 403, url)

    def test_subscribers_add_import_export(self):
        self.assertEqual(self.client.post(f'{API}/manage/subscribers/', {'email': 'ama@example.com', 'name': 'Ama'}, format='json').status_code, 201)
        self.assertEqual(self.client.post(f'{API}/manage/subscribers/', {'email': 'AMA@example.com'}, format='json').status_code, 400)
        text = 'email,name\nbob@example.com, Bob Cole\n"Cara Jones" <cara@example.com>\nama@example.com\nnonsense\n=evil@example.com, =HYPERLINK("x")'
        result = self.client.post(f'{API}/manage/subscribers/import/', {'text': text}, format='json').data
        self.assertEqual((result['added'], result['duplicates'], result['invalid']), (3, 1, 1))
        self.assertEqual(Subscriber.objects.get(email='cara@example.com').name, 'Cara Jones')
        listing = self.client.get(f'{API}/manage/subscribers/', {'q': 'bob'}).data
        self.assertEqual((listing['count'], listing['counts']['subscribed']), (1, 4))
        sub = Subscriber.objects.get(email='bob@example.com')
        self.assertEqual(self.client.patch(f'{API}/manage/subscribers/{sub.id}/', {'status': 'unsubscribed'}, format='json').data['status'], 'unsubscribed')
        csv_text = self.client.get(f'{API}/manage/subscribers/export/').content.decode('utf-8-sig')
        self.assertIn('cara@example.com,Cara Jones,Subscribed', csv_text)
        self.assertIn("'=HYPERLINK", csv_text)  # no formulas in Excel
        self.assertEqual(self.client.delete(f'{API}/manage/subscribers/{sub.id}/').status_code, 204)

    def test_settings(self):
        resp = self.client.put(f'{API}/manage/settings/', {'heading': 'Stay in touch', 'enabled': False}, format='json')
        self.assertEqual((resp.data['heading'], resp.data['enabled']), ('Stay in touch', False))
        self.assertEqual(self.client.put(f'{API}/manage/settings/', {'heading': ' '}, format='json').status_code, 400)

    def test_write_preview_test_and_send(self):
        bad = self.client.post(f'{API}/manage/issues/', {'subject': '', 'body': '', 'button_label': 'Go', 'button_link': 'javascript:x'}, format='json')
        self.assertEqual(set(bad.data), {'subject', 'body', 'button_link'})
        body = 'Hello {name},\n\nNew this month:\n\n- Web development course\n- Two scholarships'
        issue = self.client.post(f'{API}/manage/issues/', {'subject': 'October news', 'body': body, 'button_label': 'See courses',
                                                          'button_link': '/courses'}, format='json').data
        preview = self.client.post(f'{API}/manage/issues/preview/', {'subject': 'October news', 'body': body}, format='json').data
        self.assertIn('<li style="margin:0 0 6px;">Two scholarships</li>', preview['html'])
        self.assertIn('Hello Aminata,', preview['html'])
        self.assertEqual(self.client.post(f'{API}/manage/issues/{issue["id"]}/send/').status_code, 400)  # nobody subscribed yet

        ama = Subscriber.objects.create(email='ama@example.com', name='Ama Kamara', status=Subscriber.SUBSCRIBED)
        Subscriber.objects.create(email='pending@example.com', status=Subscriber.PENDING)
        Subscriber.objects.create(email='gone@example.com', status=Subscriber.UNSUBSCRIBED)
        self.client.post(f'{API}/manage/issues/{issue["id"]}/test/')
        self.assertEqual((mail.outbox[-1].to, Delivery.objects.count()), (['admin@example.com'], 0))  # a test isn't a delivery

        sent = self.client.post(f'{API}/manage/issues/{issue["id"]}/send/').data
        self.assertEqual((sent['status'], sent['sent']), ('sent', 1))
        message = mail.outbox[-1]
        self.assertEqual((message.to, message.subject), (['ama@example.com'], 'October news'))
        self.assertIn('Hello Ama,', message.body)
        self.assertIn(f'/api/v1/newsletter/unsubscribe/{ama.token}/', message.extra_headers['List-Unsubscribe'])
        self.assertEqual(message.extra_headers['List-Unsubscribe-Post'], 'List-Unsubscribe=One-Click')
        self.assertEqual(self.client.post(f'{API}/manage/issues/{issue["id"]}/send/').status_code, 400)  # only once
        self.assertEqual(self.client.patch(f'{API}/manage/issues/{issue["id"]}/', {'subject': 'x'}, format='json').status_code, 400)

        click = re.search(r'/api/v1/newsletter/(c/[^\s]+/)', message.body).group(1)
        self.client.force_authenticate(None)
        resp = self.client.get(f'{API}/{click}')
        self.assertEqual((resp.status_code, resp['Location']), (302, 'https://adram.example/courses'))
        delivery = Delivery.objects.get()
        self.client.post(f'{API}/unsubscribe/{ama.token}/?d={delivery.id}', 'List-Unsubscribe=One-Click', content_type='application/x-www-form-urlencoded')
        delivery.refresh_from_db()
        self.assertTrue(delivery.clicked_at and delivery.unsubscribed_at)
        self.client.force_authenticate(self.admin)
        stats = self.client.get(f'{API}/manage/issues/{issue["id"]}/').data
        self.assertEqual((stats['clicks'], stats['click_rate'], stats['unsubscribed']), (1, 100.0, 1))
        overview = self.client.get(f'{API}/manage/overview/').data
        self.assertEqual((overview['subscribed'], overview['pending'], overview['unsubscribed'], overview['issues_sent']), (0, 1, 2, 1))
        self.assertEqual(len(overview['growth']), 30)
        self.assertEqual(Issue.objects.get().status, Issue.SENT)


@override_settings(EMAIL_BACKEND='django.core.mail.backends.locmem.EmailBackend', FRONTEND_URL='http://localhost:5173', BACKEND_URL='http://127.0.0.1:8000')
class LocalAddressTests(APITestCase):
    """Sending from a computer without a public address: no links to 127.0.0.1, the picture travels inside the email."""

    def test_no_ip_links_and_embedded_picture(self):
        import shutil
        import tempfile
        from django.test import override_settings as settings_for
        admin = User.objects.create_user(email='admin@example.com', password='x', role=User.ADMIN, is_verified=True)
        self.client.force_authenticate(admin)
        media = tempfile.mkdtemp()
        self.addCleanup(shutil.rmtree, media, True)
        import os
        os.makedirs(os.path.join(media, 'site'))
        from PIL import Image
        Image.new('RGB', (4, 4), (20, 84, 232)).save(os.path.join(media, 'site', 'pic.png'))
        Subscriber.objects.create(email='ama@example.com', status=Subscriber.SUBSCRIBED)
        fields = {'subject': 'testing', 'body': 'Lorem ipsum dolor.', 'image': '/media/site/pic.png', 'button_label': 'Watch', 'button_link': 'https://youtube.com/x'}
        with settings_for(MEDIA_ROOT=media, MEDIA_URL='/media/'):
            warnings = self.client.post(f'{API}/manage/issues/preview/', fields, format='json').data['warnings']
            self.assertEqual(len(warnings), 5)  # local links, no tracking, lorem ipsum, too short, one-word subject
            issue = self.client.post(f'{API}/manage/issues/', fields, format='json').data
            self.client.post(f'{API}/manage/issues/{issue["id"]}/send/')
        message = mail.outbox[-1]
        html = message.alternatives[0][0]
        self.assertNotIn('127.0.0.1', html + message.body)
        self.assertNotIn('List-Unsubscribe', message.extra_headers)
        self.assertIn('href="https://youtube.com/x"', html)  # straight to the button's target
        self.assertIn('src="cid:newsletter-image"', html)
        with settings_for(MEDIA_ROOT=media, MEDIA_URL='/media/'):
            built = message.message()
        related = [p for p in built.walk() if p.get_content_type() == 'multipart/related']
        picture = [p for p in built.walk() if p.get_content_type() == 'image/png']
        self.assertEqual((len(related), len(picture), picture[0]['Content-ID']), (1, 1, '<newsletter-image>'))

