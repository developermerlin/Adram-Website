import os
import shutil
import tempfile

from django.contrib.auth import get_user_model
from django.core.files.uploadedfile import SimpleUploadedFile
from django.test import SimpleTestCase, override_settings
from rest_framework.test import APITestCase

from catalog.models import Course
from portal.models import TrainingEnrollment

from .media import embed_url
from .models import Certificate, Choice, Lesson, Progress, Question, Resource, Section, lms_storage

User = get_user_model()
API = '/api/v1/lms'
MP4 = b'\x00\x00\x00\x18ftypmp42' + bytes(range(256)) * 8  # 2 KB that starts like an MP4


class EmbedUrlTests(SimpleTestCase):
    def test_youtube_and_vimeo_links(self):
        self.assertEqual(embed_url('https://www.youtube.com/watch?v=dQw4w9WgXcQ'), 'https://www.youtube-nocookie.com/embed/dQw4w9WgXcQ')
        self.assertEqual(embed_url('https://youtu.be/dQw4w9WgXcQ?t=5'), 'https://www.youtube-nocookie.com/embed/dQw4w9WgXcQ')
        self.assertEqual(embed_url('https://www.youtube.com/shorts/dQw4w9WgXcQ'), 'https://www.youtube-nocookie.com/embed/dQw4w9WgXcQ')
        self.assertEqual(embed_url('https://vimeo.com/123456789'), 'https://player.vimeo.com/video/123456789')
        self.assertEqual(embed_url('https://vimeo.com/123456789/abcdef0123'), 'https://player.vimeo.com/video/123456789?h=abcdef0123')
        self.assertEqual(embed_url('https://player.vimeo.com/video/123456789?h=abc123'), 'https://player.vimeo.com/video/123456789?h=abc123')

    def test_anything_else_is_refused(self):
        for bad in ('', 'javascript:alert(1)', 'https://evil.example/watch?v=dQw4w9WgXcQ', 'https://youtube.com.evil.example/watch?v=dQw4w9WgXcQ',
                    'https://www.youtube.com/watch?v=short', 'https://vimeo.com/notanumber', 'ftp://youtu.be/dQw4w9WgXcQ'):
            self.assertIsNone(embed_url(bad), bad)


class LmsCase(APITestCase):
    @classmethod
    def setUpTestData(cls):
        cls.admin = User.objects.create_user(email='admin@example.com', password='Str0ng!Pass', role=User.ADMIN, is_verified=True)
        cls.student = User.objects.create_user(email='amina@example.com', password='Str0ng!Pass', role=User.STUDENT, is_verified=True, first_name='Amina', last_name='Kamara')
        cls.other = User.objects.create_user(email='bob@example.com', password='Str0ng!Pass', role=User.STUDENT, is_verified=True)
        cls.course = Course.objects.create(slug='web', title='Web Development', summary='Learn the web.', is_published=True)

    def setUp(self):
        # Keep uploaded files in a throwaway folder
        self.files = tempfile.mkdtemp()
        self.addCleanup(shutil.rmtree, self.files, True)
        lms_storage._location = self.files
        for name in ('base_location', 'location'):
            lms_storage.__dict__.pop(name, None)
        self.addCleanup(lambda: [lms_storage.__dict__.pop(n, None) for n in ('base_location', 'location')])
        self.addCleanup(setattr, lms_storage, '_location', None)

        self.section = Section.objects.create(course=self.course, title='Week 1', sort_order=0)
        self.intro = Lesson.objects.create(section=self.section, title='Intro', kind=Lesson.VIDEO, sort_order=0, is_published=True, is_preview=True,
                                           video_source=Lesson.EMBED, video_url='https://youtu.be/dQw4w9WgXcQ', duration_seconds=120)
        self.reading = Lesson.objects.create(section=self.section, title='Notes', kind=Lesson.TEXT, sort_order=1, is_published=True, body='Read this.')
        self.quiz = Lesson.objects.create(section=self.section, title='Check', kind=Lesson.QUIZ, sort_order=2, is_published=True, pass_mark=50)
        self.q1 = Question.objects.create(lesson=self.quiz, text='2+2?', explanation='Four.', sort_order=0)
        self.q1_ok = Choice.objects.create(question=self.q1, text='4', is_correct=True)
        self.q1_bad = Choice.objects.create(question=self.q1, text='5')
        self.q2 = Question.objects.create(lesson=self.quiz, text='Sky?', sort_order=1)
        self.q2_ok = Choice.objects.create(question=self.q2, text='Blue', is_correct=True)
        self.q2_bad = Choice.objects.create(question=self.q2, text='Green')
        self.draft = Lesson.objects.create(section=self.section, title='Draft', kind=Lesson.TEXT, sort_order=3, is_published=False, body='x')

    def enroll(self, user=None, status=TrainingEnrollment.ACTIVE):
        return TrainingEnrollment.objects.create(student=user or self.student, course=self.course, status=status)

    def as_(self, user):
        self.client.force_authenticate(user)


class AccessTests(LmsCase):
    def test_outline_is_public_but_lists_only_published_lessons(self):
        data = self.client.get(f'{API}/courses/web/').data
        self.assertEqual([l['title'] for l in data['sections'][0]['lessons']], ['Intro', 'Notes', 'Check'])
        self.assertTrue(data['has_content'])
        self.assertFalse(data['enrolled'])
        self.assertEqual(data['totals']['seconds'], 120)
        self.assertNotIn('video', data['sections'][0]['lessons'][0])

    def test_unpublished_courses_are_hidden_from_students(self):
        Course.objects.filter(pk=self.course.pk).update(is_published=False)
        self.assertEqual(self.client.get(f'{API}/courses/web/').status_code, 404)
        self.as_(self.admin)
        self.assertEqual(self.client.get(f'{API}/courses/web/').status_code, 200)

    def test_visitors_can_only_open_free_previews(self):
        preview = self.client.get(f'{API}/lessons/{self.intro.id}/')
        self.assertEqual(preview.status_code, 200)
        self.assertEqual(preview.data['video'], {'type': 'embed', 'url': 'https://www.youtube-nocookie.com/embed/dQw4w9WgXcQ'})
        locked = self.client.get(f'{API}/lessons/{self.reading.id}/')
        self.assertEqual((locked.status_code, locked.data['code']), (401, 'sign_in'))

    def test_signed_in_but_not_enrolled_is_told_to_enrol(self):
        self.as_(self.student)
        resp = self.client.get(f'{API}/lessons/{self.reading.id}/')
        self.assertEqual((resp.status_code, resp.data['code']), (403, 'enrollment_required'))

    def test_a_pending_or_cancelled_enrolment_does_not_unlock_lessons(self):
        self.as_(self.student)
        enrollment = self.enroll(status=TrainingEnrollment.REQUESTED)
        self.assertEqual(self.client.get(f'{API}/lessons/{self.reading.id}/').status_code, 403)
        self.assertEqual(self.client.get(f'{API}/courses/web/').data['enrollment_status'], 'requested')
        enrollment.status = TrainingEnrollment.CANCELLED
        enrollment.save()
        self.assertEqual(self.client.get(f'{API}/lessons/{self.reading.id}/').status_code, 403)

    def test_enrolled_students_open_lessons_but_not_drafts(self):
        self.enroll()
        self.as_(self.student)
        lesson = self.client.get(f'{API}/lessons/{self.reading.id}/')
        self.assertEqual(lesson.status_code, 200)
        self.assertEqual((lesson.data['previous_id'], lesson.data['next_id']), (self.intro.id, self.quiz.id))
        self.assertEqual(self.client.get(f'{API}/lessons/{self.draft.id}/').status_code, 403)

    def test_quiz_questions_never_reveal_the_answers(self):
        self.enroll()
        self.as_(self.student)
        quiz = self.client.get(f'{API}/lessons/{self.quiz.id}/').data
        self.assertNotIn('is_correct', str(quiz))
        attempt = self.client.post(f'{API}/lessons/{self.quiz.id}/quiz/start/').data
        self.assertEqual(len(attempt['questions']), 2)
        self.assertNotIn('is_correct', str(attempt))

    def test_admin_can_preview_drafts(self):
        self.as_(self.admin)
        self.assertEqual(self.client.get(f'{API}/lessons/{self.draft.id}/').status_code, 200)


class ProgressTests(LmsCase):
    def setUp(self):
        super().setUp()
        self.enrollment = self.enroll()
        self.as_(self.student)

    def post(self, lesson, data):
        return self.client.post(f'{API}/lessons/{lesson.id}/progress/', data, format='json')

    def test_position_and_completion_are_saved(self):
        self.post(self.intro, {'position': 42})
        resp = self.post(self.reading, {'completed': True})
        self.assertEqual(resp.data['progress']['completed'], 1)
        self.assertEqual(resp.data['progress']['percent'], 33)
        self.assertEqual(self.client.get(f'{API}/lessons/{self.intro.id}/').data['position_seconds'], 42)
        self.assertTrue(self.client.get(f'{API}/lessons/{self.reading.id}/').data['completed'])

    def test_can_mark_a_lesson_not_done_again(self):
        self.post(self.reading, {'completed': True})
        self.assertEqual(self.post(self.reading, {'completed': False}).data['progress']['completed'], 0)

    def test_a_quiz_cannot_be_ticked_off_by_hand(self):
        self.assertEqual(self.post(self.quiz, {'completed': True}).status_code, 400)

    def test_visitors_and_other_students_cannot_track(self):
        self.as_(self.other)
        self.assertEqual(self.post(self.reading, {'completed': True}).status_code, 403)
        self.client.force_authenticate(None)
        self.assertEqual(self.post(self.reading, {'completed': True}).status_code, 401)

    def test_finishing_everything_completes_the_programme_and_issues_a_certificate(self):
        self.post(self.intro, {'completed': True})
        self.post(self.reading, {'completed': True})
        self.assertFalse(Certificate.objects.exists())
        self.assertEqual(self.client.get(f'{API}/courses/web/certificate/').status_code, 404)
        resp = self.client.post(f'{API}/lessons/{self.quiz.id}/quiz/', {'answers': {str(self.q1.id): self.q1_ok.id, str(self.q2.id): self.q2_ok.id}}, format='json')
        self.assertTrue(resp.data['passed'])
        self.assertEqual(resp.data['progress']['percent'], 100)
        self.assertTrue(resp.data['certificate_code'].startswith('ADR-'))
        self.enrollment.refresh_from_db()
        self.assertEqual(self.enrollment.status, TrainingEnrollment.COMPLETED)
        cert = self.client.get(f'{API}/courses/web/certificate/').data
        self.assertEqual((cert['student_name'], cert['course_title']), ('Amina Kamara', 'Web Development'))

    def test_certificates_can_be_checked_by_anyone(self):
        for lesson in (self.intro, self.reading):
            self.post(lesson, {'completed': True})
        self.client.post(f'{API}/lessons/{self.quiz.id}/quiz/', {'answers': {str(self.q1.id): self.q1_ok.id, str(self.q2.id): self.q2_ok.id}}, format='json')
        code = Certificate.objects.get().code
        self.client.force_authenticate(None)
        self.assertEqual(self.client.get(f'{API}/certificates/{code.lower()}/').data['student_name'], 'Amina Kamara')
        self.assertEqual(self.client.get(f'{API}/certificates/ADR-0000-0000-0000/').status_code, 404)

    def test_my_learning_lists_programmes_with_progress(self):
        self.post(self.intro, {'completed': True})
        data = self.client.get(f'{API}/me/').data
        self.assertEqual(len(data), 1)
        self.assertEqual((data[0]['course']['slug'], data[0]['progress']['completed'], data[0]['progress']['resume_id']), ('web', 1, self.reading.id))
        self.as_(self.other)
        self.assertEqual(self.client.get(f'{API}/me/').data, [])


class QuizTests(LmsCase):
    def setUp(self):
        super().setUp()
        self.enroll()
        self.as_(self.student)

    def submit(self, answers):
        return self.client.post(f'{API}/lessons/{self.quiz.id}/quiz/', {'answers': answers}, format='json')

    def test_scoring_and_feedback(self):
        resp = self.submit({str(self.q1.id): self.q1_bad.id, str(self.q2.id): self.q2_ok.id})
        self.assertEqual((resp.data['score_percent'], resp.data['passed']), (50, True))  # pass mark is 50
        first = resp.data['results'][0]
        self.assertEqual((first['correct'], first['correct_id'], first['explanation']), (False, self.q1_ok.id, 'Four.'))

    def test_failing_does_not_complete_the_lesson_and_can_be_retried(self):
        Lesson.objects.filter(pk=self.quiz.pk).update(pass_mark=100)
        resp = self.submit({str(self.q1.id): self.q1_bad.id})
        self.assertEqual((resp.data['score_percent'], resp.data['passed']), (0, False))
        self.assertFalse(Progress.objects.filter(lesson=self.quiz, completed_at__isnull=False).exists())
        self.assertTrue(self.submit({str(self.q1.id): self.q1_ok.id, str(self.q2.id): self.q2_ok.id}).data['passed'])
        self.assertEqual(self.client.get(f'{API}/lessons/{self.quiz.id}/').data['last_attempt']['score_percent'], 100)

    def test_bad_input(self):
        self.assertEqual(self.submit(['x']).status_code, 400)
        self.assertEqual(self.client.post(f'{API}/lessons/{self.reading.id}/quiz/', {'answers': {}}, format='json').status_code, 400)


class StreamingTests(LmsCase):
    def setUp(self):
        super().setUp()
        self.lesson = Lesson.objects.create(section=self.section, title='Upload', kind=Lesson.VIDEO, sort_order=9, is_published=True, video_source=Lesson.UPLOAD,
                                            video_name='lesson.mp4', video_file=SimpleUploadedFile('lesson.mp4', MP4, content_type='video/mp4'))

    def link(self):
        return self.client.get(f'{API}/lessons/{self.lesson.id}/').data['video']['url']

    def test_enrolled_student_streams_with_seek(self):
        self.enroll()
        self.as_(self.student)
        url = self.link()
        self.assertIn('/lms/media/video/', url)
        full = self.client.get(url)
        self.assertEqual((full.status_code, full['Accept-Ranges']), (200, 'bytes'))
        self.assertEqual(b''.join(full.streaming_content), MP4)
        part = self.client.get(url, HTTP_RANGE='bytes=10-19')
        self.assertEqual((part.status_code, part['Content-Range']), (206, f'bytes 10-19/{len(MP4)}'))
        self.assertEqual(b''.join(part.streaming_content), MP4[10:20])
        tail = self.client.get(url, HTTP_RANGE='bytes=-5')
        self.assertEqual(b''.join(tail.streaming_content), MP4[-5:])
        self.assertEqual(self.client.get(url, HTTP_RANGE=f'bytes={len(MP4) + 5}-').status_code, 416)

    def test_the_link_alone_is_the_credential_but_it_is_bound_to_one_video(self):
        self.enroll()
        self.as_(self.student)
        url = self.link()
        self.client.force_authenticate(None)
        self.assertEqual(self.client.get(url).status_code, 200)  # a <video> tag sends no token
        other = Lesson.objects.create(section=self.section, title='Other', kind=Lesson.VIDEO, sort_order=10, is_published=True, video_source=Lesson.UPLOAD,
                                      video_file=SimpleUploadedFile('o.mp4', MP4))
        token = url.split('?t=')[1]
        self.assertEqual(self.client.get(f'{API}/media/video/{other.id}/?t={token}').status_code, 404)
        self.assertEqual(self.client.get(f'{API}/media/video/{self.lesson.id}/?t=forged').status_code, 404)
        self.assertEqual(self.client.get(f'{API}/media/video/{self.lesson.id}/').status_code, 404)

    def test_cancelling_the_enrolment_cuts_off_old_links(self):
        enrollment = self.enroll()
        self.as_(self.student)
        url = self.link()
        enrollment.status = TrainingEnrollment.CANCELLED
        enrollment.save()
        self.assertEqual(self.client.get(url).status_code, 404)

    def test_free_preview_uploads_stream_to_visitors(self):
        Lesson.objects.filter(pk=self.lesson.pk).update(is_preview=True)
        url = self.link()
        self.assertEqual(self.client.get(url).status_code, 200)
        Lesson.objects.filter(pk=self.lesson.pk).update(is_preview=False)
        self.assertEqual(self.client.get(url).status_code, 404)

    def test_resources_download_as_attachments(self):
        resource = Resource.objects.create(lesson=self.lesson, title='Slides', filename='slides.pdf', size=5, file=SimpleUploadedFile('slides.pdf', b'%PDF-'))
        self.enroll()
        self.as_(self.student)
        url = self.client.get(f'{API}/lessons/{self.lesson.id}/').data['resources'][0]['url']
        resp = self.client.get(url)
        self.assertEqual(resp.status_code, 200)
        self.assertIn('attachment', resp['Content-Disposition'])
        self.assertEqual(b''.join(resp.streaming_content), b'%PDF-')
        self.assertEqual(resource.title, 'Slides')

    def test_deleting_a_lesson_removes_its_files(self):
        path = self.lesson.video_file.path
        self.assertTrue(os.path.exists(path))
        self.lesson.delete()
        self.assertFalse(os.path.exists(path))


class BuilderTests(LmsCase):
    def setUp(self):
        super().setUp()
        self.as_(self.admin)

    def test_only_administrators_can_build(self):
        for user in (self.student, None):
            self.client.force_authenticate(user)
            self.assertIn(self.client.get(f'{API}/manage/courses/web/curriculum/').status_code, (401, 403))
            self.assertIn(self.client.post(f'{API}/manage/courses/web/sections/', {'title': 'x'}, format='json').status_code, (401, 403))
        self.assertEqual(Section.objects.count(), 1)

    def test_build_a_course_from_nothing(self):
        section = self.client.post(f'{API}/manage/courses/web/sections/', {'title': 'Week 2'}, format='json')
        self.assertEqual(section.status_code, 201)
        lesson = self.client.post(f'{API}/manage/sections/{section.data["id"]}/lessons/', {'title': 'CSS basics', 'kind': 'video'}, format='json').data
        self.assertFalse(lesson['is_published'])
        tree = self.client.get(f'{API}/manage/courses/web/curriculum/').data
        self.assertEqual([s['title'] for s in tree['sections']], ['Week 1', 'Week 2'])
        self.assertEqual(self.client.patch(f'{API}/manage/sections/{section.data["id"]}/', {'title': 'Week two'}, format='json').data['title'], 'Week two')

    def test_titles_are_required(self):
        self.assertEqual(self.client.post(f'{API}/manage/courses/web/sections/', {'title': ' '}, format='json').status_code, 400)
        self.assertEqual(self.client.post(f'{API}/manage/sections/{self.section.id}/lessons/', {'title': ''}, format='json').status_code, 400)
        self.assertEqual(self.client.post(f'{API}/manage/sections/{self.section.id}/lessons/', {'title': 'x', 'kind': 'nope'}, format='json').status_code, 400)

    def test_embed_links_are_checked_and_shown_as_players(self):
        lesson = Lesson.objects.create(section=self.section, title='V', kind=Lesson.VIDEO, sort_order=9)
        bad = self.client.patch(f'{API}/manage/lessons/{lesson.id}/', {'video_source': 'embed', 'video_url': 'https://evil.example/x'}, format='json')
        self.assertEqual(bad.status_code, 400)
        good = self.client.patch(f'{API}/manage/lessons/{lesson.id}/', {'video_source': 'embed', 'video_url': 'https://vimeo.com/123456789', 'duration_seconds': 300}, format='json')
        self.assertEqual(good.data['embed_url'], 'https://player.vimeo.com/video/123456789')

    def test_unfinished_lessons_cannot_be_published(self):
        video = Lesson.objects.create(section=self.section, title='V', kind=Lesson.VIDEO, sort_order=9)
        text = Lesson.objects.create(section=self.section, title='T', kind=Lesson.TEXT, sort_order=10)
        quiz = Lesson.objects.create(section=self.section, title='Q', kind=Lesson.QUIZ, sort_order=11)
        for lesson in (video, text, quiz):
            resp = self.client.patch(f'{API}/manage/lessons/{lesson.id}/', {'is_published': True}, format='json')
            self.assertEqual(resp.status_code, 400, lesson.title)
            lesson.refresh_from_db()
            self.assertFalse(lesson.is_published)
        ok = self.client.patch(f'{API}/manage/lessons/{text.id}/', {'body': 'Hello', 'is_published': True}, format='json')
        self.assertTrue(ok.data['is_published'])

    def test_video_upload_rules(self):
        lesson = Lesson.objects.create(section=self.section, title='V', kind=Lesson.VIDEO, sort_order=9)
        url = f'{API}/manage/lessons/{lesson.id}/'
        up = lambda name, data: self.client.patch(url, {'video_file': SimpleUploadedFile(name, data)}, format='multipart')
        self.assertEqual(up('notes.txt', MP4).status_code, 400)
        self.assertEqual(up('fake.mp4', b'this is not a video at all').status_code, 400)
        with override_settings(LMS_MAX_VIDEO_MB=0):
            self.assertEqual(up('big.mp4', MP4).status_code, 400)
        ok = up('lesson one.mp4', MP4)
        self.assertEqual(ok.status_code, 200, ok.data)
        self.assertEqual((ok.data['video_source'], ok.data['has_video_file'], ok.data['video_name']), ('upload', True, 'lesson one.mp4'))
        self.assertIn('/lms/media/video/', ok.data['video_preview_url'])
        # replacing removes the old file; clearing removes the video
        old_path = Lesson.objects.get(pk=lesson.pk).video_file.path
        up('second.mp4', MP4)
        self.assertFalse(os.path.exists(old_path))
        cleared = self.client.patch(url, {'clear_video': True}, format='json')
        self.assertEqual((cleared.data['video_source'], cleared.data['has_video_file']), ('', False))

    def test_resources(self):
        url = f'{API}/manage/lessons/{self.reading.id}/resources/'
        self.assertEqual(self.client.post(url, {}, format='multipart').status_code, 400)
        self.assertEqual(self.client.post(url, {'file': SimpleUploadedFile('run.exe', b'MZ')}, format='multipart').status_code, 400)
        made = self.client.post(url, {'title': 'Slides', 'file': SimpleUploadedFile('slides.pdf', b'%PDF-')}, format='multipart')
        self.assertEqual((made.status_code, made.data['title'], made.data['size']), (201, 'Slides', 5))
        self.assertEqual(self.client.delete(f'{API}/manage/resources/{made.data["id"]}/').status_code, 204)
        self.assertFalse(Resource.objects.exists())

    def test_quiz_editor_validates_and_replaces(self):
        url = f'{API}/manage/lessons/{self.quiz.id}/quiz/'
        two = lambda correct: [{'text': 'A', 'is_correct': correct}, {'text': 'B'}]
        self.assertEqual(self.client.put(url, {'questions': [{'text': 'Q', 'choices': [{'text': 'only', 'is_correct': True}]}]}, format='json').status_code, 400)
        self.assertEqual(self.client.put(url, {'questions': [{'text': 'Q', 'choices': two(False)}]}, format='json').status_code, 400)
        self.assertEqual(self.client.put(url, {'questions': [{'text': '', 'choices': two(True)}]}, format='json').status_code, 400)
        self.assertEqual(Question.objects.filter(lesson=self.quiz).count(), 2)  # nothing changed by the failures
        ok = self.client.put(url, {'pass_mark': 80, 'questions': [{'text': 'New?', 'explanation': 'Because.', 'choices': two(True)}]}, format='json')
        self.assertEqual(ok.status_code, 200)
        self.assertEqual((ok.data['pass_mark'], len(ok.data['questions']), ok.data['questions'][0]['choices'][0]['is_correct']), (80, 1, True))
        self.assertEqual(self.client.put(f'{API}/manage/lessons/{self.reading.id}/quiz/', {'questions': []}, format='json').status_code, 400)

    def test_emptying_a_published_quiz_unpublishes_it(self):
        self.client.put(f'{API}/manage/lessons/{self.quiz.id}/quiz/', {'questions': []}, format='json')
        self.quiz.refresh_from_db()
        self.assertFalse(self.quiz.is_published)

    def test_reordering_and_moving_lessons_between_sections(self):
        other = Section.objects.create(course=self.course, title='Week 2', sort_order=1)
        lessons = [self.intro.id, self.reading.id, self.quiz.id, self.draft.id]
        payload = {'sections': [other.id, self.section.id], 'lessons': {str(other.id): [self.quiz.id], str(self.section.id): [self.reading.id, self.intro.id, self.draft.id]}}
        resp = self.client.post(f'{API}/manage/courses/web/reorder/', payload, format='json')
        self.assertEqual(resp.status_code, 200)
        self.assertEqual([s['title'] for s in resp.data['sections']], ['Week 2', 'Week 1'])
        self.assertEqual([l['id'] for l in resp.data['sections'][1]['lessons']], [self.reading.id, self.intro.id, self.draft.id])
        self.assertEqual(Lesson.objects.get(pk=self.quiz.id).section_id, other.id)
        # partial or foreign lists are rejected
        self.assertEqual(self.client.post(f'{API}/manage/courses/web/reorder/', {'sections': [other.id], 'lessons': {}}, format='json').status_code, 400)
        bad = {'sections': [other.id, self.section.id], 'lessons': {str(other.id): lessons[:2], str(self.section.id): lessons[2:] + [99999]}}
        self.assertEqual(self.client.post(f'{API}/manage/courses/web/reorder/', bad, format='json').status_code, 400)

    def test_deleting_a_section_removes_its_lessons(self):
        self.assertEqual(self.client.delete(f'{API}/manage/sections/{self.section.id}/').status_code, 204)
        self.assertFalse(Lesson.objects.exists())

    def test_student_progress_table(self):
        enrollment = self.enroll()
        Progress.objects.create(enrollment=enrollment, lesson=self.intro, completed_at='2026-01-01T00:00:00Z')
        rows = self.client.get(f'{API}/manage/courses/web/students/').data
        self.assertEqual(rows['total_lessons'], 3)
        self.assertEqual((rows['students'][0]['name'], rows['students'][0]['completed'], rows['students'][0]['percent']), ('Amina Kamara', 1, 33))


class ReviewTests(LmsCase):
    def url(self):
        return f'{API}/courses/web/reviews/'

    def test_summary_is_public_and_starts_empty(self):
        data = self.client.get(self.url()).data
        self.assertEqual((data['summary']['count'], data['summary']['average'], data['can_review']), (0, 0, False))
        self.assertEqual(data['summary']['distribution'], {'5': 0, '4': 0, '3': 0, '2': 0, '1': 0})

    def test_only_enrolled_students_can_review(self):
        self.as_(self.other)
        self.assertEqual(self.client.post(self.url(), {'rating': 5}, format='json').status_code, 403)
        self.client.force_authenticate(None)
        self.assertEqual(self.client.post(self.url(), {'rating': 5}, format='json').status_code, 401)
        self.enroll(status=TrainingEnrollment.REQUESTED)  # a pending request is not enough
        self.as_(self.student)
        self.assertEqual(self.client.post(self.url(), {'rating': 5}, format='json').status_code, 403)

    def test_rating_is_checked(self):
        self.enroll()
        self.as_(self.student)
        for bad in (0, 6, 'x', None):
            self.assertEqual(self.client.post(self.url(), {'rating': bad}, format='json').status_code, 400, bad)

    def test_a_student_has_one_review_that_can_be_edited_and_removed(self):
        self.enroll()
        self.as_(self.student)
        self.client.post(self.url(), {'rating': 3, 'comment': 'Okay'}, format='json')
        resp = self.client.post(self.url(), {'rating': 5, 'comment': 'Great course!'}, format='json')
        self.assertEqual(resp.data['summary']['count'], 1)
        self.assertEqual((resp.data['summary']['average'], resp.data['my_review']['comment']), (5.0, 'Great course!'))
        self.assertEqual(self.client.delete(self.url()).data['summary']['count'], 0)

    def test_averages_distribution_and_privacy(self):
        self.enroll()
        self.enroll(self.other)
        for user, stars in ((self.student, 5), (self.other, 4)):
            self.as_(user)
            self.client.post(self.url(), {'rating': stars, 'comment': 'x'}, format='json')
        self.client.force_authenticate(None)
        data = self.client.get(self.url()).data
        self.assertEqual((data['summary']['count'], data['summary']['average']), (2, 4.5))
        self.assertEqual((data['summary']['distribution']['5'], data['summary']['distribution']['4']), (1, 1))
        names = [r['name'] for r in data['reviews']]
        self.assertIn('Amina K.', names)
        self.assertNotIn('amina@example.com', str(data))  # no email addresses in public reviews
        self.assertFalse(any(r['mine'] for r in data['reviews']))

    def test_course_page_stats(self):
        self.enroll()
        self.as_(self.student)
        self.client.post(self.url(), {'rating': 4}, format='json')
        stats = self.client.get(f'{API}/courses/web/').data['course']['stats']
        self.assertEqual((stats['lesson_count'], stats['total_seconds'], stats['rating_average'], stats['rating_count'], stats['student_count']), (3, 120, 4.0, 1, 1))


class CoursePageFieldsTests(LmsCase):
    def test_public_course_carries_the_course_page_fields(self):
        Course.objects.filter(pk=self.course.pk).update(
            description='Para one.\n\nPara two.', learn_points=['Build sites'], requirements=['A laptop'], audience=['Beginners'],
            level='beginner', instructor_name='Ibrahim', promo_video_url='https://youtu.be/dQw4w9WgXcQ', enrollment_mode='open')
        data = self.client.get('/api/v1/catalog/courses/').data[0]
        self.assertEqual((data['level'], data['instructor_name'], data['enrollment_mode'], data['learn_points']), ('beginner', 'Ibrahim', 'open', ['Build sites']))
        self.assertEqual(data['promo_embed_url'], 'https://www.youtube-nocookie.com/embed/dQw4w9WgXcQ')
        self.assertEqual(data['lesson_count'], 3)
        outline = self.client.get(f'{API}/courses/web/').data['course']
        self.assertEqual((outline['description'], outline['stats']['lesson_count']), ('Para one.\n\nPara two.', 3))

    def test_admin_edits_the_course_page_and_input_is_checked(self):
        self.as_(self.admin)
        url = f'/api/v1/catalog/manage/courses/{self.course.id}/'
        ok = self.client.patch(url, {'description': 'Hi', 'learn_points': ['One', ' ', 'Two'], 'level': 'advanced', 'enrollment_mode': 'open',
                                     'thumbnail': '/media/site/x.jpg', 'promo_video_url': 'https://vimeo.com/123456789'}, format='json')
        self.assertEqual(ok.status_code, 200, ok.data)
        self.assertEqual(ok.data['learn_points'], ['One', 'Two'])
        for field, value in (('thumbnail', 'javascript:alert(1)'), ('instructor_photo', '//evil.example/x.png'), ('promo_video_url', 'https://evil.example/v'), ('level', 'expert'), ('enrollment_mode', 'free')):
            self.assertEqual(self.client.patch(url, {field: value}, format='json').status_code, 400, field)


class OpenEnrolmentTests(LmsCase):
    def enrol(self, user):
        self.as_(user)
        return self.client.post('/api/v1/portal/me/training/', {'slug': 'web'}, format='json')

    def test_by_approval_courses_wait_for_confirmation(self):
        resp = self.enrol(self.student)
        self.assertEqual((resp.status_code, resp.data['status']), (201, 'requested'))
        self.assertEqual(self.client.get(f'{API}/lessons/{self.reading.id}/').status_code, 403)

    def test_open_courses_give_instant_access(self):
        Course.objects.filter(pk=self.course.pk).update(enrollment_mode='open')
        resp = self.enrol(self.student)
        self.assertEqual((resp.status_code, resp.data['status']), (201, 'active'))
        self.assertEqual(self.client.get(f'{API}/lessons/{self.reading.id}/').status_code, 200)

    def test_a_pending_request_is_upgraded_when_the_course_is_opened(self):
        self.enrol(self.student)
        Course.objects.filter(pk=self.course.pk).update(enrollment_mode='open')
        self.assertEqual(self.enrol(self.student).data['status'], 'active')

    def test_re_enrolling_after_cancelling_follows_the_mode(self):
        TrainingEnrollment.objects.create(student=self.student, course=self.course, status=TrainingEnrollment.CANCELLED)
        Course.objects.filter(pk=self.course.pk).update(enrollment_mode='open')
        self.assertEqual(self.enrol(self.student).data['status'], 'active')
