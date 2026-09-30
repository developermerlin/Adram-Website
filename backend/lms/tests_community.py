from django.core import mail

from .models import Announcement, Reply, Thread, Wishlist
from .tests import API, LmsCase


class WishlistTests(LmsCase):
    def test_save_list_and_remove(self):
        self.as_(self.student)
        self.assertEqual(self.client.post(f'{API}/courses/web/wishlist/').status_code, 201)
        self.client.post(f'{API}/courses/web/wishlist/')  # saving twice is harmless
        self.assertEqual(Wishlist.objects.count(), 1)
        data = self.client.get(f'{API}/me/wishlist/').data
        self.assertEqual((data['slugs'], len(data['courses'])), (['web'], 1))
        self.client.delete(f'{API}/courses/web/wishlist/')
        self.assertEqual(self.client.get(f'{API}/me/wishlist/').data['slugs'], [])

    def test_wishlists_are_private_and_need_sign_in(self):
        self.as_(self.student)
        self.client.post(f'{API}/courses/web/wishlist/')
        self.as_(self.other)
        self.assertEqual(self.client.get(f'{API}/me/wishlist/').data['slugs'], [])
        self.client.force_authenticate(None)
        self.assertEqual(self.client.get(f'{API}/me/wishlist/').status_code, 401)


class AnnouncementTests(LmsCase):
    def test_only_enrolled_students_and_admins_read(self):
        self.as_(self.admin)
        self.assertEqual(self.client.post(f'{API}/manage/courses/web/announcements/', {'title': 'Welcome', 'body': 'Hello all'}, format='json').status_code, 201)
        self.as_(self.student)
        self.assertEqual(self.client.get(f'{API}/courses/web/announcements/').status_code, 403)
        self.enroll()
        self.assertEqual([a['title'] for a in self.client.get(f'{API}/courses/web/announcements/').data], ['Welcome'])
        self.as_(self.admin)
        self.assertEqual(len(self.client.get(f'{API}/courses/web/announcements/').data), 1)

    def test_students_cannot_post_or_delete_and_notify_sends_email(self):
        self.enroll()
        self.as_(self.student)
        self.assertEqual(self.client.post(f'{API}/manage/courses/web/announcements/', {'title': 'x', 'body': 'y'}, format='json').status_code, 403)
        self.as_(self.admin)
        self.assertEqual(self.client.post(f'{API}/manage/courses/web/announcements/', {'title': '', 'body': 'y'}, format='json').status_code, 400)
        with self.captureOnCommitCallbacks(execute=True):
            resp = self.client.post(f'{API}/manage/courses/web/announcements/', {'title': 'Exam', 'body': 'Friday', 'notify': True}, format='json')
        self.assertTrue(any('amina@example.com' in m.to for m in mail.outbox))
        self.as_(self.student)
        self.assertEqual(self.client.delete(f"{API}/manage/announcements/{resp.data['id']}/").status_code, 403)
        self.as_(self.admin)
        self.assertEqual(self.client.delete(f"{API}/manage/announcements/{resp.data['id']}/").status_code, 204)
        self.assertFalse(Announcement.objects.exists())


class QuestionTests(LmsCase):
    def ask(self, **extra):
        return self.client.post(f'{API}/courses/web/qa/', {'title': 'How do I start?', 'body': 'Stuck', **extra}, format='json')

    def test_must_be_enrolled(self):
        self.as_(self.other)
        self.assertEqual(self.ask().status_code, 403)
        self.assertEqual(self.client.get(f'{API}/courses/web/qa/').status_code, 403)

    def test_ask_answer_and_notify(self):
        self.enroll()
        self.as_(self.student)
        with self.captureOnCommitCallbacks(execute=True):
            resp = self.ask(lesson=self.reading.id)
        self.assertEqual(resp.status_code, 201)
        self.assertEqual(resp.data['lesson']['title'], 'Notes')
        self.assertTrue(mail.outbox)  # team told
        tid = resp.data['id']
        listing = self.client.get(f'{API}/courses/web/qa/').data
        self.assertEqual((listing['unanswered'], listing['threads'][0]['answered']), (1, False))
        self.assertEqual(listing['threads'][0]['author'], 'Amina K.')
        mail.outbox.clear()
        self.as_(self.admin)
        with self.captureOnCommitCallbacks(execute=True):
            answer = self.client.post(f'{API}/qa/{tid}/replies/', {'body': 'Open lesson 1.'}, format='json')
        self.assertEqual((answer.status_code, answer.data['is_staff'], answer.data['author']), (201, True, 'ADRAM team'))
        self.assertTrue(any('amina@example.com' in m.to for m in mail.outbox))
        self.as_(self.student)
        listing = self.client.get(f'{API}/courses/web/qa/').data
        self.assertEqual((listing['unanswered'], listing['threads'][0]['answered'], listing['threads'][0]['reply_count']), (0, True, 1))
        self.assertEqual(len(self.client.get(f'{API}/qa/{tid}/').data['replies']), 1)

    def test_filters_and_lesson_validation(self):
        self.enroll()
        self.as_(self.student)
        self.ask()
        self.client.post(f'{API}/courses/web/qa/', {'title': 'Quiz trouble'}, format='json')
        self.assertEqual(len(self.client.get(f'{API}/courses/web/qa/?q=quiz').data['threads']), 1)
        self.assertEqual(len(self.client.get(f'{API}/courses/web/qa/?filter=mine').data['threads']), 2)
        self.assertEqual(self.ask(lesson=99999).status_code, 400)
        self.assertEqual(self.client.post(f'{API}/courses/web/qa/', {'title': ' '}, format='json').status_code, 400)

    def test_deleting_is_limited_to_authors_and_admins(self):
        self.enroll()
        self.enroll(self.other)
        self.as_(self.student)
        tid = self.ask().data['id']
        reply = self.client.post(f'{API}/qa/{tid}/replies/', {'body': 'me too'}, format='json').data['id']
        self.as_(self.other)
        self.assertEqual(self.client.delete(f'{API}/qa/{tid}/').status_code, 403)
        self.assertEqual(self.client.delete(f'{API}/qa/replies/{reply}/').status_code, 403)
        self.as_(self.student)
        self.assertEqual(self.client.delete(f'{API}/qa/replies/{reply}/').status_code, 204)
        self.assertEqual(self.client.delete(f'{API}/qa/{tid}/').status_code, 204)
        self.assertFalse(Thread.objects.exists() or Reply.objects.exists())
