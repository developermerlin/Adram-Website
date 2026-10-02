"""Anti-sharing: concurrent video streams per account, taking over, and the watermark."""
from django.core.cache import cache
from rest_framework.test import APIClient
from rest_framework_simplejwt.tokens import RefreshToken

from .models import LmsSettings
from .tests import API, LmsCase


class StreamTests(LmsCase):
    def setUp(self):
        super().setUp()
        cache.clear()
        self.enroll()
        LmsSettings.objects.update_or_create(pk=1, defaults={'max_streams': 1})

    def device(self, sid):
        from accounts.models import UserSession
        UserSession.objects.create(user=self.student, key=sid)
        token = RefreshToken.for_user(self.student)
        token['sid'] = sid
        client = APIClient()
        client.credentials(HTTP_AUTHORIZATION=f'Bearer {token.access_token}')
        return client

    def play(self, client, **extra):
        return client.post(f'{API}/lessons/{self.intro.id}/progress/', {'position': 10, 'spent': 30, 'playing': True, **extra}, format='json').data['stream']

    def test_second_device_is_paused_and_can_take_over(self):
        phone, laptop = self.device('a' * 32), self.device('b' * 32)
        self.assertFalse(self.play(phone)['blocked'])
        blocked = self.play(laptop)
        self.assertEqual((blocked['blocked'], blocked['reason']), (True, 'too_many'))
        self.assertFalse(self.play(laptop, take_over=True)['blocked'])
        self.assertEqual(self.play(phone)['reason'], 'taken_over')  # the phone now pauses
        # pausing frees the slot
        laptop.post(f'{API}/lessons/{self.intro.id}/progress/', {'spent': 5, 'playing': False}, format='json')
        self.assertTrue(self.play(phone)['blocked'])  # still taken over until it takes over back
        self.assertFalse(self.play(phone, take_over=True)['blocked'])

    def test_no_limit_and_watermark(self):
        LmsSettings.objects.filter(pk=1).update(max_streams=0)
        self.assertFalse(self.play(self.device('c' * 32))['blocked'])
        self.as_(self.student)
        self.assertEqual(self.client.get(f'{API}/lessons/{self.intro.id}/').data['watermark'], 'amina@example.com')
        LmsSettings.objects.filter(pk=1).update(watermark_videos=False)
        self.assertIsNone(self.client.get(f'{API}/lessons/{self.intro.id}/').data['watermark'])
