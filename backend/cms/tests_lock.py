"""Website lockdown: visitors can read but not act; administrators are never locked out."""
from django.contrib.auth import get_user_model
from django.core.cache import cache
from rest_framework.test import APITestCase

from accounts.views import tokens_for

User = get_user_model()
LOCK = '/api/v1/content/lock/'
MANAGE = '/api/v1/content/lock/manage/'


class SiteLockTests(APITestCase):
    @classmethod
    def setUpTestData(cls):
        cls.admin = User.objects.create_user(email='admin@example.com', password='Str0ng!Pass', role=User.ADMIN, is_verified=True)
        cls.student = User.objects.create_user(email='student@example.com', password='Str0ng!Pass', role=User.STUDENT, is_verified=True)

    def setUp(self):
        cache.clear()

    def tearDown(self):
        cache.clear()  # the lock is cached: don't leave the next tests in a locked site

    def as_(self, user):
        # A real token: the lock is checked before DRF authenticates, so force_authenticate would not be seen
        self.client.credentials(HTTP_AUTHORIZATION=f'Bearer {tokens_for(user)["access"]}' if user else '')

    def lock(self, message='Back at 6 PM'):
        self.as_(self.admin)
        resp = self.client.put(MANAGE, {'locked': True, 'message': message}, format='json')
        self.assertEqual(resp.status_code, 200)
        self.assertEqual(resp.data['updated_by_name'], 'admin@example.com')

    def contact(self):
        return self.client.post('/api/contact/', {'name': 'Ama', 'email': 'ama@example.com', 'subject': 'Hi', 'message': 'Hello there, a question.'}, format='json')

    def test_unlocked_by_default(self):
        self.assertEqual(self.client.get(LOCK).data['locked'], False)
        self.assertNotEqual(self.contact().status_code, 423)

    def test_visitors_and_students_cannot_act_while_locked(self):
        self.lock()
        self.as_(None)
        state = self.client.get(LOCK).data
        self.assertEqual((state['locked'], state['message']), (True, 'Back at 6 PM'))
        resp = self.contact()
        self.assertEqual((resp.status_code, resp.json()['code'], resp.json()['detail']), (423, 'site_locked', 'Back at 6 PM'))
        self.assertEqual(self.client.post('/api/v1/auth/register/', {'email': 'new@example.com'}, format='json').status_code, 423)
        self.assertEqual(self.client.get('/api/v1/content/home/').status_code, 200)  # reading still works
        self.as_(self.student)
        self.assertEqual(self.client.patch('/api/v1/auth/profile/update/', {'first_name': 'X'}, format='json').status_code, 423)
        self.assertEqual(self.client.put(MANAGE, {'locked': False}, format='json').status_code, 403)  # only admins unlock

    def test_admins_keep_working_and_can_sign_in(self):
        self.lock()
        self.as_(None)
        self.assertNotEqual(self.client.post('/api/v1/auth/login/', {'email': 'admin@example.com', 'password': 'Str0ng!Pass'}, format='json').status_code, 423)
        self.as_(self.admin)
        self.assertEqual(self.client.put('/api/v1/content/manage/home/', {'data': {'hero': {'title': 'Hi'}}}, format='json').status_code, 200)
        self.assertNotEqual(self.contact().status_code, 423)

    def test_unlocking_opens_the_site_again(self):
        self.lock('')
        self.assertEqual(self.client.get(LOCK).data['message'][:30], 'The website is temporarily loc')  # default message
        self.client.put(MANAGE, {'locked': False}, format='json')
        self.as_(None)
        self.assertEqual(self.client.get(LOCK).data['locked'], False)
        self.assertNotEqual(self.contact().status_code, 423)
