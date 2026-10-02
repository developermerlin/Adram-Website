"""Assignment deadlines, late work, rubrics, several files per hand-in, and deadline reminders."""
import io
from datetime import timedelta

from django.core.files.uploadedfile import SimpleUploadedFile
from django.core.management import call_command
from django.utils import timezone

from portal.models import TrainingEnrollment

from .models import Lesson, Notification, Submission
from .tests import API, LmsCase

MANAGE = f'{API}/manage'


class AssignmentTests(LmsCase):
    def setUp(self):
        super().setUp()
        self.task = Lesson.objects.create(section=self.section, title='Build a page', kind=Lesson.ASSIGNMENT, sort_order=5,
                                          is_published=True, body='Make a web page.', max_points=100)

    def hand_in(self, **data):
        return self.client.post(f'{API}/lessons/{self.task.id}/submissions/', {'text': 'My work', **data}, format='multipart')

    def test_editor_saves_deadline_rubric_and_file_limit(self):
        self.as_(self.admin)
        due = (timezone.now() + timedelta(days=3)).replace(microsecond=0)
        resp = self.client.patch(f'{MANAGE}/lessons/{self.task.id}/', {
            'due_at': due.isoformat(), 'late_policy': 'penalty', 'late_penalty_percent': 20, 'max_files': 3,
            'rubric': [{'title': 'Layout', 'points': 40}, {'title': 'Code', 'description': 'Clean HTML', 'points': 60}]}, format='json')
        self.assertEqual(resp.status_code, 200, resp.data)
        self.assertEqual((resp.data['max_points'], resp.data['max_files'], resp.data['late_policy']), (100, 3, 'penalty'))
        self.assertEqual(len(resp.data['rubric']), 2)
        bad = self.client.patch(f'{MANAGE}/lessons/{self.task.id}/', {'rubric': [{'title': '', 'points': 5}]}, format='json')
        self.assertEqual(bad.status_code, 400)
        bad = self.client.patch(f'{MANAGE}/lessons/{self.task.id}/', {'rubric': [{'title': 'x', 'points': 900}, {'title': 'y', 'points': 900}]}, format='json')
        self.assertIn('1000', str(bad.data))

    def test_several_files(self):
        Lesson.objects.filter(pk=self.task.pk).update(max_files=2)
        self.as_(self.student)
        self.enroll()
        files = [SimpleUploadedFile(f'part{i}.txt', b'hello') for i in range(3)]
        self.assertIn('at most 2 files', str(self.hand_in(files=files).data))
        sub = self.hand_in(files=[SimpleUploadedFile('a.txt', b'one'), SimpleUploadedFile('b.pdf', b'%PDF')]).data
        self.assertEqual([f['filename'] for f in sub['files']], ['a.txt', 'b.pdf'])
        download = self.client.get(sub['files'][1]['url'])
        self.assertEqual(download.status_code, 200)
        self.assertEqual(b''.join(download.streaming_content), b'%PDF')
        self.client.force_authenticate(None)
        self.as_(self.other)  # a signed link for someone else's file does not open it for another student
        self.assertEqual(self.client.get(sub['files'][0]['url'].split('?')[0] + '?t=bad').status_code, 404)

    def test_late_work_is_marked_and_penalised(self):
        Lesson.objects.filter(pk=self.task.pk).update(due_at=timezone.now() - timedelta(hours=1), late_policy=Lesson.PENALTY,
                                                      late_penalty_percent=20)
        self.as_(self.student)
        self.enroll()
        info = self.client.get(f'{API}/lessons/{self.task.id}/').data['assignment']
        self.assertTrue(info['overdue'])
        self.assertTrue(info['can_submit'])
        sub = self.hand_in().data
        self.assertEqual((sub['is_late'], sub['penalty_percent']), (True, 20))
        self.as_(self.admin)
        graded = self.client.post(f'{MANAGE}/submissions/{sub["id"]}/grade/', {'status': 'approved', 'grade': 90}, format='json').data
        self.assertEqual((graded['raw_grade'], graded['grade']), (90, 72))

    def test_closed_deadline_refuses_work(self):
        Lesson.objects.filter(pk=self.task.pk).update(due_at=timezone.now() - timedelta(minutes=5), late_policy=Lesson.CLOSED)
        self.as_(self.student)
        self.enroll()
        self.assertFalse(self.client.get(f'{API}/lessons/{self.task.id}/').data['assignment']['can_submit'])
        resp = self.hand_in()
        self.assertEqual((resp.status_code, resp.data['code']), (400, 'closed'))

    def test_deadline_after_enrolling(self):
        Lesson.objects.filter(pk=self.task.pk).update(due_days=7)
        self.as_(self.student)
        enrollment = self.enroll()
        due = self.client.get(f'{API}/lessons/{self.task.id}/').data['assignment']['due_at']
        self.assertEqual(due, enrollment.created_at + timedelta(days=7))
        self.assertFalse(self.hand_in().data['is_late'])

    def test_rubric_grading(self):
        Lesson.objects.filter(pk=self.task.pk).update(rubric=[{'title': 'Layout', 'description': '', 'points': 40},
                                                             {'title': 'Code', 'description': '', 'points': 60}], max_points=100)
        self.as_(self.student)
        self.enroll()
        sub = self.hand_in().data
        self.as_(self.admin)
        url = f'{MANAGE}/submissions/{sub["id"]}/grade/'
        self.assertIn('Score every criterion', str(self.client.post(url, {'status': 'approved', 'rubric_scores': [30]}, format='json').data))
        self.assertIn('0 to 40', str(self.client.post(url, {'status': 'approved', 'rubric_scores': [50, 10]}, format='json').data))
        graded = self.client.post(url, {'status': 'approved', 'rubric_scores': [35, 50], 'feedback': 'Nice'}, format='json').data
        self.assertEqual((graded['grade'], graded['rubric_scores']), (85, [35, 50]))
        queue = self.client.get(f'{MANAGE}/courses/web/submissions/').data['submissions'][0]
        self.assertEqual(len(queue['lesson']['rubric']), 2)

    def test_deadlines_list_and_reminders(self):
        Lesson.objects.filter(pk=self.task.pk).update(due_at=timezone.now() + timedelta(hours=5))
        self.as_(self.student)
        self.enroll()
        rows = self.client.get(f'{API}/me/deadlines/').data
        self.assertEqual([r['lesson']['title'] for r in rows], ['Build a page'])
        call_command('send_deadline_reminders', stdout=io.StringIO())
        call_command('send_deadline_reminders', stdout=io.StringIO())
        self.assertEqual(Notification.objects.filter(user=self.student, kind='assignment_due').count(), 1)  # only once
        # dropped students aren't reminded, and handed-in work leaves the list
        Notification.objects.all().delete()
        TrainingEnrollment.objects.filter(student=self.student).update(status=TrainingEnrollment.CANCELLED)
        call_command('send_deadline_reminders', stdout=io.StringIO())
        self.assertFalse(Notification.objects.exists())
        TrainingEnrollment.objects.filter(student=self.student).update(status=TrainingEnrollment.ACTIVE)
        self.hand_in()
        self.assertEqual(self.client.get(f'{API}/me/deadlines/').data, [])
        self.assertEqual(Submission.objects.count(), 1)
