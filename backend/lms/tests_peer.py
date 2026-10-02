"""Peer review: handing out classmates' work, hiding names, rubric scores, comments, and the instructor's view."""
from django.core.files.uploadedfile import SimpleUploadedFile

from accounts.models import User
from portal.models import TrainingEnrollment

from .models import Lesson, Notification, PeerReview
from .tests import API, LmsCase


class PeerReviewTests(LmsCase):
    def setUp(self):
        super().setUp()
        self.task = Lesson.objects.create(section=self.section, title='Build a page', kind=Lesson.ASSIGNMENT, sort_order=5, is_published=True,
                                          body='Make a page.', peer_reviews=2,
                                          rubric=[{'title': 'Layout', 'description': '', 'points': 5}, {'title': 'Code', 'description': '', 'points': 5}])
        self.third = User.objects.create_user(email='cara@example.com', password='Str0ng!Pass', role=User.STUDENT, is_verified=True, first_name='Cara')
        for user in (self.student, self.other, self.third):
            TrainingEnrollment.objects.create(student=user, course=self.course, status=TrainingEnrollment.ACTIVE)

    def hand_in(self, user, text, file=None):
        self.as_(user)
        data = {'text': text}
        if file:
            data['files'] = [file]
        return self.client.post(f'{API}/lessons/{self.task.id}/submissions/', data, format='multipart').data

    def review(self, user):
        self.as_(user)
        return self.client.get(f'{API}/lessons/{self.task.id}/peer-review/').data

    def test_review_flow(self):
        self.as_(self.student)
        self.assertFalse(self.review(self.student)['handed_in'])  # hand in first
        self.hand_in(self.student, 'Amina work')
        self.assertTrue(self.review(self.student)['waiting_for_work'])  # nobody else has handed in yet
        self.hand_in(self.other, 'Bob work', SimpleUploadedFile('page.txt', b'<p>hi</p>'))
        self.hand_in(self.third, 'Cara work')

        data = self.review(self.student)
        current = data['current']
        self.assertEqual(data['required'], 2)
        self.assertNotIn('student', current)  # no names
        self.assertIn(current['text'], ('Bob work', 'Cara work'))
        self.assertEqual(self.review(self.student)['current']['id'], current['id'])  # the same one until it's done
        if current['files']:
            self.assertEqual(self.client.get(current['files'][0]['url']).status_code, 200)  # the reviewer can open the file
        url = f'{API}/peer-reviews/{current["id"]}/'
        self.assertIn('comment', self.client.post(url, {'comment': 'ok', 'scores': [4, 4]}, format='json').data)
        self.assertIn('scores', self.client.post(url, {'comment': 'Nice clear layout; add comments to the code.', 'scores': [9, 4]}, format='json').data)
        self.assertTrue(self.client.post(url, {'comment': 'Nice clear layout; add comments to the code.', 'scores': [4, 3]}, format='json').data['done'])

        second = self.review(self.student)['current']
        self.assertNotEqual(second['text'], current['text'])  # a different classmate
        self.client.post(f'{API}/peer-reviews/{second["id"]}/', {'comment': 'Good start, the colours are hard to read.', 'scores': [3, 3]}, format='json')
        final = self.review(self.student)
        self.assertEqual((final['done'], final['current'], final['waiting_for_work']), (2, None, False))

        # the classmates see it anonymously; the reviewed student is told
        reviewed = PeerReview.objects.filter(status=PeerReview.DONE).first().submission.enrollment.student
        got = self.review(reviewed)['received']
        self.assertEqual((got[0]['label'], 'reviewer' in got[0]), ('Classmate 1', False))
        self.assertTrue(Notification.objects.filter(user=reviewed, title__startswith='A classmate reviewed').exists())
        # the instructor sees who wrote it
        self.as_(self.admin)
        rows = self.client.get(f'{API}/manage/courses/web/submissions/').data['submissions']
        self.assertEqual(next(r for r in rows if r['peer_reviews'])['peer_reviews'][0]['reviewer'], 'Amina Kamara')

    def test_fewest_reviews_first_and_off_by_default(self):
        self.hand_in(self.student, 'A')
        self.hand_in(self.other, 'B')
        self.hand_in(self.third, 'C')
        # Amina gets the earliest unreviewed work (B); Bob gets A rather than piling onto B; Cara (who wrote C) gets A or B
        self.assertEqual(self.review(self.student)['current']['text'], 'B')
        self.assertEqual(self.review(self.other)['current']['text'], 'A')
        self.assertIn(self.review(self.third)['current']['text'], ('A', 'B'))
        Lesson.objects.filter(pk=self.task.pk).update(peer_reviews=0)
        self.assertEqual(self.review(self.third), {'required': 0})

    def test_others_cannot_complete_or_open(self):
        self.hand_in(self.student, 'A')
        self.hand_in(self.other, 'B', SimpleUploadedFile('b.txt', b'B'))
        current = self.review(self.student)['current']
        self.as_(self.third)
        self.assertEqual(self.client.post(f'{API}/peer-reviews/{current["id"]}/', {'comment': 'x' * 20, 'scores': [1, 1]}, format='json').status_code, 404)
