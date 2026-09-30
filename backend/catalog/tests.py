from django.test import TestCase
from rest_framework.test import APIClient

from accounts.models import User
from .models import Course, Scholarship

BASE = '/api/v1/catalog'


def make_user(role, email=None):
    return User.objects.create_user(
        email=email or f'{role.lower()}@example.com', password='Passw0rd!', first_name='Ama', last_name='Kamara',
        role=role, approval_status=User.APPROVED, is_verified=True,
    )


def scholarship_payload(**overrides):
    return {
        'name': 'Test Award', 'provider': 'Test Foundation', 'country': 'gb', 'levels': ['PhD', 'Masters'],
        'funding': 'full', 'summary': 'A test scholarship.', 'url': 'https://example.com/award',
        'covers': ['Tuition', '  ', 'Flights'], 'eligibility': [], 'steps': ['Apply online'], **overrides,
    }


class SeedDataTests(TestCase):
    def test_migration_loads_the_existing_website_content(self):
        self.assertEqual(Scholarship.objects.filter(is_published=True).count(), 11)
        self.assertEqual(Course.objects.filter(is_published=True).count(), 13)
        chevening = Scholarship.objects.get(slug='chevening')
        self.assertEqual(chevening.levels, ['Masters'])
        self.assertTrue(chevening.application_window.startswith('Applications typically open'))


class PublicCatalogTests(TestCase):
    def setUp(self):
        self.client = APIClient()
        Scholarship.objects.filter(slug='daad').update(is_published=False)

    def test_lists_only_published_items_in_order(self):
        resp = self.client.get(f'{BASE}/scholarships/')
        self.assertEqual(resp.status_code, 200)
        slugs = [s['slug'] for s in resp.data]
        self.assertNotIn('daad', slugs)
        self.assertEqual(slugs[0], 'chevening')
        self.assertEqual(resp.data[0]['country_name'], 'United Kingdom')
        self.assertEqual(len(self.client.get(f'{BASE}/courses/').data), 13)

    def test_drafts_are_hidden_from_visitors_but_previewable_by_editors(self):
        self.assertEqual(self.client.get(f'{BASE}/scholarships/daad/').status_code, 404)
        self.client.force_authenticate(make_user(User.STUDENT))
        self.assertEqual(self.client.get(f'{BASE}/scholarships/daad/').status_code, 404)
        self.client.force_authenticate(make_user(User.SCHOLARSHIP_MANAGER))
        resp = self.client.get(f'{BASE}/scholarships/daad/')
        self.assertEqual(resp.status_code, 200)
        self.assertFalse(resp.data['is_published'])


class RestrictionTests(TestCase):
    def setUp(self):
        self.client = APIClient()
        Scholarship.objects.filter(slug='chevening').update(members_only=True)
        Scholarship.objects.filter(slug='fulbright').update(hide_official_link=True)

    def test_members_only_details_are_not_sent_to_visitors(self):
        data = self.client.get(f'{BASE}/scholarships/chevening/').data
        self.assertTrue(data['locked'])
        self.assertEqual((data['eligibility'], data['steps'], data['url']), ([], [], None))
        self.assertTrue(data['summary'])  # the teaser stays public
        listed = next(s for s in self.client.get(f'{BASE}/scholarships/').data if s['slug'] == 'chevening')
        self.assertIsNone(listed['url'])

        self.client.force_authenticate(make_user(User.STUDENT))
        data = self.client.get(f'{BASE}/scholarships/chevening/').data
        self.assertFalse(data['locked'])
        self.assertTrue(data['eligibility'])
        self.assertTrue(data['url'])

    def test_official_links_are_only_sent_to_signed_in_users(self):
        data = self.client.get(f'{BASE}/scholarships/daad/').data
        self.assertEqual((data['url'], data['link_locked']), (None, True))
        self.assertTrue(data['eligibility'])  # not members-only: details stay public
        self.client.force_authenticate(make_user(User.STUDENT))
        data = self.client.get(f'{BASE}/scholarships/daad/').data
        self.assertEqual(data['link_locked'], False)
        self.assertTrue(data['url'].startswith('https://'))

    def test_hidden_official_link_is_never_sent_publicly(self):
        self.assertIsNone(self.client.get(f'{BASE}/scholarships/fulbright/').data['url'])
        self.client.force_authenticate(make_user(User.ADMIN))
        self.assertIsNone(self.client.get(f'{BASE}/scholarships/fulbright/').data['url'])
        # ...but editors still see and edit it in the portal.
        pk = Scholarship.objects.get(slug='fulbright').pk
        self.assertTrue(self.client.get(f'{BASE}/manage/scholarships/{pk}/').data['url'])


class ManageCatalogTests(TestCase):
    def setUp(self):
        self.client = APIClient()
        self.admin = make_user(User.ADMIN)
        self.client.force_authenticate(self.admin)

    def test_create_generates_slug_cleans_lists_and_appends_to_the_end(self):
        resp = self.client.post(f'{BASE}/manage/scholarships/', scholarship_payload(), format='json')
        self.assertEqual(resp.status_code, 201, resp.data)
        self.assertEqual(resp.data['slug'], 'test-award')
        self.assertEqual(resp.data['levels'], ['Masters', 'PhD'])
        self.assertEqual(resp.data['covers'], ['Tuition', 'Flights'])
        self.assertFalse(resp.data['is_published'])  # drafts by default
        self.assertEqual(resp.data['updated_by_name'], 'Ama Kamara')
        self.assertGreater(resp.data['sort_order'], Scholarship.objects.exclude(slug='test-award').latest('sort_order').sort_order)
        # Same name again gets a unique address.
        again = self.client.post(f'{BASE}/manage/scholarships/', scholarship_payload(), format='json')
        self.assertEqual(again.data['slug'], 'test-award-2')

    def test_timeline_and_service_settings(self):
        resp = self.client.post(f'{BASE}/manage/scholarships/', scholarship_payload(
            timeline=[{'label': 'Applications open', 'date': '2026-08-05'}, {'label': 'Results', 'text': 'Typically June'}],
            service_fee='Free', service_requirements=['Passport copy', ' '], service_cutoff='2026-10-01',
        ), format='json')
        self.assertEqual(resp.status_code, 201, resp.data)
        self.assertEqual(resp.data['timeline'], [
            {'label': 'Applications open', 'date': '2026-08-05', 'text': ''},
            {'label': 'Results', 'date': None, 'text': 'Typically June'},
        ])
        self.assertEqual(resp.data['service_requirements'], ['Passport copy'])
        bad = self.client.post(f'{BASE}/manage/scholarships/', scholarship_payload(timeline=[{'label': 'Results'}]), format='json')
        self.assertIn('timeline', bad.data)

    def test_validation_errors(self):
        resp = self.client.post(f'{BASE}/manage/scholarships/', scholarship_payload(levels=[], country='xx', slug='chevening'), format='json')
        self.assertEqual(resp.status_code, 400)
        self.assertEqual(set(resp.data), {'levels', 'country', 'slug'})

    def test_publish_edit_and_delete(self):
        pk = Scholarship.objects.get(slug='daad').pk
        resp = self.client.patch(f'{BASE}/manage/scholarships/{pk}/', {'is_published': False}, format='json')
        self.assertFalse(resp.data['is_published'])
        self.assertEqual(self.client.get(f'{BASE}/manage/scholarships/?published=false').data[0]['slug'], 'daad')
        self.assertEqual(self.client.delete(f'{BASE}/manage/scholarships/{pk}/').status_code, 204)
        self.assertFalse(Scholarship.objects.filter(pk=pk).exists())

    def test_reorder(self):
        ids = list(Course.objects.values_list('pk', flat=True))
        resp = self.client.post(f'{BASE}/manage/courses/reorder/', {'ids': ids[::-1]}, format='json')
        self.assertEqual(resp.data['updated'], len(ids))
        self.assertEqual(Course.objects.first().pk, ids[-1])

    def test_course_icon_must_be_a_brand_icon(self):
        resp = self.client.post(f'{BASE}/manage/courses/', {'title': 'Data', 'summary': 'x', 'icon': 'rocket'}, format='json')
        self.assertIn('icon', resp.data)

    def test_permissions(self):
        manager = APIClient()
        manager.force_authenticate(make_user(User.SCHOLARSHIP_MANAGER))
        self.assertEqual(manager.get(f'{BASE}/manage/scholarships/').status_code, 200)
        self.assertEqual(manager.get(f'{BASE}/manage/courses/').status_code, 403)
        student = APIClient()
        student.force_authenticate(make_user(User.STUDENT))
        self.assertEqual(student.get(f'{BASE}/manage/scholarships/').status_code, 403)
        self.assertEqual(APIClient().post(f'{BASE}/manage/courses/', {}, format='json').status_code, 401)


class CourseListWithoutLmsTablesTests(TestCase):
    def test_the_public_list_survives_missing_course_portal_tables(self):
        from django.db import DatabaseError
        from unittest import mock
        with mock.patch('lms.models.Lesson.objects') as manager:
            manager.filter.side_effect = DatabaseError('no such table: lms_lesson')
            resp = self.client.get(f'{BASE}/courses/')
        self.assertEqual(resp.status_code, 200)
        self.assertTrue(all(c['lesson_count'] == 0 for c in resp.data))
