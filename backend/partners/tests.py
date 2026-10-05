from django.contrib.auth import get_user_model
from django.core import mail
from django.core.cache import cache
from django.test import override_settings
from rest_framework.test import APITestCase

from .models import Partner, PartnerApplication, PartnerGroup

User = get_user_model()
API = '/api/v1/partners'
APPLICATION = {'organisation': 'Sierra Net Ltd', 'contact_name': 'Fatmata Conteh', 'email': 'fatmata@sierranet.example',
               'website': 'sierranet.example', 'partnership_type': 'Technology', 'message': 'We would like to offer internships to your graduates.'}


@override_settings(EMAIL_BACKEND='django.core.mail.backends.locmem.EmailBackend', CONTACT_NOTIFY_EMAIL='team@example.com')
class PartnerTests(APITestCase):
    @classmethod
    def setUpTestData(cls):
        cls.admin = User.objects.create_user(email='admin@example.com', password='x', role=User.ADMIN, is_verified=True)
        cls.student = User.objects.create_user(email='student@example.com', password='x', role=User.STUDENT, is_verified=True)

    def setUp(self):
        cache.clear()

    def tearDown(self):
        cache.clear()

    def test_public_page_groups_and_spotlight(self):
        tech = PartnerGroup.objects.create(name='Technology partners', sort_order=0)
        PartnerGroup.objects.create(name='Empty group', sort_order=1)
        Partner.objects.create(name='Orange', group=tech, featured=True, quote='Great team.', quote_author='Ama')
        Partner.objects.create(name='Hidden', group=tech, visible=False)
        Partner.objects.create(name='Loose partner')
        data = self.client.get(f'{API}/').data
        self.assertEqual([g['name'] for g in data['groups']], ['Technology partners', ''])  # empty groups hidden, ungrouped last
        self.assertEqual([p['name'] for p in data['groups'][0]['partners']], ['Orange'])
        self.assertEqual((data['count'], [p['name'] for p in data['featured']]), (2, ['Orange']))

    def test_apply_saves_and_emails_both_sides(self):
        bad = self.client.post(f'{API}/apply/', {'organisation': '', 'contact_name': '', 'email': 'x', 'message': 'short'}, format='json')
        self.assertEqual(set(bad.data), {'organisation', 'contact_name', 'email', 'message'})
        resp = self.client.post(f'{API}/apply/', APPLICATION, format='json')
        self.assertEqual(resp.status_code, 201)
        app = PartnerApplication.objects.get()
        self.assertEqual((app.website, app.status), ('https://sierranet.example', 'new'))
        team, applicant = mail.outbox
        self.assertEqual((team.to, team.reply_to), (['team@example.com'], ['fatmata@sierranet.example']))
        self.assertIn('Sierra Net Ltd', team.subject)
        self.assertEqual(applicant.to, ['fatmata@sierranet.example'])
        self.assertIn('offer internships', applicant.body)

    def test_bots_and_limits(self):
        self.client.post(f'{API}/apply/', {**APPLICATION, 'company_site': 'spam'}, format='json')
        self.assertEqual(PartnerApplication.objects.count(), 0)
        for _ in range(4):
            self.client.post(f'{API}/apply/', APPLICATION, format='json')
        self.assertEqual(self.client.post(f'{API}/apply/', APPLICATION, format='json').status_code, 429)

    def test_admin_manages_partners_groups_and_applications(self):
        self.client.force_authenticate(self.student)
        self.assertEqual(self.client.get(f'{API}/manage/partners/').status_code, 403)
        self.client.force_authenticate(self.admin)
        group = self.client.post(f'{API}/manage/groups/', {'name': 'Education partners'}, format='json').data
        self.assertEqual(self.client.post(f'{API}/manage/groups/', {'name': 'education partners'}, format='json').status_code, 400)
        bad = self.client.post(f'{API}/manage/partners/', {'name': '', 'logo': 'javascript:x', 'featured': True, 'since': 'soon'}, format='json')
        self.assertEqual(set(bad.data), {'name', 'logo', 'quote', 'since'})
        a = self.client.post(f'{API}/manage/partners/', {'name': 'Fourah Bay College', 'website': 'fbc.example', 'group_id': group['id'], 'since': 2021}, format='json').data
        b = self.client.post(f'{API}/manage/partners/', {'name': 'Njala University'}, format='json').data
        self.assertEqual((a['website'], a['group'], a['since']), ('https://fbc.example', 'Education partners', 2021))
        self.client.post(f'{API}/manage/partners/reorder/', {'ids': [b['id'], a['id']]}, format='json')
        self.assertEqual([p['name'] for p in self.client.get(f'{API}/manage/partners/').data], ['Njala University', 'Fourah Bay College'])
        self.client.patch(f'{API}/manage/partners/{b["id"]}/', {'visible': False}, format='json')
        self.assertEqual(self.client.get(f'{API}/').data['count'], 1)
        self.client.delete(f'{API}/manage/groups/{group["id"]}/')
        self.assertIsNone(Partner.objects.get(pk=a['id']).group)  # the partner stays

        app = PartnerApplication.objects.create(organisation='X', contact_name='Y', email='y@example.com', message='m' * 30)
        updated = self.client.patch(f'{API}/manage/applications/{app.id}/', {'status': 'contacted', 'notes': 'Called on Monday'}, format='json').data
        self.assertEqual((updated['status'], updated['notes']), ('contacted', 'Called on Monday'))
        listing = self.client.get(f'{API}/manage/applications/', {'status': 'contacted'}).data
        self.assertEqual((len(listing['results']), listing['counts']['contacted']), (1, 1))
