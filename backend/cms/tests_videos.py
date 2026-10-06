import shutil
import tempfile

from django.contrib.auth import get_user_model
from django.core.files.uploadedfile import SimpleUploadedFile
from django.test import override_settings
from rest_framework.test import APITestCase

User = get_user_model()
V = '/api/v1/content/videos/'
MP4 = b'\x00\x00\x00\x18ftypmp42' + b'\x00' * 64
WEBM = b'\x1aE\xdf\xa3' + b'\x00' * 64


class SiteVideoTests(APITestCase):
    def setUp(self):
        self.media = tempfile.mkdtemp()
        self.addCleanup(shutil.rmtree, self.media, ignore_errors=True)
        self.admin = User.objects.create_user(email='admin@example.com', password='x', role=User.ADMIN, is_verified=True)
        self.student = User.objects.create_user(email='ama@example.com', password='x', role=User.STUDENT, is_verified=True)

    def test_upload_list_delete(self):
        with override_settings(MEDIA_ROOT=self.media):
            self.client.force_authenticate(self.admin)
            up = self.client.post(V, {'file': SimpleUploadedFile('Our Story.mp4', MP4)}, format='multipart')
            self.assertEqual(up.status_code, 201, up.data)
            self.assertIn('/media/site/videos/', up.data['url'])
            self.assertTrue(up.data['name'].endswith('our-story.mp4'))
            self.assertEqual(self.client.post(V, {'file': SimpleUploadedFile('clip.webm', WEBM)}, format='multipart').status_code, 201)
            self.assertEqual(len(self.client.get(V).data), 2)
            # fakes, wrong types and oversized files are refused
            self.assertEqual(self.client.post(V, {'file': SimpleUploadedFile('x.mp4', b'<html>' * 20)}, format='multipart').status_code, 400)
            self.assertEqual(self.client.post(V, {'file': SimpleUploadedFile('x.avi', MP4)}, format='multipart').status_code, 400)
            with override_settings(SITE_MAX_VIDEO_MB=0):
                self.assertEqual(self.client.post(V, {'file': SimpleUploadedFile('big.mp4', MP4)}, format='multipart').status_code, 400)
            self.assertEqual(self.client.delete(f'{V}{up.data["name"]}/').status_code, 204)
            self.assertEqual(len(self.client.get(V).data), 1)
            self.assertEqual(self.client.delete(f'{V}settings.py/').status_code, 404)
            # only administrators
            self.client.force_authenticate(self.student)
            self.assertEqual(self.client.get(V).status_code, 403)
            self.assertEqual(self.client.post(V, {'file': SimpleUploadedFile('a.mp4', MP4)}, format='multipart').status_code, 403)
