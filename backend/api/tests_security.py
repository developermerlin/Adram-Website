"""Request limits (api/throttling.py) and the sign-in lockout (accounts/views.py)."""
from django.contrib.auth import get_user_model
from django.core.cache import cache
from django.test import override_settings
from rest_framework.test import APITestCase

User = get_user_model()
LOGIN = '/api/v1/auth/login/'


class LoginLockoutTests(APITestCase):
    def setUp(self):
        cache.clear()
        self.addCleanup(cache.clear)
        self.user = User.objects.create_user(email='ama@example.com', password='Right-pass-2026', role=User.STUDENT, is_verified=True)

    @override_settings(LOGIN_MAX_FAILURES=3, LOGIN_LOCKOUT_MINUTES=15)
    def test_wrong_passwords_pause_sign_in(self):
        for _ in range(3):
            self.assertEqual(self.client.post(LOGIN, {'email': 'ama@example.com', 'password': 'nope'}, format='json').status_code, 401)
        # now even the right password waits, so guessing can't continue
        locked = self.client.post(LOGIN, {'email': 'AMA@example.com', 'password': 'Right-pass-2026'}, format='json')
        self.assertEqual((locked.status_code, locked.data['code']), (429, 'locked'))
        self.assertIn('wait 15 minutes', locked.data['detail'])
        self.assertIn('Retry-After', locked)
        # another account is not affected
        User.objects.create_user(email='sia@example.com', password='Other-pass-2026', role=User.STUDENT, is_verified=True)
        self.assertNotEqual(self.client.post(LOGIN, {'email': 'sia@example.com', 'password': 'Other-pass-2026'}, format='json').status_code, 429)

    @override_settings(LOGIN_MAX_FAILURES=3)
    def test_a_right_password_clears_the_count(self):
        for _ in range(2):
            self.client.post(LOGIN, {'email': 'ama@example.com', 'password': 'nope'}, format='json')
        self.assertNotEqual(self.client.post(LOGIN, {'email': 'ama@example.com', 'password': 'Right-pass-2026'}, format='json').status_code, 401)
        for _ in range(2):
            self.assertEqual(self.client.post(LOGIN, {'email': 'ama@example.com', 'password': 'nope'}, format='json').status_code, 401)

    @override_settings(LOGIN_MAX_FAILURES=3)
    def test_unknown_emails_are_limited_too(self):
        for _ in range(3):
            self.client.post(LOGIN, {'email': 'nobody@example.com', 'password': 'x'}, format='json')
        self.assertEqual(self.client.post(LOGIN, {'email': 'nobody@example.com', 'password': 'x'}, format='json').status_code, 429)


class RequestLimitTests(APITestCase):
    def setUp(self):
        cache.clear()
        self.addCleanup(cache.clear)

    def test_contact_form_is_limited_with_a_clear_message(self):
        rates = {'anon': '1000/min', 'forms': '2/hour'}
        form = {'name': 'Ama', 'email': 'ama@example.com', 'subject': 'Website', 'message': 'We need a new website for our school.'}
        with override_settings(API_THROTTLING=True, API_RATES=rates):
            codes = [self.client.post('/api/contact/', form, format='json').status_code for _ in range(3)]
            third = self.client.post('/api/contact/', form, format='json')
        self.assertEqual(codes[:2], [201, 201])
        self.assertEqual(third.status_code, 429)
        self.assertEqual(third.data['code'], 'rate_limited')
        self.assertIn('Please wait', third.data['detail'])

    def test_limits_are_off_in_tests_and_can_be_switched_off(self):
        form = {'name': 'Ama', 'email': 'ama@example.com', 'subject': 'Website', 'message': 'We need a new website for our school.'}
        with override_settings(API_THROTTLING=False, API_RATES={'forms': '1/hour', 'anon': '1/hour'}):
            for _ in range(3):
                self.assertEqual(self.client.post('/api/contact/', form, format='json').status_code, 201)

    def test_visitors_have_an_overall_ceiling_but_signed_in_people_do_not(self):
        with override_settings(API_THROTTLING=True, API_RATES={'anon': '3/min'}):
            codes = [self.client.get('/api/v1/team/members/').status_code for _ in range(4)]
            self.assertEqual(codes, [200, 200, 200, 429])
            user = User.objects.create_user(email='kofi@example.com', password='x-Pass-2026', role=User.STUDENT, is_verified=True)
            self.client.force_authenticate(user)
            self.assertEqual(self.client.get('/api/v1/team/members/').status_code, 200)
