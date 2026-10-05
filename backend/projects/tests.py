from django.contrib.auth import get_user_model
from rest_framework.test import APITestCase

from .models import Project

User = get_user_model()
P = '/api/v1/projects'


class ProjectsTests(APITestCase):
    def setUp(self):
        self.admin = User.objects.create_user(email='admin@example.com', password='x', role=User.ADMIN, is_verified=True)
        self.student = User.objects.create_user(email='ama@example.com', password='x', role=User.STUDENT, is_verified=True)

    def make(self, **extra):
        self.client.force_authenticate(self.admin)
        data = {'title': 'School portal for St Edward’s', 'summary': 'Online admissions and results for 1,200 pupils.', 'status': 'published',
                'service': 'web-development', 'client': 'St Edward’s Secondary School', **extra}
        res = self.client.post(f'{P}/manage/', data, format='json')
        self.client.force_authenticate(None)
        return res

    def test_admin_creates_and_the_public_sees_only_published(self):
        res = self.make(technologies=['React', 'Django', 'react', ''], results=[{'value': '60%', 'label': 'less paperwork'}],
                        gallery=[{'src': '/media/site/a.jpg', 'caption': 'Dashboard'}], completed_on='2026-03-14', live_url='stedwards.edu.sl')
        self.assertEqual(res.status_code, 201, res.data)
        self.assertEqual(res.data['slug'], 'school-portal-for-st-edwards')
        self.assertEqual(res.data['technologies'], ['React', 'Django'])  # duplicates and blanks dropped
        self.assertEqual(res.data['live_url'], 'https://stedwards.edu.sl')
        self.make(title='Clinic records', summary='Patient records system.', status='draft')
        listing = self.client.get(f'{P}/').data['results']
        self.assertEqual([p['title'] for p in listing], ['School portal for St Edward’s'])
        self.assertEqual(listing[0]['year'], 2026)
        detail = self.client.get(f'{P}/school-portal-for-st-edwards/').data
        self.assertEqual((detail['client'], detail['results'][0]['value'], detail['gallery'][0]['caption']), ('St Edward’s Secondary School', '60%', 'Dashboard'))
        # a draft is hidden from visitors but an admin can preview it
        draft = Project.objects.get(title='Clinic records')
        self.assertEqual(self.client.get(f'{P}/{draft.slug}/').status_code, 404)
        self.client.force_authenticate(self.admin)
        self.assertTrue(self.client.get(f'{P}/{draft.slug}/').data['draft'])

    def test_related_projects_prefer_the_same_service(self):
        self.make()
        self.make(title='NGO website', summary='A site for an NGO.', service='web-development')
        self.make(title='Office network', summary='Cabling and Wi-Fi.', service='networking')
        related = self.client.get(f'{P}/school-portal-for-st-edwards/').data['related']
        self.assertEqual(related[0]['title'], 'NGO website')
        self.assertEqual(len(related), 2)

    def test_validation(self):
        self.client.force_authenticate(self.admin)
        bad = self.client.post(f'{P}/manage/', {'title': '', 'cover': 'javascript:alert(1)', 'results': [{'value': '5x'}],
                                                'completed_on': 'soon'}, format='json')
        self.assertEqual(bad.status_code, 400)
        self.assertEqual(set(bad.data['errors']), {'title', 'cover', 'results', 'completed_on'})
        needs_summary = self.client.post(f'{P}/manage/', {'title': 'X', 'status': 'published'}, format='json')
        self.assertIn('summary', needs_summary.data['errors'])
        # same title twice gets a different address
        self.client.post(f'{P}/manage/', {'title': 'Same'}, format='json')
        second = self.client.post(f'{P}/manage/', {'title': 'Same'}, format='json').data
        self.assertEqual(second['slug'], 'same-2')
        taken = self.client.patch(f'{P}/manage/{second["id"]}/', {'slug': 'same'}, format='json')
        self.assertIn('slug', taken.data['errors'])

    def test_order_edit_delete_and_permissions(self):
        a = self.make(title='First', summary='a').data
        b = self.make(title='Second', summary='b').data
        self.assertEqual([p['title'] for p in self.client.get(f'{P}/').data['results']], ['Second', 'First'])  # newest first
        self.client.force_authenticate(self.admin)
        self.client.post(f'{P}/manage/reorder/', {'ids': [a['id'], b['id']]}, format='json')
        self.assertEqual(self.client.patch(f'{P}/manage/{a["id"]}/', {'featured': True}, format='json').data['featured'], True)
        self.assertEqual(self.client.get(f'{P}/manage/').data['counts'], {'all': 2, 'published': 2, 'draft': 0, 'featured': 1})
        self.assertEqual([p['title'] for p in self.client.get(f'{P}/').data['results']], ['First', 'Second'])
        self.assertEqual(self.client.delete(f'{P}/manage/{b["id"]}/').status_code, 204)
        self.client.force_authenticate(self.student)
        self.assertEqual(self.client.get(f'{P}/manage/').status_code, 403)
        self.assertEqual(self.client.post(f'{P}/manage/', {'title': 'Hack'}, format='json').status_code, 403)

    def test_link_preview_and_chatbot_know_the_project(self):
        from chatbot.knowledge import build
        from cms.share import build_meta
        self.make(cover='/media/site/cover.jpg')
        meta = build_meta('/projects/school-portal-for-st-edwards')
        self.assertTrue(meta['title'].startswith('School portal for St Edward’s |'))
        self.assertEqual(meta['image'], '/media/site/cover.jpg')
        self.assertIn('/projects/school-portal-for-st-edwards', build())
