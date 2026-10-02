"""Mobile apps: push devices and sending, app configuration, ETags, and offline licences."""
from datetime import timedelta
from unittest.mock import patch

from django.core.files.uploadedfile import SimpleUploadedFile
from django.test import override_settings
from django.utils import timezone

from portal.models import TrainingEnrollment

from .models import Lesson, LmsSettings, OfflineLicence, PushDevice
from .notify import notify
from .tests import API, LmsCase


@override_settings(PUSH_SYNC=True)
class PushTests(LmsCase):
    def test_register_and_push(self):
        self.as_(self.student)
        self.assertEqual(self.client.post(f'{API}/me/devices/', {'token': ''}, format='json').status_code, 400)
        self.client.post(f'{API}/me/devices/', {'token': 'ExponentPushToken[abc]', 'platform': 'android', 'app_version': '1.0.0'}, format='json')
        self.client.post(f'{API}/me/devices/', {'token': 'ExponentPushToken[old]'}, format='json')
        tickets = [{'status': 'ok'}, {'status': 'error', 'details': {'error': 'DeviceNotRegistered'}}]
        with patch('lms.mobile._post_expo', return_value=tickets) as sent:
            notify(self.student, 'system', 'Hello', 'From the app test', '/student/learning')
        messages = sent.call_args[0][0]
        self.assertEqual({m['to'] for m in messages}, {'ExponentPushToken[abc]', 'ExponentPushToken[old]'})
        self.assertEqual(messages[0]['data'], {'link': '/student/learning'})
        self.assertEqual(list(PushDevice.objects.values_list('token', flat=True)), ['ExponentPushToken[abc]'])  # the dead one is forgotten
        # switched off, or no devices: nothing is sent
        LmsSettings.objects.filter(pk=1).update(push_enabled=False)
        with patch('lms.mobile._post_expo') as sent:
            notify(self.student, 'system', 'Quiet')
        sent.assert_not_called()

    def test_token_moves_to_new_owner_and_can_be_removed(self):
        self.as_(self.student)
        self.client.post(f'{API}/me/devices/', {'token': 'ExponentPushToken[shared]'}, format='json')
        self.as_(self.other)
        self.client.post(f'{API}/me/devices/', {'token': 'ExponentPushToken[shared]'}, format='json')
        self.assertEqual(PushDevice.objects.get().user, self.other)
        self.client.delete(f'{API}/me/devices/', {'token': 'ExponentPushToken[shared]'}, format='json')
        self.assertFalse(PushDevice.objects.exists())

    def test_push_failure_never_breaks_notifications(self):
        PushDevice.objects.create(user=self.student, token='ExponentPushToken[x]')
        with patch('lms.mobile._post_expo', side_effect=OSError('offline')):
            notify(self.student, 'system', 'Still saved')
        self.assertTrue(self.student.lms_notifications.filter(title='Still saved').exists())


class AppConfigTests(LmsCase):
    def test_config_and_etag(self):
        LmsSettings.objects.update_or_create(pk=1, defaults={'app_min_version': '1.2.0'})
        resp = self.client.get(f'{API}/app/config/')
        self.assertEqual((resp.data['min_app_version'], resp.data['api_version']), ('1.2.0', 'v1'))
        self.assertIn('offline', resp.data['features'])
        etag = resp['ETag']
        self.assertEqual(self.client.get(f'{API}/app/config/', HTTP_IF_NONE_MATCH=etag).status_code, 304)  # unchanged: nothing to send


class OfflineTests(LmsCase):
    def setUp(self):
        super().setUp()
        self.doc = Lesson.objects.create(section=self.section, title='Handout', kind=Lesson.DOCUMENT, sort_order=9, is_published=True,
                                         document_file=SimpleUploadedFile('handout.pdf', b'%PDF-1.4'), document_name='handout.pdf')

    def test_save_check_in_and_lose_access(self):
        self.as_(self.student)
        self.assertEqual(self.client.post(f'{API}/lessons/{self.doc.id}/offline/', {'device_id': 'phone-1'}, format='json').status_code, 403)
        enrollment = self.enroll()
        data = self.client.post(f'{API}/lessons/{self.doc.id}/offline/', {'device_id': 'phone-1'}, format='json').data
        self.assertEqual(data['files'][0]['kind'], 'document')
        self.assertEqual(self.client.get(data['files'][0]['url']).status_code, 200)
        # YouTube lessons can't be saved
        self.assertEqual(self.client.post(f'{API}/lessons/{self.intro.id}/offline/', {'device_id': 'phone-1'}, format='json').data['code'], 'not_saveable')
        OfflineLicence.objects.update(expires_at=timezone.now() + timedelta(days=1))
        renewed = self.client.post(f'{API}/me/offline/check-in/', {'device_id': 'phone-1'}, format='json').data
        self.assertEqual((len(renewed['keep']), renewed['remove_lessons']), (1, []))
        self.assertGreater(OfflineLicence.objects.get().expires_at, timezone.now() + timedelta(days=29))
        # access ends (e.g. a refund): the next check-in says delete it
        enrollment.status = TrainingEnrollment.CANCELLED
        enrollment.save()
        gone = self.client.post(f'{API}/me/offline/check-in/', {'device_id': 'phone-1'}, format='json').data
        self.assertEqual(gone['remove_lessons'], [self.doc.id])
        self.assertEqual(self.client.get(f'{API}/me/offline/').data, [])

    def test_device_limit(self):
        LmsSettings.objects.update_or_create(pk=1, defaults={'offline_devices': 2})
        self.as_(self.student)
        self.enroll()
        for device in ('a', 'b'):
            self.assertEqual(self.client.post(f'{API}/lessons/{self.doc.id}/offline/', {'device_id': device}, format='json').status_code, 201)
        third = self.client.post(f'{API}/lessons/{self.doc.id}/offline/', {'device_id': 'c'}, format='json').data
        self.assertEqual((third['code'], third['devices']), ('device_limit', ['a', 'b']))
        lic = OfflineLicence.objects.get(device_id='a')
        self.client.delete(f'{API}/me/offline/{lic.id}/')
        self.assertEqual(self.client.post(f'{API}/lessons/{self.doc.id}/offline/', {'device_id': 'c'}, format='json').status_code, 201)
