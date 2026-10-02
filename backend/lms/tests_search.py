"""Searching the catalogue: suggestions, typo correction, trending, recent, popular and saved searches."""
from django.core.cache import cache
from django.utils import timezone
from rest_framework.test import APIClient

from catalog.models import Course

from .models import CourseViewDay, SavedSearch, SearchQuery
from .tests import API, LmsCase


class SearchTests(LmsCase):
    def setUp(self):
        super().setUp()
        cache.clear()
        Course.objects.filter(pk=self.course.pk).update(topics=['JavaScript', 'HTML'], subtitle='Build websites from scratch')
        self.python = Course.objects.create(slug='python', title='Python for Beginners', summary='Start coding with Python.', is_published=True)

    def test_suggestions_while_typing(self):
        data = self.client.get(f'{API}/search/suggest/?q=web').data
        slugs = [c['slug'] for c in data['courses']]
        self.assertEqual((slugs[0], 'python' in slugs), ('web', False))  # title matches first
        self.assertEqual(self.client.get(f'{API}/search/suggest/?q=java').data['topics'][0], {'label': 'JavaScript', 'kind': 'topic', 'params': {'q': 'JavaScript', 'topic': 'javascript'}})
        miss = self.client.get(f'{API}/search/suggest/?q=pyhton').data
        self.assertEqual((miss['courses'], miss['did_you_mean']), ([], 'python'))

    def test_a_misspelt_search_shows_the_corrected_results(self):
        data = self.client.get(f'{API}/catalog/?q=devlopment').data
        self.assertEqual((data['showing_for'], data['searched_for']), ('development', 'devlopment'))
        self.assertIn('web', [c['slug'] for c in data['results']])
        exact = self.client.get(f'{API}/catalog/?q=python').data
        self.assertEqual((exact['results'][0]['slug'], exact['showing_for']), ('python', None))  # spelt right: no correction
        self.assertEqual(self.client.get(f'{API}/catalog/?q=zzzzqqq').data['count'], 0)

    def test_recent_and_popular_searches(self):
        self.as_(self.student)
        for q in ('python', 'web', 'python'):
            self.client.get(f'{API}/catalog/', {'q': q})
        empty = self.client.get(f'{API}/search/suggest/').data
        self.assertEqual(empty['recent'], ['python', 'web'])  # newest first, no repeats
        self.assertIn('python', empty['popular'])
        self.assertEqual(self.client.delete(f'{API}/me/searches/').status_code, 204)
        self.assertEqual(self.client.get(f'{API}/me/searches/').data, [])
        self.assertFalse(SearchQuery.objects.filter(user=self.student).exists())

    def test_saved_searches(self):
        self.assertEqual(self.client.post(f'{API}/me/saved-searches/', {'params': {'q': 'web'}}, format='json').status_code, 401)
        self.as_(self.student)
        made = self.client.post(f'{API}/me/saved-searches/', {'params': {'q': 'web', 'price': 'free', 'hack': 'x'}}, format='json')
        self.assertEqual((made.status_code, made.data['name'], made.data['params']), (201, 'web', {'q': 'web', 'price': 'free'}))
        self.assertEqual(self.client.post(f'{API}/me/saved-searches/', {'params': {}}, format='json').status_code, 400)
        self.assertEqual([s['name'] for s in self.client.get(f'{API}/search/suggest/').data['saved']], ['web'])
        self.as_(self.other)
        self.assertEqual(self.client.delete(f'{API}/me/saved-searches/{made.data["id"]}/').status_code, 404)  # someone else's
        self.as_(self.student)
        self.assertEqual(self.client.delete(f'{API}/me/saved-searches/{made.data["id"]}/').status_code, 204)
        self.assertFalse(SavedSearch.objects.exists())

    def test_trending_courses(self):
        CourseViewDay.objects.create(course=self.python, date=timezone.now().date(), views=12)
        CourseViewDay.objects.create(course=self.course, date=timezone.now().date(), views=2)  # too quiet to trend
        cache.clear()
        rows = APIClient().get(f'{API}/catalog/home/').data
        self.assertEqual([c['slug'] for c in rows['trending']], ['python'])
        cards = {c['slug']: c['trending'] for c in self.client.get(f'{API}/catalog/?page_size=60').data['results']}
        self.assertEqual((cards['python'], cards['web']), (True, False))
        self.assertEqual(self.client.get(f'{API}/catalog/?sort=trending').data['results'][0]['slug'], 'python')


class TopicPageTests(LmsCase):
    def setUp(self):
        super().setUp()
        cache.clear()
        Course.objects.filter(pk=self.course.pk).update(topics=['HTML, CSS & JavaScript', 'Git'], caption_languages=['French', 'Krio'],
                                                         promo_video_url='https://youtu.be/dQw4w9WgXcQ')
        Course.objects.create(slug='git-basics', title='Git Basics', summary='Version control.', is_published=True, topics=['Git'])

    def test_topic_pages(self):
        topics = {t['slug']: t for t in self.client.get(f'{API}/topics/').data}
        self.assertEqual((topics['git']['count'], topics['html-css-javascript']['name']), (2, 'HTML, CSS & JavaScript'))
        page = self.client.get(f'{API}/topics/git/').data
        self.assertEqual((page['name'], sorted(c['slug'] for c in page['courses'])), ('Git', ['git-basics', 'web']))
        self.assertIn('html-css-javascript', [r['slug'] for r in page['related']])
        self.assertEqual(self.client.get(f'{API}/topics/nothing-here/').status_code, 404)

    def test_cards_carry_topics_captions_and_trailer(self):
        card = next(c for c in self.client.get(f'{API}/catalog/?page_size=60').data['results'] if c['slug'] == 'web')
        self.assertEqual((card['caption_count'], card['topic_links'][1]), (2, {'name': 'Git', 'slug': 'git'}))
        self.assertTrue(card['promo_embed_url'].startswith('https://www.youtube'))
        page = self.client.get(f'{API}/courses/web/').data['course']
        self.assertEqual(page['topic_links'][0]['slug'], 'html-css-javascript')
