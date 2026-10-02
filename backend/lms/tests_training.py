"""The training side: progress that survives signing out, downloading lesson materials, and staying apart from scholarships."""
import io
import zipfile

from django.core.files.uploadedfile import SimpleUploadedFile
from rest_framework.test import APIClient

from portal.models import PortalEvent, TrainingEnrollment

from .models import Lesson, Progress, Resource
from .tests import API, LmsCase


class ProgressResumeTests(LmsCase):
    def test_progress_is_kept_between_sessions(self):
        self.as_(self.student)
        self.enroll()
        self.client.post(f'{API}/lessons/{self.intro.id}/progress/', {'position': 75, 'spent': 60}, format='json')
        self.client.post(f'{API}/lessons/{self.reading.id}/progress/', {'completed': True}, format='json')
        self.client.post(f'{API}/lessons/{self.intro.id}/progress/', {'spent': 10}, format='json')  # opened again last

        # Signed out, then back in on another device: a brand-new client
        later = APIClient()
        later.force_authenticate(self.student)
        outline = later.get(f'{API}/courses/web/').data
        self.assertEqual(outline['progress']['completed'], 1)
        self.assertEqual(outline['progress']['resume_id'], self.intro.id)  # the lesson they were watching, not finished yet
        lesson = later.get(f'{API}/lessons/{self.intro.id}/').data
        self.assertEqual((lesson['position_seconds'], lesson['completed']), (75, False))
        self.assertEqual(Progress.objects.get(enrollment__student=self.student, lesson=self.intro).time_spent_seconds, 70)

    def test_watching_an_embedded_video_to_the_end_completes_it(self):
        self.as_(self.student)
        self.enroll()
        result = self.client.post(f'{API}/lessons/{self.intro.id}/progress/', {'position': 118}, format='json').data
        self.assertTrue(result['completed'])  # 118 of 120 seconds watched


class MaterialsTests(LmsCase):
    def setUp(self):
        super().setUp()
        self.doc = Lesson.objects.create(section=self.section, title='Handout', kind=Lesson.DOCUMENT, sort_order=4, is_published=True,
                                         document_file=SimpleUploadedFile('handout.pdf', b'%PDF-1.4 hello'), document_name='handout.pdf')
        Resource.objects.create(lesson=self.reading, title='Cheat sheet', file=SimpleUploadedFile('sheet.txt', b'tips'), filename='sheet.txt', size=4)
        self.video = Lesson.objects.create(section=self.section, title='Screencast', kind=Lesson.VIDEO, sort_order=5, is_published=True,
                                           video_source=Lesson.UPLOAD, video_file=SimpleUploadedFile('cast.mp4', b'\x00\x00\x00\x18ftypmp42'),
                                           video_name='cast.mp4')

    def materials(self):
        return self.client.get(f'{API}/courses/web/materials/')

    def test_enrolled_students_download_everything_and_the_zip(self):
        self.as_(self.student)
        self.assertEqual(self.materials().status_code, 403)  # not enrolled
        self.enroll()
        data = self.materials().data
        names = [f['name'] for s in data['sections'] for l in s['lessons'] for f in l['files']]
        self.assertEqual(names, ['Notes.html', 'sheet.txt', 'handout.pdf'])  # videos are off by default
        self.assertNotIn('Draft', str(data))

        anon = APIClient()  # links work without the sign-in header (they carry their own signature)
        notes = next(f for s in data['sections'] for l in s['lessons'] for f in l['files'] if f['kind'] == 'notes')
        page = anon.get(notes['url'])
        self.assertEqual(page.status_code, 200)
        self.assertIn('attachment', page['Content-Disposition'])
        self.assertIn('Read this.', page.content.decode())
        self.assertEqual(anon.get(notes['url'].replace('?t=', '?t=x')).status_code, 404)

        archive = zipfile.ZipFile(io.BytesIO(b''.join(anon.get(data['zip_url']).streaming_content)))
        listed = archive.namelist()
        self.assertIn('Course outline.html', listed)
        self.assertTrue(any(n.endswith('Notes.html') for n in listed))
        self.assertTrue(any(n.endswith('handout.pdf') for n in listed))
        self.assertFalse(any(n.endswith('.mp4') for n in listed))

        # the lesson itself lists its downloads for the player
        self.assertEqual([f['name'] for f in self.client.get(f'{API}/lessons/{self.reading.id}/').data['downloads']], ['Notes.html', 'sheet.txt'])

        # leaving the course takes the links away
        TrainingEnrollment.objects.filter(student=self.student).update(status=TrainingEnrollment.CANCELLED)
        self.assertEqual(anon.get(notes['url']).status_code, 404)

    def test_the_course_decides_about_downloads_and_videos(self):
        self.as_(self.student)
        self.enroll()
        watch = self.client.get(f'{API}/lessons/{self.video.id}/').data['video']['url']
        self.assertEqual(APIClient().get(watch + '&download=1').status_code, 404)  # can watch, can't save
        self.course.allow_video_downloads = True
        self.course.save()
        self.assertIn('cast.mp4', [f['name'] for s in self.materials().data['sections'] for l in s['lessons'] for f in l['files']])
        self.assertIn('attachment', APIClient().get(watch + '&download=1')['Content-Disposition'])
        self.course.allow_downloads = False
        self.course.save()
        self.assertEqual(self.materials().data['code'], 'downloads_off')
        self.assertEqual(self.client.get(f'{API}/lessons/{self.reading.id}/').data['downloads'], [])


class TrainingApartFromScholarshipsTests(LmsCase):
    def test_enrolling_leaves_the_scholarship_side_alone(self):
        self.course.enrollment_mode = 'open'
        self.course.save()
        self.as_(self.student)
        resp = self.client.post(f'{API}/me/enrollments/', {'slug': 'web'}, format='json')
        self.assertEqual((resp.status_code, resp.data['status']), (201, 'active'))
        self.assertFalse(PortalEvent.objects.filter(user=self.student).exists())  # the scholarship activity log
        self.student.refresh_from_db()
        self.assertEqual(self.student.tracks, ['training'])
        self.assertNotIn('training', self.client.get('/api/v1/portal/me/').data)
        self.assertNotIn('training', self.client.get('/api/v1/portal/me/summary/').data)
        self.assertEqual(self.client.get(f'{API}/me/summary/').data['training'], 1)
        self.assertEqual([e['course']['slug'] for e in self.client.get(f'{API}/me/enrollments/').data], ['web'])
        # the old address still works
        self.assertEqual(self.client.post('/api/v1/portal/me/training/', {'slug': 'web'}, format='json').status_code, 200)


class EnrollmentApprovalTests(LmsCase):
    """Courses 'by approval': the student asks, an administrator confirms or declines, and the student sees it."""

    def ask(self):
        self.as_(self.student)
        return self.client.post(f'{API}/me/enrollments/', {'slug': 'web'}, format='json').data

    def test_confirming_opens_the_course_and_tells_the_student(self):
        from django.core import mail
        from .models import Notification
        self.course.enrollment_mode = 'approval'
        self.course.save()
        request = self.ask()
        self.assertEqual(request['status'], 'requested')
        outline = self.client.get(f'{API}/courses/web/').data
        self.assertEqual((outline['enrolled'], outline['enrollment_status']), (False, 'requested'))
        self.assertTrue(Notification.objects.filter(user=self.admin, link='/admin/enrollments').exists())  # admins are alerted
        self.assertEqual(self.client.get(f'{API}/lessons/{self.reading.id}/').status_code, 403)

        self.as_(self.admin)
        waiting = self.client.get(f'{API}/admin/enrollments/').data
        self.assertEqual((waiting['counts']['requested'], waiting['results'][0]['student']['email']), (1, 'amina@example.com'))
        mail.outbox.clear()
        with self.captureOnCommitCallbacks(execute=True):  # the email goes once the change is saved
            done = self.client.post(f'{API}/admin/enrollments/decide/', {'ids': [request['id']], 'decision': 'confirm',
                                                                         'start_date': '2026-11-02', 'note': 'Classes on Mondays.'}, format='json')
        self.assertEqual((done.data['updated'][0]['status'], done.data['updated'][0]['decided_by']), ('active', self.admin.get_full_name()))

        self.as_(self.student)
        outline = self.client.get(f'{API}/courses/web/').data
        self.assertEqual((outline['enrolled'], outline['enrollment_status']), (True, 'active'))
        self.assertEqual(self.client.get(f'{API}/lessons/{self.reading.id}/').status_code, 200)
        note = Notification.objects.filter(user=self.student).latest('id')
        self.assertEqual((note.title, note.body), ('You\u2019re enrolled on Web Development', 'Classes on Mondays.'))
        self.assertEqual(len(mail.outbox), 1)
        mine = self.client.get(f'{API}/me/enrollments/').data[0]
        self.assertEqual((mine['status'], mine['start_date'], mine['note']), ('active', '2026-11-02', 'Classes on Mondays.'))

    def test_declining_tells_the_student_who_can_ask_again(self):
        self.course.enrollment_mode = 'approval'
        self.course.save()
        request = self.ask()
        self.as_(self.admin)
        self.client.post(f'{API}/admin/enrollments/decide/', {'ids': [request['id']], 'decision': 'decline', 'note': 'This intake is full.'}, format='json')
        self.as_(self.student)
        outline = self.client.get(f'{API}/courses/web/').data
        self.assertEqual((outline['enrollment_status'], outline['enrollment_request']['note']), ('declined', 'This intake is full.'))
        again = self.client.post(f'{API}/me/enrollments/', {'slug': 'web'}, format='json')
        self.assertEqual((again.status_code, again.data['status'], again.data['note']), (201, 'requested', ''))

    def test_only_administrators_decide(self):
        self.course.enrollment_mode = 'approval'
        self.course.save()
        request = self.ask()
        self.assertEqual(self.client.get(f'{API}/admin/enrollments/').status_code, 403)
        self.assertEqual(self.client.post(f'{API}/admin/enrollments/decide/', {'ids': [request['id']], 'decision': 'confirm'}, format='json').status_code, 403)
        self.as_(self.admin)
        self.assertEqual(self.client.post(f'{API}/admin/enrollments/decide/', {'ids': [request['id']], 'decision': 'maybe'}, format='json').status_code, 400)


class LearningAnalyticsTests(LmsCase):
    """Daily minutes, streaks, the daily goal, results, skills and the finish forecast."""

    def test_minutes_lessons_and_streaks(self):
        from datetime import timedelta
        from django.utils import timezone
        from .models import LearningDay
        self.as_(self.student)
        self.enroll()
        self.client.post(f'{API}/lessons/{self.intro.id}/progress/', {'spent': 120}, format='json')
        self.client.post(f'{API}/lessons/{self.reading.id}/progress/', {'completed': True}, format='json')
        today = timezone.localdate()
        LearningDay.objects.create(user=self.student, date=today - timedelta(days=1), seconds=300)
        LearningDay.objects.create(user=self.student, date=today - timedelta(days=2), seconds=30)  # under a minute: doesn't count
        LearningDay.objects.create(user=self.student, date=today - timedelta(days=5), seconds=600)
        LearningDay.objects.create(user=self.student, date=today - timedelta(days=6), seconds=600)
        LearningDay.objects.create(user=self.student, date=today - timedelta(days=7), lessons_completed=1)
        data = self.client.get(f'{API}/me/analytics/?days=7').data
        self.assertEqual((data['streak']['current'], data['streak']['longest'], data['streak']['today']), (2, 3, True))
        self.assertEqual((data['goal']['today_minutes'], data['goal']['daily_minutes']), (2, 15))
        self.assertEqual((data['daily'][-1]['minutes'], data['daily'][-1]['lessons']), (2, 1))
        self.assertEqual(len(data['daily']), 7)
        self.assertEqual(data['totals']['lessons_completed'], 1)

    def test_daily_goal(self):
        self.as_(self.student)
        self.assertEqual(self.client.put(f'{API}/me/goal/', {'daily_minutes': 2}, format='json').status_code, 400)
        self.assertEqual(self.client.put(f'{API}/me/goal/', {'daily_minutes': 30}, format='json').data['daily_minutes'], 30)
        self.assertEqual(self.client.get(f'{API}/me/analytics/').data['goal']['daily_minutes'], 30)

    def test_forecast_and_skills(self):
        from catalog.models import Course
        from portal.models import TrainingEnrollment
        self.as_(self.student)
        self.enroll()
        self.client.post(f'{API}/lessons/{self.reading.id}/progress/', {'completed': True}, format='json')
        row = self.client.get(f'{API}/me/analytics/').data['forecast'][0]
        self.assertEqual((row['course']['slug'], row['completed'], row['lessons_left']), ('web', 1, 2))
        self.assertGreater(row['per_week'], 0)
        self.assertIsNotNone(row['finish_by'])
        Course.objects.filter(slug='web').update(topics=['HTML'])  # in progress, no certificate: not a skill yet
        self.assertEqual(self.client.get(f'{API}/me/analytics/').data['skills'], [])
        done = Course.objects.create(slug='done', title='Finished Course', summary='x', is_published=True, topics=['Excel', 'Budgets'])
        TrainingEnrollment.objects.create(student=self.student, course=done, status=TrainingEnrollment.COMPLETED)
        self.assertEqual(sorted(s['name'] for s in self.client.get(f'{API}/me/analytics/').data['skills']), ['Budgets', 'Excel'])
