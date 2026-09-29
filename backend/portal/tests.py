import tempfile

from django.core.files.uploadedfile import SimpleUploadedFile
from django.test import TestCase
from rest_framework.test import APIClient

from accounts.models import ActivityLog, User
from catalog.models import Scholarship
from .models import DEFAULT_DOCUMENTS, Application, PortalEvent, StaffNote

BASE = '/api/v1/portal'


def make_user(role=User.STUDENT, email='ama@example.com'):
    return User.objects.create_user(
        email=email, password='Passw0rd!', first_name='Ama', last_name='Kamara', role=role,
        approval_status=User.APPROVED, is_verified=True,
    )


class StudentPortalTests(TestCase):
    def setUp(self):
        self.student = make_user()
        self.client = APIClient()
        self.client.force_authenticate(self.student)

    def test_goals_drive_recommendations(self):
        self.client.put(f'{BASE}/me/goals/', {'levels': ['Undergraduate'], 'destinations': ['ca']}, format='json')
        recommended = self.client.get(f'{BASE}/me/').data['recommended']
        self.assertEqual(recommended[0]['slug'], 'lester-pearson')  # the Canadian undergraduate award
        self.assertTrue(recommended[0]['url'])  # signed in: official link included

    def test_save_and_start_an_application(self):
        self.assertEqual(self.client.post(f'{BASE}/me/saved/', {'slug': 'chevening'}, format='json').status_code, 201)
        resp = self.client.post(f'{BASE}/me/applications/', {'slug': 'chevening'}, format='json')
        self.assertEqual(resp.status_code, 201)
        self.assertEqual([d['name'] for d in resp.data['documents']], DEFAULT_DOCUMENTS)
        # Starting again returns the same application.
        self.assertEqual(self.client.post(f'{BASE}/me/applications/', {'slug': 'chevening'}, format='json').data['id'], resp.data['id'])
        me = self.client.get(f'{BASE}/me/').data
        self.assertEqual([s['slug'] for s in me['saved']], ['chevening'])
        self.assertNotIn('chevening', [s['slug'] for s in me['recommended']])

    def test_student_can_move_stage_and_tick_documents_but_not_write_staff_advice(self):
        app = self.client.post(f'{BASE}/me/applications/', {'slug': 'daad'}, format='json').data
        resp = self.client.patch(f'{BASE}/me/applications/{app["id"]}/', {'stage': 'preparing', 'counsellor_note': 'hacked'}, format='json')
        self.assertEqual((resp.data['stage'], resp.data['counsellor_note']), ('preparing', ''))
        doc = app['documents'][0]['id']
        self.assertTrue(self.client.patch(f'{BASE}/me/documents/{doc}/', {'is_done': True}, format='json').data['done_at'])
        kinds = set(PortalEvent.objects.filter(user=self.student).values_list('kind', flat=True))
        self.assertEqual(kinds, {PortalEvent.STARTED, PortalEvent.STAGE, PortalEvent.DOCUMENT})

    def test_asking_adram_to_apply_uses_the_admins_settings(self):
        Scholarship.objects.filter(slug='daad').update(service_fee='Free', service_requirements=['Degree certificate', 'CV'])
        app = self.client.post(f'{BASE}/me/applications/', {'slug': 'daad'}, format='json').data
        self.assertEqual([d['name'] for d in app['documents']], ['Degree certificate', 'CV'])
        self.assertEqual(app['scholarship_info']['service_fee'], 'Free')
        resp = self.client.post(f'{BASE}/me/applications/{app["id"]}/request-service/')
        self.assertTrue(resp.data['service_requested_at'])
        self.assertEqual(resp.data['stage'], 'preparing')
        self.assertTrue(PortalEvent.objects.filter(user=self.student, kind=PortalEvent.SERVICE).exists())
        Scholarship.objects.filter(slug='fulbright').update(service_enabled=False)
        other = self.client.post(f'{BASE}/me/applications/', {'slug': 'fulbright'}, format='json').data
        self.assertEqual(self.client.post(f'{BASE}/me/applications/{other["id"]}/request-service/').status_code, 400)

    def test_students_cannot_touch_other_students_data(self):
        other = make_user(email='other@example.com')
        app = Application.objects.create(student=other, scholarship_name='Theirs')
        self.assertEqual(self.client.patch(f'{BASE}/me/applications/{app.pk}/', {'stage': 'submitted'}, format='json').status_code, 404)
        self.assertEqual(self.client.get(f'{BASE}/staff/students/{other.pk}/').status_code, 403)

    def test_viewing_and_opening_links_are_tracked(self):
        self.client.get('/api/v1/catalog/scholarships/chevening/')
        self.client.get('/api/v1/catalog/scholarships/chevening/')  # repeat view within 30 min counts once
        self.client.post(f'{BASE}/me/events/', {'kind': 'opened_link', 'slug': 'chevening'}, format='json')
        kinds = list(PortalEvent.objects.filter(user=self.student).values_list('kind', flat=True))
        self.assertEqual(sorted(kinds), ['opened_link', 'viewed'])


class StaffPortalTests(TestCase):
    def setUp(self):
        self.admin = make_user(User.ADMIN, 'admin@example.com')
        self.student = make_user()
        self.client = APIClient()
        self.client.force_authenticate(self.admin)

    def test_admin_tracks_an_application_for_a_student(self):
        url = f'{BASE}/staff/students/{self.student.pk}/applications/'
        resp = self.client.post(url, {'scholarship_slug': 'fulbright', 'stage': 'preparing', 'next_step': 'Book IELTS',
                                      'counsellor_note': 'Strong profile.'}, format='json')
        self.assertEqual(resp.status_code, 201, resp.data)
        self.assertEqual(self.client.post(url, {'scholarship_slug': 'fulbright'}, format='json').status_code, 400)
        other = self.client.post(url, {'scholarship_name': 'University bursary'}, format='json')
        self.assertEqual(other.data['scholarship_slug'], None)

        app_id = resp.data['id']
        self.client.patch(f'{BASE}/staff/applications/{app_id}/', {'stage': 'submitted'}, format='json')
        self.client.post(f'{BASE}/staff/applications/{app_id}/documents/', {'name': 'Embassy form'}, format='json')

        # The student sees the staff's advice and the extra document.
        student = APIClient()
        student.force_authenticate(self.student)
        mine = student.get(f'{BASE}/me/').data['applications']
        fulbright = next(a for a in mine if a['scholarship_slug'] == 'fulbright')
        self.assertEqual((fulbright['stage'], fulbright['next_step'], fulbright['counsellor_note']), ('submitted', 'Book IELTS', 'Strong profile.'))
        self.assertEqual(fulbright['documents'][-1]['name'], 'Embassy form')

        board = self.client.get(f'{BASE}/staff/applications/?stage=submitted').data
        self.assertEqual(board['count'], 1)
        self.assertEqual(board['results'][0]['student_name'], 'Ama Kamara')
        self.assertEqual(board['stage_counts']['interested'], 1)

    def test_private_notes_and_timeline(self):
        self.client.post(f'{BASE}/staff/students/{self.student.pk}/notes/', {'body': 'Called about DAAD.'}, format='json')
        ActivityLog.objects.create(user=self.student, action=ActivityLog.LOGIN, description='Signed in')
        PortalEvent.objects.create(user=self.student, kind=PortalEvent.OPENED_LINK, label='Chevening Scholarships',
                                   scholarship=Scholarship.objects.get(slug='chevening'))
        data = self.client.get(f'{BASE}/staff/students/{self.student.pk}/').data
        self.assertEqual(data['notes'][0]['author_name'], 'Ama Kamara')
        self.assertEqual({e['source'] for e in data['timeline']}, {'portal', 'account'})
        self.assertEqual((data['stats']['opened_links'], data['stats']['sign_ins']), (1, 1))
        # Notes are never part of the student's own portal.
        student = APIClient()
        student.force_authenticate(self.student)
        self.assertNotIn('notes', student.get(f'{BASE}/me/').data)
        self.assertEqual(StaffNote.objects.count(), 1)


class ServiceFlowTests(TestCase):
    """Request -> admin approves -> terms -> payment + documents -> admin confirms."""

    def setUp(self):
        import shutil
        import tempfile
        from unittest import mock
        from django.core import mail  # noqa: F401  (outbox is reset per test)
        from .models import PaymentSettings, private_storage

        tmp = tempfile.mkdtemp()
        self.addCleanup(shutil.rmtree, tmp, ignore_errors=True)
        for attr in ('location', 'base_location'):
            patcher = mock.patch.object(private_storage, attr, tmp)
            patcher.start()
            self.addCleanup(patcher.stop)
        PaymentSettings.objects.all().delete()  # the migration adds a row with the standard terms
        PaymentSettings.objects.create(afrimoney_number='030 000 000', orange_money_number='076 000 000', terms='Fees are not refundable.')

        self.student, self.admin = make_user(), make_user(User.ADMIN, 'admin@example.com')
        self.client, self.staff = APIClient(), APIClient()
        self.client.force_authenticate(self.student)
        self.staff.force_authenticate(self.admin)
        self.app = self.client.post(f'{BASE}/me/applications/', {'slug': 'chevening'}, format='json').data

    def upload(self, name='receipt.pdf', size=100):
        from django.core.files.uploadedfile import SimpleUploadedFile
        return SimpleUploadedFile(name, b'%PDF' + b'x' * size, content_type='application/pdf')

    def test_full_flow(self):
        from django.core import mail
        app_id = self.app['id']
        data = self.client.post(f'{BASE}/me/applications/{app_id}/request-service/').data
        self.assertEqual(data['service']['status'], 'requested')
        self.assertIsNone(data['service']['payment'])  # locked until approved
        self.assertEqual(self.staff.get(f'{BASE}/staff/summary/').data['service_requests'], 1)

        # Paying before approval is refused.
        self.assertEqual(self.client.post(f'{BASE}/me/applications/{app_id}/service/accept-terms/').status_code, 400)

        with self.captureOnCommitCallbacks(execute=True):
            data = self.staff.post(f'{BASE}/staff/applications/{app_id}/service/',
                                   {'action': 'approve', 'amount': '1500', 'guidelines': 'Send your essays first.'}, format='json').data
        self.assertEqual(data['service']['status'], 'approved')
        self.assertIn('guidelines', mail.outbox[-1].subject.lower() + mail.outbox[-1].body.lower())

        mine = self.client.get(f'{BASE}/me/applications/{app_id}/').data['service']
        self.assertEqual((mine['amount'], mine['guidelines'], mine['reference']), ('1500.00', 'Send your essays first.', f'ADR-{app_id:05d}'))
        self.assertEqual(mine['payment']['terms'], 'Fees are not refundable.')

        # Terms first, then the receipt.
        pay = {'payment_method': 'orange_money', 'transaction_id': 'OM123', 'receipt': self.upload()}
        self.assertEqual(self.client.post(f'{BASE}/me/applications/{app_id}/service/payment/', pay, format='multipart').status_code, 400)
        self.client.post(f'{BASE}/me/applications/{app_id}/service/accept-terms/')
        pay['receipt'] = self.upload()
        data = self.client.post(f'{BASE}/me/applications/{app_id}/service/payment/', pay, format='multipart').data
        self.assertEqual((data['service']['status'], data['service']['has_receipt']), ('payment_submitted', True))

        # Upload a document; it's ticked off and only the owner or an admin can download it.
        doc_id = data['documents'][0]['id']
        doc = self.client.post(f'{BASE}/me/documents/{doc_id}/file/', {'file': self.upload('passport.jpg')}, format='multipart').data
        self.assertTrue(doc['is_done'] and doc['has_file'])
        own = self.client.get(f'{BASE}/files/documents/{doc_id}/')
        self.assertEqual(own.status_code, 200)
        own.close()
        receipt = self.staff.get(f'{BASE}/files/receipts/{data["service"]["id"]}/')
        self.assertEqual(receipt.status_code, 200)
        receipt.close()
        stranger = APIClient()
        stranger.force_authenticate(make_user(email='other@example.com'))
        self.assertEqual(stranger.get(f'{BASE}/files/documents/{doc_id}/').status_code, 404)
        self.assertEqual(stranger.get(f'{BASE}/files/receipts/{data["service"]["id"]}/').status_code, 404)

        # Admin rejects, student re-uploads, admin confirms.
        self.staff.post(f'{BASE}/staff/applications/{app_id}/service/', {'action': 'reject_payment', 'note': 'Wrong amount'}, format='json')
        mine = self.client.get(f'{BASE}/me/applications/{app_id}/').data['service']
        self.assertEqual((mine['status'], mine['decision_note']), ('payment_rejected', 'Wrong amount'))
        pay['receipt'] = self.upload()
        self.client.post(f'{BASE}/me/applications/{app_id}/service/payment/', pay, format='multipart')
        with self.captureOnCommitCallbacks(execute=True):
            data = self.staff.post(f'{BASE}/staff/applications/{app_id}/service/', {'action': 'confirm_payment'}, format='json').data
        self.assertEqual(data['service']['status'], 'paid')
        self.assertIn('Payment confirmed', mail.outbox[-1].subject)

    def test_uploads_are_checked(self):
        doc_id = self.app['documents'][0]['id']
        resp = self.client.post(f'{BASE}/me/documents/{doc_id}/file/', {'file': self.upload('virus.exe')}, format='multipart')
        self.assertEqual(resp.status_code, 400)

    def test_decline_and_ask_again(self):
        app_id = self.app['id']
        self.client.post(f'{BASE}/me/applications/{app_id}/request-service/')
        self.staff.post(f'{BASE}/staff/applications/{app_id}/service/', {'action': 'decline', 'note': 'Not eligible'}, format='json')
        self.assertEqual(self.client.get(f'{BASE}/me/applications/{app_id}/').data['service']['status'], 'declined')
        again = self.client.post(f'{BASE}/me/applications/{app_id}/request-service/').data
        self.assertEqual(again['service']['status'], 'requested')
        approve = self.staff.post(f'{BASE}/staff/applications/{app_id}/service/', {'action': 'approve'}, format='json')
        self.assertIn('amount', approve.data)


class ReviewAndProgressTests(ServiceFlowTests):
    """Document review (accept / return with a tag) and the admin's progress timeline."""
    # Reuse the setup above without running its tests twice.
    test_full_flow = test_uploads_are_checked = test_decline_and_ask_again = None

    def pay_and_confirm(self):
        app_id = self.app['id']
        self.client.post(f'{BASE}/me/applications/{app_id}/request-service/')
        self.staff.post(f'{BASE}/staff/applications/{app_id}/service/', {'action': 'approve', 'amount': '500'}, format='json')
        self.client.post(f'{BASE}/me/applications/{app_id}/service/accept-terms/')
        self.client.post(f'{BASE}/me/applications/{app_id}/service/payment/',
                         {'payment_method': 'afrimoney', 'transaction_id': 'AF1', 'receipt': self.upload()}, format='multipart')
        return self.staff.post(f'{BASE}/staff/applications/{app_id}/service/', {'action': 'confirm_payment'}, format='json').data

    def test_confirming_payment_starts_the_timeline_and_admin_edits_it(self):
        data = self.pay_and_confirm()
        titles = [m['title'] for m in data['milestones']]
        self.assertEqual(titles[0], 'Payment confirmed')
        self.assertEqual(data['milestones'][0]['status'], 'done')

        second = data['milestones'][1]['id']
        data = self.staff.patch(f'{BASE}/staff/milestones/{second}/',
                                {'status': 'done', 'due_date': '2026-10-01', 'note': 'All six documents checked.'}, format='json').data
        self.assertEqual(data['milestones'][1]['status'], 'done')
        self.assertTrue(data['milestones'][1]['completed_at'])
        data = self.staff.post(f'{BASE}/staff/applications/{self.app["id"]}/milestones/', {'title': 'Interview practice'}, format='json').data
        self.assertEqual(data['milestones'][-1]['title'], 'Interview practice')
        ids = [m['id'] for m in data['milestones']][::-1]
        data = self.staff.post(f'{BASE}/staff/applications/{self.app["id"]}/milestones/reorder/', {'ids': ids}, format='json').data
        self.assertEqual(data['milestones'][0]['title'], 'Interview practice')

        # The student sees the same timeline but can't change it.
        mine = self.client.get(f'{BASE}/me/applications/{self.app["id"]}/').data
        self.assertEqual(mine['milestones'][0]['title'], 'Interview practice')
        self.assertEqual(self.client.patch(f'{BASE}/staff/milestones/{second}/', {'status': 'todo'}, format='json').status_code, 403)

    def test_returning_a_document_and_reuploading(self):
        from django.core import mail
        self.pay_and_confirm()
        doc_id = self.app['documents'][0]['id']
        self.client.post(f'{BASE}/me/documents/{doc_id}/file/', {'file': self.upload('passport.jpg')}, format='multipart')
        self.assertEqual(self.staff.get(f'{BASE}/staff/summary/').data['documents_to_check'], 1)

        bad = self.staff.post(f'{BASE}/staff/documents/{doc_id}/review/', {'status': 'returned'}, format='json')
        self.assertIn('tag', bad.data)
        with self.captureOnCommitCallbacks(execute=True):
            doc = self.staff.post(f'{BASE}/staff/documents/{doc_id}/review/',
                                  {'status': 'returned', 'tag': 'expired', 'note': 'Passport expired in 2025.'}, format='json').data
        self.assertEqual((doc['review_status'], doc['review_tag_display'], doc['is_done']), ('returned', 'Expired', False))
        self.assertIn('Please re-upload', mail.outbox[-1].subject)

        mine = self.client.get(f'{BASE}/me/applications/{self.app["id"]}/').data['documents'][0]
        self.assertEqual((mine['review_status'], mine['review_note']), ('returned', 'Passport expired in 2025.'))

        doc = self.client.post(f'{BASE}/me/documents/{doc_id}/file/', {'file': self.upload('new-passport.jpg')}, format='multipart').data
        self.assertEqual((doc['review_status'], doc['resubmitted']), ('', True))

        self.staff.post(f'{BASE}/staff/documents/{doc_id}/review/', {'status': 'accepted'}, format='json')
        locked = self.client.post(f'{BASE}/me/documents/{doc_id}/file/', {'file': self.upload('again.jpg')}, format='multipart')
        self.assertEqual(locked.status_code, 400)
        self.assertEqual(self.staff.get(f'{BASE}/staff/summary/').data['documents_to_check'], 0)

class ResultTests(ServiceFlowTests):
    """The scholarship result comes from ADRAM: students can't set it on applications ADRAM is handling."""
    test_full_flow = test_uploads_are_checked = test_decline_and_ask_again = None

    def test_result_is_set_by_admin_and_emailed(self):
        from django.core import mail
        app_id = self.app['id']
        self.client.post(f'{BASE}/me/applications/{app_id}/request-service/')
        resp = self.client.patch(f'{BASE}/me/applications/{app_id}/', {'stage': 'accepted'}, format='json')
        self.assertEqual(resp.status_code, 400)

        self.staff.post(f'{BASE}/staff/applications/{app_id}/milestones/', {'title': 'Submitted'}, format='json')
        with self.captureOnCommitCallbacks(execute=True):
            data = self.staff.patch(f'{BASE}/staff/applications/{app_id}/',
                                    {'stage': 'unsuccessful', 'result_message': 'The provider received many strong applications.'},
                                    format='json').data
        self.assertEqual(data['stage'], 'unsuccessful')
        self.assertTrue(all(m['status'] == 'done' for m in data['milestones']))
        self.assertIn('Your scholarship result', mail.outbox[-1].subject)
        self.assertIn('many strong applications', mail.outbox[-1].body)
        mine = self.client.get(f'{BASE}/me/applications/{app_id}/').data
        self.assertEqual(mine['result_message'], 'The provider received many strong applications.')
        # A student can't write the result message either.
        self.client.patch(f'{BASE}/me/applications/{app_id}/', {'result_message': 'x'}, format='json')
        self.assertEqual(self.client.get(f'{BASE}/me/applications/{app_id}/').data['result_message'],
                         'The provider received many strong applications.')


class InterviewAndResultFileTests(ServiceFlowTests):
    """Results date, interview link and result documents, all set by ADRAM."""
    test_full_flow = test_uploads_are_checked = test_decline_and_ask_again = None

    def test_interview_details_and_results_date(self):
        from django.core import mail
        app_id = self.app['id']
        url = f'{BASE}/staff/applications/{app_id}/'
        bad = self.staff.patch(url, {'interview_link': 'javascript:alert(1)'}, format='json')
        self.assertIn('interview_link', bad.data)
        with self.captureOnCommitCallbacks(execute=True):
            data = self.staff.patch(url, {'stage': 'interview', 'interview_at': '2026-11-02T10:00:00Z',
                                          'interview_link': 'https://meet.example.com/abc', 'result_expected_on': '2027-03-01'},
                                    format='json').data
        self.assertEqual(data['interview_link'], 'https://meet.example.com/abc')
        self.assertIn('https://meet.example.com/abc', mail.outbox[-1].body)
        self.assertIn('01 March 2027', mail.outbox[-1].body)
        # Changing only the time emails the student again.
        with self.captureOnCommitCallbacks(execute=True):
            self.staff.patch(url, {'interview_at': '2026-11-03T09:00:00Z'}, format='json')
        self.assertIn('03 November 2026', mail.outbox[-1].body)
        # Students see it but can't change it.
        self.client.patch(f'{BASE}/me/applications/{app_id}/', {'interview_link': 'https://evil.example.com'}, format='json')
        self.assertEqual(self.client.get(f'{BASE}/me/applications/{app_id}/').data['interview_link'], 'https://meet.example.com/abc')

    def test_result_documents(self):
        from django.core import mail
        from django.core.files.uploadedfile import SimpleUploadedFile
        app_id = self.app['id']
        image = SimpleUploadedFile('award.png', b'PNG' + b'x' * 50, content_type='image/png')
        with self.captureOnCommitCallbacks(execute=True):
            data = self.staff.post(f'{BASE}/staff/applications/{app_id}/result-files/', {'file': image, 'title': 'Award letter'},
                                   format='multipart').data
        result = data['result_files'][0]
        self.assertEqual((result['title'], result['kind']), ('Award letter', 'image'))
        self.assertIn('result documents', mail.outbox[-1].subject)
        own = self.client.get(f'{BASE}/files/results/{result["id"]}/')
        self.assertEqual(own.status_code, 200)
        own.close()
        stranger = APIClient()
        stranger.force_authenticate(make_user(email='nosy@example.com'))
        self.assertEqual(stranger.get(f'{BASE}/files/results/{result["id"]}/').status_code, 404)
        self.assertEqual(self.client.post(f'{BASE}/staff/applications/{app_id}/result-files/', {}, format='multipart').status_code, 403)
        data = self.staff.delete(f'{BASE}/staff/result-files/{result["id"]}/').data
        self.assertEqual(data['result_files'], [])


class DeleteApplicationTests(ServiceFlowTests):
    """Administrators delete an application from the Applications table; its uploaded files go with it."""
    test_full_flow = test_uploads_are_checked = test_decline_and_ask_again = None

    def test_admin_deletes_an_application_and_its_files(self):
        import os
        from django.core.files.uploadedfile import SimpleUploadedFile
        from .models import ResultFile, private_storage
        app_id = self.app['id']
        image = SimpleUploadedFile('award.png', b'PNG' + b'x' * 50, content_type='image/png')
        self.staff.post(f'{BASE}/staff/applications/{app_id}/result-files/', {'file': image, 'title': 'Award letter'}, format='multipart')
        path = private_storage.path(ResultFile.objects.get(application_id=app_id).file.name)
        self.assertTrue(os.path.exists(path))

        self.assertEqual(self.client.delete(f'{BASE}/staff/applications/{app_id}/').status_code, 403)  # students can't
        self.assertEqual(self.staff.delete(f'{BASE}/staff/applications/{app_id}/').status_code, 204)
        self.assertFalse(Application.objects.filter(pk=app_id).exists())
        self.assertFalse(os.path.exists(path))
        self.assertEqual(self.client.get(f'{BASE}/me/').data['applications'], [])


class CounsellorMessageTests(StaffPortalTests):
    """The counsellor's note belongs to the stage it was written for; otherwise a standard message shows."""
    test_admin_tracks_an_application_for_a_student = test_private_notes_and_timeline = None

    def test_message_follows_the_outcome(self):
        app = self.client.post(f'{BASE}/staff/students/{self.student.pk}/applications/',
                               {'scholarship_slug': 'daad', 'stage': 'preparing'}, format='json').data
        self.assertTrue(app['counsellor_message'].startswith('We’re preparing'))
        url = f'{BASE}/staff/applications/{app["id"]}/'
        data = self.client.patch(url, {'stage': 'submitted'}, format='json').data
        data = self.client.patch(url, {'counsellor_note': 'Submitted on 3 Oct. Review in progress.', 'next_step': 'Wait for our call'},
                                 format='json').data
        self.assertEqual((data['counsellor_message'], data['current_next_step']), ('Submitted on 3 Oct. Review in progress.', 'Wait for our call'))
        # A new outcome replaces the old note with that outcome's message, and drops the old next step.
        data = self.client.patch(url, {'stage': 'unsuccessful'}, format='json').data
        self.assertTrue(data['counsellor_message'].startswith('We’re sorry'))
        self.assertEqual(data['current_next_step'], '')
        data = self.client.patch(url, {'counsellor_note': 'Let’s try Erasmus Mundus next.'}, format='json').data
        self.assertEqual(data['counsellor_message'], 'Let’s try Erasmus Mundus next.')


class TrainingEnrollmentTests(TestCase):
    """Training only appears in a student's portal once they have enrolled."""

    def setUp(self):
        self.student = make_user()
        self.admin = make_user(User.ADMIN, 'admin@example.com')
        self.client, self.staff = APIClient(), APIClient()
        self.client.force_authenticate(self.student)
        self.staff.force_authenticate(self.admin)

    def test_enroll_flow(self):
        from django.core import mail
        me = self.client.get(f'{BASE}/me/').data
        self.assertEqual(me['training'], [])
        self.assertEqual(self.client.get(f'{BASE}/me/summary/').data['training'], 0)

        with self.captureOnCommitCallbacks(execute=True):
            enrollment = self.client.post(f'{BASE}/me/training/', {'slug': 'web-development'}, format='json').data
        self.assertEqual((enrollment['status'], enrollment['course']['title']), ('requested', 'Web Development'))
        self.assertIn('Training request', mail.outbox[-1].subject)
        self.assertEqual(self.client.get(f'{BASE}/me/summary/').data['training'], 1)
        self.assertEqual(self.staff.get(f'{BASE}/staff/summary/').data['training_requests'], 1)

        with self.captureOnCommitCallbacks(execute=True):
            data = self.staff.patch(f'{BASE}/staff/training/{enrollment["id"]}/',
                                    {'status': 'active', 'start_date': '2026-11-03', 'note': 'Evenings, Mon–Thu, 6–8pm.'}, format='json').data
        self.assertEqual(data['status'], 'active')
        self.assertIn('enrolled', mail.outbox[-1].subject)
        listed = self.staff.get(f'{BASE}/staff/training/').data
        self.assertEqual((listed[0]['student_name'], listed[0]['status']), ('Ama Kamara', 'active'))
        # Once enrolled, the student can't cancel on their own.
        self.assertEqual(self.client.delete(f'{BASE}/me/training/{enrollment["id"]}/').status_code, 400)

        # The Training page overview
        ov = self.staff.get(f'{BASE}/staff/training/overview/').data
        self.assertEqual((ov['total'], ov['status']['active'], ov['learners'], ov['new_7']), (1, 1, 1, 1))
        web = next(p for p in ov['programmes'] if p['title'] == 'Web Development')
        self.assertEqual((web['total'], web['active']), (1, 1))
        self.assertEqual(ov['programmes'][0]['title'], 'Web Development')      # most enrollments first
        start = next(u for u in ov['upcoming'] if u['kind'] == 'start')
        self.assertEqual((start['title'], start['student'], start['date']), ('Web Development', 'Ama Kamara', '2026-11-03'))
        self.assertEqual(len(ov['weekly']), 12)
        self.assertEqual(self.client.get(f'{BASE}/staff/training/overview/').status_code, 403)

    def test_cancelled_requests_leave_the_portal(self):
        enrollment = self.client.post(f'{BASE}/me/training/', {'slug': 'programming'}, format='json').data
        self.assertEqual(self.client.delete(f'{BASE}/me/training/{enrollment["id"]}/').status_code, 204)
        self.assertEqual(self.client.get(f'{BASE}/me/').data['training'], [])
        again = self.client.post(f'{BASE}/me/training/', {'slug': 'programming'}, format='json')
        self.assertEqual((again.status_code, again.data['status']), (201, 'requested'))

    def test_next_actions(self):
        app = self.client.post(f'{BASE}/me/applications/', {'slug': 'chevening'}, format='json').data
        self.assertEqual(self.client.get(f'{BASE}/me/actions/').data, [])
        self.client.post(f'{BASE}/me/applications/{app["id"]}/request-service/')
        self.staff.post(f'{BASE}/staff/applications/{app["id"]}/service/', {'action': 'approve', 'amount': '100'}, format='json')
        kinds = [x['kind'] for x in self.client.get(f'{BASE}/me/actions/').data]
        self.assertEqual(kinds, ['guidelines'])
        self.assertEqual(self.client.get(f'{BASE}/me/summary/').data['actions'], 1)


class BusinessInsightsTests(ServiceFlowTests):
    """The admin overview's business figures."""
    test_full_flow = test_uploads_are_checked = test_decline_and_ask_again = None

    def test_pipeline_revenue_and_outcomes(self):
        app_id = self.app['id']
        self.client.post(f'{BASE}/me/applications/{app_id}/request-service/')
        self.staff.post(f'{BASE}/staff/applications/{app_id}/service/', {'action': 'approve', 'amount': '1500'}, format='json')
        self.client.post(f'{BASE}/me/applications/{app_id}/service/accept-terms/')
        self.client.post(f'{BASE}/me/applications/{app_id}/service/payment/',
                         {'payment_method': 'afrimoney', 'transaction_id': 'AF9', 'receipt': self.upload()}, format='multipart')
        self.staff.post(f'{BASE}/staff/applications/{app_id}/service/', {'action': 'confirm_payment'}, format='json')
        self.staff.patch(f'{BASE}/staff/applications/{app_id}/', {'stage': 'accepted'}, format='json')

        data = self.staff.get(f'{BASE}/staff/insights/?days=30').data
        self.assertEqual((data['service']['paid'], data['service']['revenue'], data['service']['revenue_prev']), (1, 1500.0, 0.0))
        self.assertEqual((data['outcomes']['awarded'], data['outcomes']['success_rate']), (1, 100))
        self.assertEqual(next(p['count'] for p in data['pipeline'] if p['stage'] == 'accepted'), 1)
        self.assertEqual(data['top_scholarships'][0]['slug'], 'chevening')
        self.assertEqual(self.client.get(f'{BASE}/staff/insights/').status_code, 403)

        # Trend series, reach and outcome mix for the charts.
        self.assertEqual(len(data['series']), 30)
        today = data['series'][-1]
        self.assertEqual((today['applications'], today['service_requests'], today['revenue']), (1, 1, 1500.0))
        self.assertEqual(sum(p['revenue'] for p in data['series']), data['service']['revenue'])
        self.assertEqual(data['students']['applying'], 1)
        self.assertEqual(sum(c['count'] for c in data['countries']), data['students']['total'])
        self.assertEqual((data['outcomes']['in_progress'], data['outcomes']['withdrawn']), (0, 0))
        self.assertEqual(len(self.staff.get(f'{BASE}/staff/insights/?days=7').data['series']), 7)
        self.assertEqual([s['count'] for s in data['service_funnel']], [1, 1, 1, 1])
        self.assertEqual(data['payment_methods'], [{'key': 'afrimoney', 'label': 'Afrimoney', 'count': 1, 'amount': 1500.0}])

        # The Applications page overview
        ov = self.staff.get(f'{BASE}/staff/applications/overview/').data
        self.assertEqual((ov['total'], ov['active'], ov['awarded'], ov['success_rate']), (1, 0, 1, 100))
        self.assertEqual((ov['new_7'], ov['with_service'], ov['students']), (1, 1, 1))
        self.assertEqual(len(ov['weekly']), 12)
        self.assertEqual(sum(w['count'] for w in ov['weekly']), 1)
        self.assertEqual(ov['destinations'][0]['count'], 1)
        self.assertEqual(sum(ov['deadlines'].values()), 0)   # nothing open
        self.assertEqual(self.client.get(f'{BASE}/staff/applications/overview/').status_code, 403)

        # The Scholarships page overview
        sc = self.staff.get(f'{BASE}/staff/scholarships/overview/').data
        self.assertEqual(sc['drafts'], sc['total'] - sc['published'])
        self.assertEqual(sc['top'][0]['name'], self.app['scholarship_name'])
        self.assertEqual((sc['top'][0]['applications'], sc['top'][0]['service']), (1, 1))
        self.assertEqual((sc['interest']['applications'], sc['interest']['service']), (1, 1))
        self.assertEqual(len(sc['weekly']), 12)
        self.assertEqual(sum(w['applications'] for w in sc['weekly']), 1)
        self.assertEqual(sum(d['count'] for d in sc['destinations']), sc['published'])
        self.assertEqual(sum(sc['deadlines'].values()), sc['published'])
        self.assertEqual(self.client.get(f'{BASE}/staff/scholarships/overview/').status_code, 403)

class MessagingTests(TestCase):
    """People write to the ADRAM team; every administrator sees and answers every conversation."""

    def setUp(self):
        self.student = make_user()
        self.admin = make_user(User.ADMIN, 'admin@example.com')
        self.second_admin = make_user(User.ADMIN, 'admin2@example.com')
        self.client, self.staff, self.staff2 = APIClient(), APIClient(), APIClient()
        self.client.force_authenticate(self.student)
        self.staff.force_authenticate(self.admin)
        self.staff2.force_authenticate(self.second_admin)

    def test_conversation_round_trip(self):
        from django.core import mail
        self.assertEqual(self.client.get(f'{BASE}/me/messages/').data['messages'], [])

        with self.captureOnCommitCallbacks(execute=True):
            sent = self.client.post(f'{BASE}/me/messages/', {'body': '  Hello, can you help with my visa?  '}, format='json')
        self.assertEqual((sent.status_code, sent.data['body'], sent.data['mine']), (201, 'Hello, can you help with my visa?', True))
        self.assertIn('New message from Ama Kamara', mail.outbox[-1].subject)   # the team is told
        with self.captureOnCommitCallbacks(execute=True):
            self.client.post(f'{BASE}/me/messages/', {'body': 'Also, the deadline?'}, format='json')
        self.assertEqual(len(mail.outbox), 1)                                   # only once per unread run

        # Any administrator sees it, with unread counts in the top bar and the sidebar.
        self.assertEqual(self.staff2.get(f'{BASE}/messages/unread/').data['unread'], 2)
        self.assertEqual(self.staff.get(f'{BASE}/staff/summary/').data['messages_unread'], 2)
        inbox = self.staff.get(f'{BASE}/staff/conversations/').data
        self.assertEqual((inbox[0]['user']['email'], inbox[0]['unread'], inbox[0]['last']['body']), ('ama@example.com', 2, 'Also, the deadline?'))
        self.assertEqual(len(self.staff.get(f'{BASE}/staff/conversations/', {'search': 'visa'}).data), 1)
        self.assertEqual(len(self.staff.get(f'{BASE}/staff/conversations/', {'search': 'nothing-like-this'}).data), 0)

        # Opening the conversation marks it read for every administrator.
        thread = self.staff.get(f'{BASE}/staff/conversations/{self.student.pk}/').data
        self.assertEqual(len(thread['messages']), 2)
        self.assertEqual(self.staff2.get(f'{BASE}/messages/unread/').data['unread'], 0)

        with self.captureOnCommitCallbacks(execute=True):
            reply = self.staff.post(f'{BASE}/staff/conversations/{self.student.pk}/', {'body': 'Yes, send us your offer letter.'}, format='json')
        self.assertEqual((reply.status_code, reply.data['from_staff']), (201, True))
        self.assertEqual(mail.outbox[-1].to, ['ama@example.com'])
        self.assertEqual(self.client.get(f'{BASE}/messages/unread/').data['unread'], 1)
        self.assertEqual(self.client.get(f'{BASE}/me/summary/').data['messages_unread'], 1)

        mine = self.client.get(f'{BASE}/me/messages/').data['messages']
        self.assertEqual([m['from_staff'] for m in mine], [False, False, True])
        self.assertEqual(mine[-1]['sender_name'], 'Ama Kamara')   # the admin's name (make_user names everyone Ama)
        self.assertEqual(self.client.get(f'{BASE}/messages/unread/').data['unread'], 0)

    def test_rules(self):
        self.assertEqual(self.client.post(f'{BASE}/me/messages/', {'body': '   '}, format='json').status_code, 400)
        self.assertEqual(self.client.post(f'{BASE}/me/messages/', {'body': 'x' * 4001}, format='json').status_code, 400)
        # People can't read the inbox or other conversations.
        self.assertEqual(self.client.get(f'{BASE}/staff/conversations/').status_code, 403)
        self.assertEqual(self.client.get(f'{BASE}/staff/conversations/{self.admin.pk}/').status_code, 403)
        # Admins use the inbox, and don't message each other.
        self.assertEqual(self.staff.post(f'{BASE}/me/messages/', {'body': 'hi'}, format='json').status_code, 400)
        self.assertEqual(self.staff.post(f'{BASE}/staff/conversations/{self.second_admin.pk}/', {'body': 'hi'}, format='json').status_code, 400)
        # An admin can start a conversation with anyone.
        self.assertEqual(self.staff.post(f'{BASE}/staff/conversations/{self.student.pk}/', {'body': 'Welcome!'}, format='json').status_code, 201)
        self.assertEqual(self.client.get(f'{BASE}/messages/unread/').data['unread'], 1)

    def test_admins_delete_messages_and_conversations(self):
        from .models import Conversation
        first = self.client.post(f'{BASE}/me/messages/', {'body': 'First'}, format='json').data
        second = self.client.post(f'{BASE}/me/messages/', {'body': 'Second'}, format='json').data
        one = f'{BASE}/staff/conversations/{self.student.pk}/messages/{second["id"]}/'
        # Only administrators can delete, and only within the right conversation.
        self.assertEqual(self.client.delete(one).status_code, 403)
        self.assertEqual(self.staff.delete(f'{BASE}/staff/conversations/{self.admin.pk}/messages/{second["id"]}/').status_code, 404)

        self.assertEqual(self.staff.delete(one).status_code, 204)
        inbox = self.staff.get(f'{BASE}/staff/conversations/').data
        self.assertEqual((inbox[0]['total'], inbox[0]['last']['body']), (1, 'First'))
        conversation = Conversation.objects.get(user=self.student)
        self.assertEqual(conversation.last_message_at, conversation.messages.get(pk=first['id']).created_at)

        # Deleting the whole conversation empties the inbox and the person's own view.
        self.assertEqual(self.client.delete(f'{BASE}/staff/conversations/{self.student.pk}/').status_code, 403)
        self.assertEqual(self.staff.delete(f'{BASE}/staff/conversations/{self.student.pk}/').status_code, 204)
        self.assertEqual(self.staff.get(f'{BASE}/staff/conversations/').data, [])
        self.assertEqual(self.client.get(f'{BASE}/me/messages/').data['messages'], [])
        self.assertEqual(self.staff.delete(f'{BASE}/staff/conversations/{self.student.pk}/').status_code, 404)


class MessageStatsTests(TestCase):
    def test_stats_for_both_sides(self):
        from datetime import timedelta
        from django.utils import timezone
        from .models import Conversation, Message

        student, admin = make_user(), make_user(User.ADMIN, 'admin@example.com')
        other = make_user(email='other@example.com')
        now = timezone.now()
        conv = Conversation.objects.create(user=student, last_message_at=now)
        # Two messages in a row, answered 30 minutes after the first; then a question still waiting.
        for minutes_ago, staff in [(120, False), (110, False), (90, True), (10, False)]:
            m = Message.objects.create(conversation=conv, sender=admin if staff else student, from_staff=staff, body='x',
                                       read_at=now if staff else None)
            Message.objects.filter(pk=m.pk).update(created_at=now - timedelta(minutes=minutes_ago))
        Conversation.objects.create(user=other, last_message_at=now - timedelta(days=20))
        Message.objects.create(conversation=Conversation.objects.get(user=other), sender=admin, from_staff=True, body='hi', read_at=now)

        staff_client, student_client = APIClient(), APIClient()
        staff_client.force_authenticate(admin)
        student_client.force_authenticate(student)

        s = staff_client.get(f'{BASE}/messages/stats/').data
        self.assertEqual((s['conversations'], s['awaiting_reply'], s['unread']), (2, 1, 3))
        self.assertEqual((s['median_reply_minutes'], s['replied_within_hour']), (30.0, 100))
        self.assertEqual(len(s['series']), 14)
        self.assertEqual(sum(p['people'] for p in s['series']), 3)

        mine = student_client.get(f'{BASE}/messages/stats/').data
        self.assertEqual((mine['sent'], mine['received'], mine['unread'], mine['awaiting_reply']), (3, 1, 0, True))
        self.assertNotIn('conversations', mine)   # people only see their own figures


class MessageAttachmentTests(TestCase):
    """Files, photos and voice messages in chats, for both sides."""

    def setUp(self):
        import shutil
        from unittest import mock
        from .models import private_storage

        tmp = tempfile.mkdtemp()   # keep test uploads out of private_media/
        self.addCleanup(shutil.rmtree, tmp, ignore_errors=True)
        for attr in ('location', 'base_location'):
            patcher = mock.patch.object(private_storage, attr, tmp)
            patcher.start()
            self.addCleanup(patcher.stop)
        self.student = make_user()
        self.admin = make_user(User.ADMIN, 'admin@example.com')
        self.client, self.staff = APIClient(), APIClient()
        self.client.force_authenticate(self.student)
        self.staff.force_authenticate(self.admin)

    def upload(self, name, size=100, content_type='application/octet-stream'):
        return SimpleUploadedFile(name, b'x' * size, content_type=content_type)

    def test_files_photos_and_voice(self):
        pdf = self.client.post(f'{BASE}/me/messages/', {'file': self.upload('offer letter.pdf')}, format='multipart')
        self.assertEqual(pdf.status_code, 201)
        self.assertEqual((pdf.data['body'], pdf.data['attachment']['kind'], pdf.data['attachment']['name']), ('', 'file', 'offer letter.pdf'))

        photo = self.client.post(f'{BASE}/me/messages/', {'body': 'My passport', 'file': self.upload('scan.JPG')}, format='multipart')
        self.assertEqual((photo.data['body'], photo.data['attachment']['kind']), ('My passport', 'image'))

        voice = self.staff.post(f'{BASE}/staff/conversations/{self.student.pk}/',
                                {'file': self.upload('recording.webm'), 'voice': 'true', 'duration': '12'}, format='multipart')
        self.assertEqual(voice.status_code, 201)
        self.assertEqual((voice.data['attachment']['kind'], voice.data['attachment']['duration'], voice.data['attachment']['name']),
                         ('audio', 12, 'Voice message.webm'))

        # Previews describe attachments.
        self.assertEqual(self.staff.get(f'{BASE}/staff/conversations/').data[0]['last']['body'], 'Voice message (0:12)')
        self.assertEqual(self.client.get(f'{BASE}/messages/unread/').data['recent'][0]['body'], 'Voice message (0:12)')

        # The person and administrators can open attachments; nobody else can.
        file_url = f'{BASE}/files/messages/{pdf.data["id"]}/'
        self.assertEqual(self.client.get(file_url).status_code, 200)
        self.assertEqual(self.staff.get(file_url).status_code, 200)
        stranger = APIClient()
        stranger.force_authenticate(make_user(email='nosy@example.com'))
        self.assertEqual(stranger.get(file_url).status_code, 404)
        self.assertEqual(stranger.get(f'{BASE}/files/messages/{voice.data["id"]}/').status_code, 404)

    def test_attachment_rules(self):
        post = lambda data: self.client.post(f'{BASE}/me/messages/', data, format='multipart')
        self.assertEqual(post({'body': ''}).status_code, 400)                                   # nothing to send
        self.assertEqual(post({'file': self.upload('virus.exe')}).status_code, 400)             # not an allowed type
        self.assertEqual(post({'file': self.upload('clip.webm')}).status_code, 400)             # video isn't a document
        self.assertEqual(post({'file': self.upload('big.pdf', size=11 * 1024 * 1024)}).status_code, 400)
        self.assertEqual(post({'file': self.upload('song.mp3')}).data['attachment']['kind'], 'audio')
        self.assertEqual(post({'file': self.upload('memo.webm'), 'voice': 'true', 'duration': '400'}).status_code, 400)  # over 5 minutes


class CallTests(TestCase):
    """Voice and video calls: signalling, who can answer, and the call log in the chat."""

    def setUp(self):
        self.student = make_user()
        self.admin = make_user(User.ADMIN, 'admin@example.com')
        self.admin2 = make_user(User.ADMIN, 'admin2@example.com')
        self.client, self.staff, self.staff2 = APIClient(), APIClient(), APIClient()
        self.client.force_authenticate(self.student)
        self.staff.force_authenticate(self.admin)
        self.staff2.force_authenticate(self.admin2)

    def test_student_calls_the_team(self):
        started = self.client.post(f'{BASE}/calls/', {'kind': 'video', 'offer': 'OFFER-SDP'}, format='json')
        self.assertEqual((started.status_code, started.data['status'], started.data['outgoing']), (201, 'ringing', True))
        call_id = started.data['id']
        # Only one open call per conversation.
        self.assertEqual(self.client.post(f'{BASE}/calls/', {'kind': 'audio', 'offer': 'x'}, format='json').status_code, 409)

        # It rings for every administrator (with the offer), not for the student.
        for staff in (self.staff, self.staff2):
            ringing = staff.get(f'{BASE}/calls/incoming/').data
            self.assertEqual((ringing[0]['id'], ringing[0]['offer'], ringing[0]['kind']), (call_id, 'OFFER-SDP', 'video'))
        self.assertEqual(self.client.get(f'{BASE}/calls/incoming/').data, [])

        # First administrator to answer takes it; the second is told.
        self.assertEqual(self.staff.post(f'{BASE}/calls/{call_id}/answer/', {'answer': 'ANSWER-SDP'}, format='json').status_code, 200)
        self.assertEqual(self.staff2.post(f'{BASE}/calls/{call_id}/answer/', {'answer': 'late'}, format='json').status_code, 409)
        self.assertEqual(self.staff2.get(f'{BASE}/calls/incoming/').data, [])
        # The caller gets the answer; nobody else sees it.
        seen = self.client.get(f'{BASE}/calls/{call_id}/').data
        self.assertEqual((seen['status'], seen['answer'], seen['staff_name']), ('accepted', 'ANSWER-SDP', 'Ama Kamara'))
        self.assertEqual(self.staff2.get(f'{BASE}/calls/{call_id}/').data['answer'], '')
        # Someone not on the call can't hang up; either participant can.
        self.assertEqual(self.staff2.post(f'{BASE}/calls/{call_id}/end/').status_code, 403)
        ended = self.client.post(f'{BASE}/calls/{call_id}/end/').data
        self.assertEqual(ended['status'], 'ended')

        # The call is logged in the chat, already read.
        log = self.client.get(f'{BASE}/me/messages/').data['messages'][-1]
        self.assertEqual((log['call']['kind'], log['call']['status'], log['read_at'] is not None), ('video', 'ended', True))
        self.assertTrue(log['call']['summary'].startswith('Video call ('))
        self.assertEqual(self.staff.get(f'{BASE}/messages/unread/').data['unread'], 0)

        stranger = APIClient()
        stranger.force_authenticate(make_user(email='nosy@example.com'))
        self.assertEqual(stranger.get(f'{BASE}/calls/{call_id}/').status_code, 404)

    def test_missed_declined_and_cancelled(self):
        from datetime import timedelta
        from django.utils import timezone
        from .models import Call

        # An admin calls the student, who doesn't pick up in time: a missed call, unread for the student.
        call_id = self.staff.post(f'{BASE}/calls/', {'kind': 'audio', 'offer': 'o', 'user': self.student.pk}, format='json').data['id']
        self.assertEqual(self.client.get(f'{BASE}/calls/incoming/').data[0]['id'], call_id)
        Call.objects.filter(pk=call_id).update(created_at=timezone.now() - timedelta(seconds=Call.RING_SECONDS + 5))
        self.assertEqual(self.client.get(f'{BASE}/calls/incoming/').data, [])
        self.assertEqual(self.staff.get(f'{BASE}/calls/{call_id}/').data['status'], 'missed')
        unread = self.client.get(f'{BASE}/messages/unread/').data
        self.assertEqual((unread['unread'], unread['recent'][0]['body']), (1, 'Missed voice call'))

        # The student declines the next one.
        call_id = self.staff.post(f'{BASE}/calls/', {'kind': 'video', 'offer': 'o', 'user': self.student.pk}, format='json').data['id']
        self.assertEqual(self.staff.post(f'{BASE}/calls/{call_id}/decline/').status_code, 403)   # the caller can't decline
        self.assertEqual(self.client.post(f'{BASE}/calls/{call_id}/decline/').data['status'], 'declined')

        # The student calls and hangs up before anyone answers: missed for the team.
        call_id = self.client.post(f'{BASE}/calls/', {'kind': 'audio', 'offer': 'o'}, format='json').data['id']
        self.assertEqual(self.client.post(f'{BASE}/calls/{call_id}/end/').data['status'], 'cancelled')
        self.assertEqual(self.staff.get(f'{BASE}/staff/conversations/').data[0]['last']['body'], 'Missed voice call')
        self.assertEqual(self.staff.get(f'{BASE}/messages/unread/').data['unread'], 1)

        # Admins can't call each other; students can't pick who to call.
        self.assertEqual(self.staff.post(f'{BASE}/calls/', {'kind': 'audio', 'offer': 'o', 'user': self.admin2.pk}, format='json').status_code, 400)
        self.assertEqual(self.client.get(f'{BASE}/calls/config/').data['ice_servers'][0]['urls'][0], 'stun:stun.l.google.com:19302')


class DefaultTermsTests(TestCase):
    def test_standard_terms_are_installed(self):
        from .models import PaymentSettings
        terms = PaymentSettings.load().terms
        self.assertIn('Terms and Conditions', terms)
        self.assertIn('Refunds and cancellation', terms)
        self.assertIn('Afrimoney or Orange Money', terms)
