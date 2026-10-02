import io
import shutil
import tempfile

from django.contrib.auth import get_user_model
from django.core.files.uploadedfile import SimpleUploadedFile
from django.test import override_settings
from PIL import Image
from rest_framework.test import APITestCase

from .models import PageContent, SiteImage

User = get_user_model()
BASE = '/api/v1/content'


def png_bytes(size=(20, 20)):
    buf = io.BytesIO()
    Image.new('RGB', size, (20, 84, 232)).save(buf, 'PNG')
    return buf.getvalue()


class ContentTests(APITestCase):
    @classmethod
    def setUpTestData(cls):
        cls.admin = User.objects.create_user(email='admin@example.com', password='Str0ng!Pass', role=User.ADMIN, is_verified=True)
        cls.student = User.objects.create_user(email='student@example.com', password='Str0ng!Pass', role=User.STUDENT, is_verified=True)

    def test_public_page_is_empty_until_edited(self):
        resp = self.client.get(f'{BASE}/home/')
        self.assertEqual(resp.status_code, 200)
        self.assertEqual(resp.data['data'], {})

    def test_unknown_page_is_404(self):
        self.assertEqual(self.client.get(f'{BASE}/nothing/').status_code, 404)
        self.client.force_authenticate(self.admin)
        self.assertEqual(self.client.put(f'{BASE}/manage/nothing/', {'data': {}}, format='json').status_code, 404)

    def test_only_admins_can_edit(self):
        payload = {'data': {'hero': {'title': 'Hi'}}}
        self.assertEqual(self.client.put(f'{BASE}/manage/home/', payload, format='json').status_code, 401)
        self.client.force_authenticate(self.student)
        self.assertEqual(self.client.put(f'{BASE}/manage/home/', payload, format='json').status_code, 403)
        self.assertEqual(self.client.delete(f'{BASE}/manage/home/').status_code, 403)
        self.assertFalse(PageContent.objects.exists())

    def test_admin_saves_and_public_page_shows_it(self):
        self.client.force_authenticate(self.admin)
        resp = self.client.put(f'{BASE}/manage/home/', {'data': {'hero': {'title': 'New title'}}}, format='json')
        self.assertEqual(resp.status_code, 200)
        self.assertEqual(PageContent.objects.get(slug='home').updated_by, self.admin)
        self.client.force_authenticate(None)
        self.assertEqual(self.client.get(f'{BASE}/home/').data['data'], {'hero': {'title': 'New title'}})

    def test_second_save_updates_the_same_row(self):
        self.client.force_authenticate(self.admin)
        self.client.put(f'{BASE}/manage/about/', {'data': {'a': 'one'}}, format='json')
        self.client.put(f'{BASE}/manage/about/', {'data': {'a': 'two'}}, format='json')
        self.assertEqual(PageContent.objects.filter(slug='about').count(), 1)
        self.assertEqual(PageContent.objects.get(slug='about').data, {'a': 'two'})

    def test_reset_removes_edits(self):
        self.client.force_authenticate(self.admin)
        self.client.put(f'{BASE}/manage/team/', {'data': {'a': 'one'}}, format='json')
        resp = self.client.delete(f'{BASE}/manage/team/')
        self.assertEqual(resp.data['data'], {})
        self.assertFalse(PageContent.objects.filter(slug='team').exists())

    def test_script_style_links_are_refused(self):
        self.client.force_authenticate(self.admin)
        for bad in ('javascript:alert(1)', '  JavaScript:alert(1)', 'data:text/html;base64,AAAA'):
            resp = self.client.put(f'{BASE}/manage/home/', {'data': {'hero': {'link': bad}}}, format='json')
            self.assertEqual(resp.status_code, 400, bad)
        ok = self.client.put(f'{BASE}/manage/home/', {'data': {'hero': {'link': '/services', 'other': 'https://example.com'}}}, format='json')
        self.assertEqual(ok.status_code, 200)

    def test_site_colours_must_be_hex(self):
        self.client.force_authenticate(self.admin)
        url = f'{BASE}/manage/site/'
        for bad in ({'primary': 'red; background:url(x)'}, {'dark': '#12345'}, {'accent': 12}, 'blue'):
            self.assertEqual(self.client.put(url, {'data': {'theme': bad}}, format='json').status_code, 400, bad)
        ok = self.client.put(url, {'data': {'theme': {'preset': 'custom', 'primary': '#0D9488', 'dark': '#042f2e'}}}, format='json')
        self.assertEqual(ok.status_code, 200)
        self.assertEqual(self.client.get(f'{BASE}/site/').data['data']['theme']['primary'], '#0D9488')

    def test_content_must_be_an_object_and_not_too_large(self):
        self.client.force_authenticate(self.admin)
        self.assertEqual(self.client.put(f'{BASE}/manage/home/', {'data': ['x']}, format='json').status_code, 400)
        self.assertEqual(self.client.put(f'{BASE}/manage/home/', {'data': {'t': 'x' * 9000}}, format='json').status_code, 400)
        self.assertEqual(self.client.put(f'{BASE}/manage/home/', {'data': {'l': list(range(600))}}, format='json').status_code, 400)


class MediaTests(APITestCase):
    def setUp(self):
        self.media = tempfile.mkdtemp()
        self.addCleanup(shutil.rmtree, self.media, True)
        self.admin = User.objects.create_user(email='admin@example.com', password='Str0ng!Pass', role=User.ADMIN, is_verified=True)

    def upload(self, name='pic.png', data=None, content_type='image/png'):
        return self.client.post(f'{BASE}/media/', {'image': SimpleUploadedFile(name, data or png_bytes(), content_type=content_type)}, format='multipart')

    def test_admin_uploads_and_lists_images(self):
        with override_settings(MEDIA_ROOT=self.media):
            self.client.force_authenticate(self.admin)
            resp = self.upload()
            self.assertEqual(resp.status_code, 201, resp.data)
            self.assertTrue(resp.data['url'].startswith('/media/site/'))
            self.assertEqual(resp.data['name'], 'pic')
            self.assertEqual(len(self.client.get(f'{BASE}/media/').data), 1)

    def test_students_and_visitors_cannot_upload(self):
        with override_settings(MEDIA_ROOT=self.media):
            self.assertEqual(self.upload().status_code, 401)
            student = User.objects.create_user(email='s@example.com', password='Str0ng!Pass', role=User.STUDENT, is_verified=True)
            self.client.force_authenticate(student)
            self.assertEqual(self.upload().status_code, 403)
            self.assertEqual(self.client.get(f'{BASE}/media/').status_code, 403)

    def test_rejects_non_images_and_svg(self):
        with override_settings(MEDIA_ROOT=self.media):
            self.client.force_authenticate(self.admin)
            self.assertEqual(self.upload('a.png', b'not an image').status_code, 400)
            svg = b'<svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script></svg>'
            self.assertEqual(self.upload('a.svg', svg, 'image/svg+xml').status_code, 400)
            self.assertFalse(SiteImage.objects.exists())

    def test_delete_removes_the_file(self):
        with override_settings(MEDIA_ROOT=self.media):
            self.client.force_authenticate(self.admin)
            pk = self.upload().data['id']
            path = SiteImage.objects.get(pk=pk).image.path
            self.assertEqual(self.client.delete(f'{BASE}/media/{pk}/').status_code, 204)
            self.assertFalse(SiteImage.objects.exists())
            import os
            self.assertFalse(os.path.exists(path))


class HistoryTests(APITestCase):
    def setUp(self):
        self.admin = User.objects.create_user(email='admin@example.com', password='Str0ng!Pass', role=User.ADMIN, is_verified=True)
        self.client.force_authenticate(self.admin)

    def save(self, slug, data):
        return self.client.put(f'{BASE}/manage/{slug}/', {'data': data}, format='json')

    def test_every_save_reset_and_restore_is_recorded(self):
        self.save('home', {'hero': {'title': 'One'}})
        self.save('home', {'hero': {'title': 'Two'}, 'cta': {'title': 'X'}})
        self.client.delete(f'{BASE}/manage/home/')
        history = self.client.get(f'{BASE}/manage/home/history/').data
        self.assertEqual([h['action'] for h in history], ['reset', 'saved', 'saved'])
        self.assertEqual(history[1]['changed'], ['cta', 'hero'])
        self.assertEqual(history[1]['user_name'], 'admin@example.com')

    def test_resetting_an_untouched_page_adds_nothing(self):
        self.client.delete(f'{BASE}/manage/home/')
        self.assertEqual(self.client.get(f'{BASE}/manage/home/history/').data, [])

    def test_restore_puts_an_earlier_version_back(self):
        self.save('about', {'hero': {'title': 'First'}})
        self.save('about', {'hero': {'title': 'Second'}})
        oldest = self.client.get(f'{BASE}/manage/about/history/').data[-1]
        resp = self.client.post(f'{BASE}/manage/about/restore/{oldest["id"]}/')
        self.assertEqual(resp.status_code, 200)
        self.assertEqual(PageContent.objects.get(slug='about').data, {'hero': {'title': 'First'}})
        self.assertEqual(self.client.get(f'{BASE}/manage/about/history/').data[0]['action'], 'restored')

    def test_a_revision_of_another_page_cannot_be_restored_here(self):
        self.save('home', {'a': 'b'})
        revision = self.client.get(f'{BASE}/manage/home/history/').data[0]
        self.assertEqual(self.client.post(f'{BASE}/manage/about/restore/{revision["id"]}/').status_code, 404)

    def test_only_the_newest_thirty_are_kept(self):
        for n in range(35):
            self.save('team', {'n': n})
        self.assertEqual(len(self.client.get(f'{BASE}/manage/team/history/').data), 30)

    def test_history_is_admin_only(self):
        self.save('home', {'a': 'b'})
        revision_id = self.client.get(f'{BASE}/manage/home/history/').data[0]['id']
        self.client.force_authenticate(None)
        self.assertEqual(self.client.get(f'{BASE}/manage/home/history/').status_code, 401)
        student = User.objects.create_user(email='s@example.com', password='Str0ng!Pass', role=User.STUDENT, is_verified=True)
        self.client.force_authenticate(student)
        self.assertEqual(self.client.get(f'{BASE}/manage/home/history/').status_code, 403)
        self.assertEqual(self.client.post(f'{BASE}/manage/home/restore/{revision_id}/').status_code, 403)

    def test_sign_in_page_content_is_editable(self):
        self.assertEqual(self.save('accounts', {'login': {'title': 'Welcome'}}).status_code, 200)
        self.client.force_authenticate(None)
        self.assertEqual(self.client.get(f'{BASE}/accounts/').data['data']['login']['title'], 'Welcome')
