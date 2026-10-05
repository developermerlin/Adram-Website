from datetime import timedelta

from django.contrib.auth import get_user_model
from django.core.cache import cache
from django.utils import timezone
from rest_framework.test import APITestCase

from cms.share import build_meta

from .models import Category, Post

User = get_user_model()
API = '/api/v1/blog'


class BlogTests(APITestCase):
    @classmethod
    def setUpTestData(cls):
        cls.admin = User.objects.create_user(email='admin@example.com', password='x', role=User.ADMIN, is_verified=True, first_name='Ada', last_name='Bangura')
        cls.student = User.objects.create_user(email='student@example.com', password='x', role=User.STUDENT, is_verified=True)
        cls.news = Category.objects.create(name='Company news', slug='company-news')
        cls.tips = Category.objects.create(name='Tech tips', slug='tech-tips')

    def setUp(self):
        cache.clear()

    def tearDown(self):
        cache.clear()

    def make(self, title, days_ago=1, status=Post.PUBLISHED, **extra):
        return Post.objects.create(title=title, slug=title.lower().replace(' ', '-'), body='Word ' * 500, status=status, author=self.admin,
                                   published_at=timezone.now() - timedelta(days=days_ago), **extra)

    def test_public_list_shows_only_live_posts(self):
        self.make('Old news', 5, category=self.news)
        top = self.make('Big launch', 3, category=self.news, featured=True, tags=['Launch', 'Web'])
        self.make('Wifi tips', 1, category=self.tips)
        self.make('Draft one', status=Post.DRAFT)
        self.make('Next week', days_ago=-7)  # scheduled
        data = self.client.get(f'{API}/posts/').data
        self.assertEqual(data['featured']['slug'], top.slug)
        self.assertEqual([p['title'] for p in data['results']], ['Wifi tips', 'Old news'])
        self.assertEqual(data['count'], 3)
        self.assertEqual(data['featured']['reading_minutes'], 3)  # 500 words
        self.assertEqual(data['featured']['author']['name'], 'Ada Bangura')
        self.assertEqual([p['title'] for p in self.client.get(f'{API}/posts/', {'category': 'company-news'}).data['results']], ['Big launch', 'Old news'])
        self.assertEqual(len(self.client.get(f'{API}/posts/', {'tag': 'Launch'}).data['results']), 1)
        self.assertEqual(len(self.client.get(f'{API}/posts/', {'q': 'wifi'}).data['results']), 1)
        cats = self.client.get(f'{API}/categories/').data
        self.assertEqual([(c['name'], c['count']) for c in cats], [('Company news', 2), ('Tech tips', 1)])

    def test_post_page(self):
        older = self.make('First post', 4, category=self.news)
        post = self.make('Second post', 3, category=self.news)
        newer = self.make('Third post', 2)
        self.assertEqual(self.client.get(f'{API}/posts/draft-one/').status_code, 404)
        data = self.client.get(f'{API}/posts/{post.slug}/').data
        self.assertEqual((data['older']['slug'], data['newer']['slug']), (older.slug, newer.slug))
        self.assertEqual(data['related'][0]['slug'], older.slug)  # same category first
        self.client.get(f'{API}/posts/{post.slug}/')
        post.refresh_from_db()
        self.assertEqual(post.views, 1)  # the same visitor counts once
        self.assertEqual(self.client.get(f'{API}/posts/{self.make("Later", -1).slug}/').status_code, 404)  # scheduled

    def test_admin_writes_schedules_and_publishes(self):
        self.client.force_authenticate(self.admin)
        self.assertEqual(self.client.post(f'{API}/manage/posts/', {'title': ''}, format='json').status_code, 400)
        draft = self.client.post(f'{API}/manage/posts/', {'title': 'Hello Freetown!', 'tags': 'web, Web, design ,', 'author_id': '',
                                                          'category_id': self.tips.id}, format='json').data
        self.assertEqual((draft['slug'], draft['state'], draft['tags'], draft['category']['name']), ('hello-freetown', 'draft', ['web', 'design'], 'Tech tips'))
        self.assertEqual(draft['author']['name'], 'Ada Bangura')  # the writer, even though no author was picked
        again = self.client.post(f'{API}/manage/posts/', {'title': 'Hello Freetown'}, format='json').data
        self.assertEqual(again['slug'], 'hello-freetown-2')
        url = f'{API}/manage/posts/{draft["id"]}/'
        self.assertEqual(self.client.patch(url, {'status': 'published'}, format='json').data, {'body': 'Write the post before publishing it.'})
        self.assertEqual(self.client.patch(url, {'slug': 'hello-freetown-2'}, format='json').status_code, 400)

        soon = (timezone.now() + timedelta(days=2)).isoformat()
        scheduled = self.client.patch(url, {'body': '## Intro\n\nHello.', 'status': 'published', 'published_at': soon}, format='json').data
        self.assertEqual(scheduled['state'], 'scheduled')
        self.assertEqual(self.client.get(f'{API}/posts/hello-freetown/').status_code, 404)
        live = self.client.patch(url, {'published_at': timezone.now().isoformat()}, format='json').data
        self.assertEqual(live['state'], 'published')
        self.assertEqual(self.client.get(f'{API}/posts/hello-freetown/').status_code, 200)
        listing = self.client.get(f'{API}/manage/posts/', {'status': 'draft'}).data
        self.assertEqual((listing['counts']['published'], listing['counts']['draft'], len(listing['results'])), (1, 1, 1))
        self.assertEqual(self.client.patch(url, {'status': 'draft'}, format='json').data['state'], 'draft')  # unpublish

    def test_categories_and_permissions(self):
        self.client.force_authenticate(self.student)
        self.assertEqual(self.client.get(f'{API}/manage/posts/').status_code, 403)
        self.client.force_authenticate(self.admin)
        made = self.client.post(f'{API}/manage/categories/', {'name': 'Scholarships'}, format='json').data
        self.assertEqual(made['slug'], 'scholarships')
        self.assertEqual(self.client.post(f'{API}/manage/categories/', {'name': 'scholarships'}, format='json').status_code, 400)
        post = self.make('Study abroad', category_id=made['id'])
        self.client.patch(f'{API}/manage/categories/{made["id"]}/', {'name': 'Study abroad'}, format='json')
        self.assertEqual(Category.objects.get(pk=made['id']).name, 'Study abroad')
        self.client.delete(f'{API}/manage/categories/{made["id"]}/')
        post.refresh_from_db()
        self.assertIsNone(post.category)  # the post stays
        self.assertTrue(any(a['name'] == 'Ada Bangura' for a in self.client.get(f'{API}/manage/authors/').data))

    def test_link_preview_for_a_post(self):
        self.make('Big launch', seo_description='We opened a new office.', cover='/media/site/launch.jpg')
        meta = build_meta('/blog/big-launch')
        self.assertEqual((meta['title'], meta['description'], meta['image']), ('Big launch | ADRAM Technologies', 'We opened a new office.', '/media/site/launch.jpg'))
        self.assertNotIn('image', build_meta('/blog/unknown'))



class FeedbackTests(APITestCase):
    def test_helpful_votes(self):
        from django.core.cache import cache
        from django.utils import timezone
        from rest_framework.test import APIClient
        from .models import Post
        cache.clear()
        post = Post.objects.create(title='Hello', slug='hello', body='x', status='published', published_at=timezone.now())
        c = APIClient()
        url = '/api/v1/blog/posts/hello/feedback/'
        self.assertEqual(c.post(url, {'helpful': 'yes'}, format='json').status_code, 400)
        self.assertEqual(c.post(url, {'helpful': True}, format='json').data, {'yes': 1, 'no': 0, 'vote': True})
        self.assertEqual(c.post(url, {'helpful': True}, format='json').data['yes'], 1)  # once per reader
        self.assertEqual(c.post(url, {'helpful': False}, format='json').data, {'yes': 0, 'no': 1, 'vote': False})  # changed
        detail = c.get('/api/v1/blog/posts/hello/').data
        self.assertEqual((detail['helpful'], detail['views']), ({'yes': 0, 'no': 1}, 1))
        cache.clear()
