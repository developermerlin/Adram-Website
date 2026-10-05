"""The application form students fill in after paying for "ADRAM applies for you"."""
from django.contrib.auth import get_user_model
from django.core import mail
from django.test import override_settings
from rest_framework.test import APITestCase

from .intake import DEFAULT_FORM
from .models import Application, IntakeForm, IntakeSubmission, ServiceRequest

User = get_user_model()
P = '/api/v1/portal'


def signature_png():
    import base64
    import io
    from PIL import Image, ImageDraw
    img = Image.new('RGBA', (240, 80), (255, 255, 255, 0))
    ImageDraw.Draw(img).line([(10, 60), (80, 20), (150, 55), (230, 15)], fill=(17, 24, 39, 255), width=3)
    buf = io.BytesIO()
    img.save(buf, 'PNG')
    return 'data:image/png;base64,' + base64.b64encode(buf.getvalue()).decode()


def full_answers():
    """Valid answers to every required question of the original form."""
    sample = {'text': 'Something', 'textarea': 'A longer answer.', 'email': 'ama@example.com', 'phone': '+232 76 000 000',
              'date': '2000-05-17', 'number': '2024', 'yes_no': 'no', 'country': 'Sierra Leone'}
    answers = {}
    for s in DEFAULT_FORM['sections']:
        for f in s['fields']:
            if f['required']:
                answers[f['id']] = f['options'][0] if f['type'] in ('select', 'radio') else sample.get(f['type'], 'x')
    return answers


@override_settings(EMAIL_BACKEND='django.core.mail.backends.locmem.EmailBackend', CONTACT_NOTIFY_EMAIL='team@example.com')
class IntakeTests(APITestCase):
    @classmethod
    def setUpTestData(cls):
        cls.admin = User.objects.create_user(email='admin@example.com', password='x', role=User.ADMIN, is_verified=True)
        cls.student = User.objects.create_user(email='ama@example.com', password='x', role=User.STUDENT, is_verified=True,
                                               first_name='Ama', last_name='Kamara', in_scholarships=True)
        cls.other = User.objects.create_user(email='bob@example.com', password='x', role=User.STUDENT, is_verified=True)
        cls.app = Application.objects.create(student=cls.student, scholarship_name='Chevening Scholarship')
        cls.service = ServiceRequest.objects.create(application=cls.app, status=ServiceRequest.APPROVED, amount=1500)

    def url(self):
        return f'{P}/me/applications/{self.app.id}/form/'

    def test_opens_only_after_payment(self):
        self.client.force_authenticate(self.student)
        self.assertEqual(self.client.get(self.url()).status_code, 403)
        ServiceRequest.objects.filter(pk=self.service.pk).update(status=ServiceRequest.PAID)
        data = self.client.get(self.url()).data
        self.assertEqual((data['status'], data['editable'], data['prefill']['full_name']), ('draft', True, 'Ama Kamara'))
        self.assertEqual(data['form']['sections'][0]['title'], 'Personal details')
        self.client.force_authenticate(self.other)
        self.assertEqual(self.client.get(self.url()).status_code, 404)  # someone else's application

    def test_draft_submit_return_and_review(self):
        ServiceRequest.objects.filter(pk=self.service.pk).update(status=ServiceRequest.PAID)
        self.client.force_authenticate(self.student)
        draft = self.client.put(self.url(), {'answers': {'full_name': 'Ama Kamara', 'not_a_question': 'x'}}, format='json').data
        self.assertEqual((draft['status'], draft['answers']['full_name']), ('draft', 'Ama Kamara'))
        self.assertNotIn('not_a_question', draft['answers'])
        incomplete = self.client.put(self.url(), {'answers': {'full_name': 'Ama'}, 'submit': True}, format='json')
        self.assertEqual(incomplete.status_code, 400)
        self.assertIn('date_of_birth', incomplete.data['errors'])
        self.assertIn('_declaration', incomplete.data['errors'])

        bad = {**full_answers(), 'email': 'nope', 'gender': 'Robot'}
        errors = self.client.put(self.url(), {'answers': bad, 'declared': True, 'submit': True}, format='json').data['errors']
        self.assertEqual(set(errors), {'email', 'gender'})

        with self.captureOnCommitCallbacks(execute=True):
            done = self.client.put(self.url(), {'answers': full_answers(), 'declared': True, 'submit': True}, format='json').data
        self.assertEqual((done['status'], done['editable']), ('submitted', False))
        self.assertEqual(mail.outbox[-1].to, ['team@example.com'])
        self.assertEqual(self.client.put(self.url(), {'answers': {}}, format='json').status_code, 400)  # locked once submitted
        card = self.client.get(f'{P}/me/applications/{self.app.id}/').data['intake']
        self.assertEqual(card['status'], 'submitted')

        self.client.force_authenticate(self.admin)
        staff = f'{P}/staff/applications/{self.app.id}/form/'
        self.assertEqual(self.client.post(staff, {'action': 'return'}, format='json').status_code, 400)  # needs a note
        with self.captureOnCommitCallbacks(execute=True):
            returned = self.client.post(staff, {'action': 'return', 'note': 'Add your passport number.'}, format='json').data
        self.assertEqual((returned['status'], returned['editable']), ('returned', True))
        self.assertIn('passport number', mail.outbox[-1].body)
        self.assertEqual(mail.outbox[-1].to, ['ama@example.com'])

        self.client.force_authenticate(self.student)
        again = self.client.put(self.url(), {'answers': {**full_answers(), 'passport_number': 'B1234567'}, 'declared': True, 'submit': True}, format='json').data
        self.assertEqual(again['status'], 'submitted')
        self.client.force_authenticate(self.admin)
        self.assertEqual(self.client.post(staff, {'action': 'approve'}, format='json').status_code, 400)  # no signature yet
        self.assertEqual(self.client.post(staff, {'action': 'approve', 'signature': 'data:image/png;base64,AAAA'}, format='json').status_code, 400)
        with self.captureOnCommitCallbacks(execute=True):
            approved = self.client.post(staff, {'action': 'approve', 'signature': signature_png(), 'title': 'Scholarship Officer', 'save_signature': True}, format='json').data
        self.assertEqual((approved['status'], approved['approval']['title']), ('reviewed', 'Scholarship Officer'))
        self.assertEqual(approved['status_display'], 'Approved by ADRAM')
        email = mail.outbox[-1]
        self.assertEqual((email.to, 'approved' in email.subject), (['ama@example.com'], True))
        self.assertIn('/form/print', email.body)
        mine = self.client.get(f'{P}/staff/my-signature/').data
        self.assertEqual((mine['title'], mine['image'][:22]), ('Scholarship Officer', 'data:image/png;base64,'))

    def test_submitted_copy_survives_form_changes(self):
        ServiceRequest.objects.filter(pk=self.service.pk).update(status=ServiceRequest.PAID)
        self.client.force_authenticate(self.student)
        self.client.put(self.url(), {'answers': full_answers(), 'declared': True, 'submit': True}, format='json')
        form = IntakeForm.load()
        form.sections = [{'id': 'new', 'title': 'New', 'description': '', 'fields': [{'id': 'q', 'type': 'text', 'label': 'Q', 'help': '', 'required': True, 'options': [], 'width': 'half', 'prefill': ''}]}]
        form.save()
        self.assertEqual(self.client.get(self.url()).data['form']['sections'][0]['title'], 'Personal details')
        self.assertEqual(IntakeSubmission.objects.get().answers['full_name'], 'Something')

    def test_admin_designs_the_form(self):
        self.client.force_authenticate(self.student)
        self.assertEqual(self.client.get(f'{P}/staff/intake-form/').status_code, 403)
        self.client.force_authenticate(self.admin)
        url = f'{P}/staff/intake-form/'
        self.assertEqual(self.client.get(url).data['title'], 'Scholarship application form')
        bad = self.client.put(url, {'title': '', 'sections': [{'title': 'S', 'fields': [{'label': 'Pick', 'type': 'select', 'options': ['Only one']}]}]}, format='json')
        self.assertEqual(bad.status_code, 400)
        self.assertEqual(len(bad.data['errors']), 2)  # no title, a choice question with one option
        good = self.client.put(url, {'title': 'Our form', 'declaration': '', 'sections': [
            {'title': 'About you', 'fields': [{'label': 'Your name', 'type': 'text', 'required': True},
                                              {'label': 'Your name', 'type': 'weird'},
                                              {'label': 'Languages', 'type': 'checkboxes', 'options': ['English', 'english', 'Krio']}]}]}, format='json').data
        fields = good['sections'][0]['fields']
        self.assertEqual([f['id'] for f in fields], ['your_name', 'your_name_2', 'languages'])  # unique ids from the labels
        self.assertEqual((fields[1]['type'], fields[2]['options'], fields[2]['width']), ('text', ['English', 'Krio'], 'full'))
        reset = self.client.delete(url).data
        self.assertEqual(reset['title'], DEFAULT_FORM['title'])


import shutil  # noqa: E402
import tempfile  # noqa: E402

from django.core.files.uploadedfile import SimpleUploadedFile  # noqa: E402

PDF = b'%PDF-1.4\n%fake form scan\n'
PNG = b'\x89PNG\r\n\x1a\n' + b'\x00' * 20


@override_settings(EMAIL_BACKEND='django.core.mail.backends.locmem.EmailBackend', CONTACT_NOTIFY_EMAIL='team@example.com')
class PaperFormTests(APITestCase):
    """The paper route: download, fill in by hand, upload a scan. And the admin's overview."""

    @classmethod
    def setUpTestData(cls):
        cls.admin = User.objects.create_user(email='admin@example.com', password='x', role=User.ADMIN, is_verified=True)
        cls.student = User.objects.create_user(email='ama@example.com', password='x', role=User.STUDENT, is_verified=True, first_name='Ama', last_name='Kamara')
        cls.app = Application.objects.create(student=cls.student, scholarship_name='Chevening Scholarship')
        cls.service = ServiceRequest.objects.create(application=cls.app, status=ServiceRequest.PAID, amount=1500)

    def setUp(self):
        self.media = tempfile.mkdtemp()  # uploads must never land in the real private_media folder
        self.addCleanup(shutil.rmtree, self.media, True)
        from portal import models as pm
        self._storage_location = pm.private_storage.location
        pm.private_storage._location = self.media
        pm.private_storage.__dict__.pop('base_location', None)
        pm.private_storage.__dict__.pop('location', None)
        self.addCleanup(self._restore)

    def _restore(self):
        from portal import models as pm
        pm.private_storage._location = self._storage_location
        pm.private_storage.__dict__.pop('base_location', None)
        pm.private_storage.__dict__.pop('location', None)

    def upload(self, *files, declared='true'):
        return self.client.post(f'{P}/me/applications/{self.app.id}/form/upload/', {'files': list(files), 'declared': declared}, format='multipart')

    def test_upload_a_scan_and_admin_reads_it(self):
        self.client.force_authenticate(self.student)
        self.assertEqual(self.upload().status_code, 400)  # no files
        fake = self.upload(SimpleUploadedFile('form.pdf', b'not really a pdf'))
        self.assertIn('isn’t a PDF', fake.data['files'])
        self.assertEqual(self.upload(SimpleUploadedFile('form.pdf', PDF), declared='').status_code, 400)  # must confirm
        with self.captureOnCommitCallbacks(execute=True):
            resp = self.upload(SimpleUploadedFile('page1.png', PNG), SimpleUploadedFile('page2.pdf', PDF))
        self.assertEqual((resp.status_code, resp.data['status'], resp.data['method'], len(resp.data['files'])), (201, 'submitted', 'upload', 2))
        self.assertIn('scanned paper form', mail.outbox[-1].body)
        from lms.models import Notification
        self.assertTrue(Notification.objects.filter(user=self.admin, link=f'/admin/applications/{self.app.id}/form').exists())
        file_url = resp.data['files'][0]['url']
        self.assertEqual(b''.join(self.client.get(f'/api/v1{file_url}').streaming_content), PNG)

        self.client.force_authenticate(self.admin)
        self.assertEqual(b''.join(self.client.get(f'/api/v1{file_url}').streaming_content), PNG)
        self.assertEqual(self.client.get(f'{P}/staff/summary/').data['forms_to_review'], 1)
        listing = self.client.get(f'{P}/staff/application-forms/').data
        self.assertEqual((listing['counts']['submitted'], listing['results'][0]['method'], listing['results'][0]['files']), (1, 'upload', 2))
        self.client.post(f'{P}/staff/applications/{self.app.id}/form/', {'action': 'return', 'note': 'Page 2 is blurry.'}, format='json')

        self.client.force_authenticate(self.student)
        again = self.upload(SimpleUploadedFile('clear.pdf', PDF)).data
        self.assertEqual((again['status'], [f['name'] for f in again['files']]), ('submitted', ['clear.pdf']))  # replaces the old pages

    def test_admin_switches_and_reminders(self):
        self.client.force_authenticate(self.admin)
        tpl = self.client.get(f'{P}/staff/intake-form/').data
        self.assertEqual(self.client.put(f'{P}/staff/intake-form/', {**tpl, 'allow_online': False, 'allow_upload': False}, format='json').status_code, 400)
        self.client.put(f'{P}/staff/intake-form/', {**tpl, 'allow_online': True, 'allow_upload': False}, format='json')
        listing = self.client.get(f'{P}/staff/application-forms/').data
        self.assertEqual(listing['results'][0]['state'], 'not_started')
        with self.captureOnCommitCallbacks(execute=True):
            reminded = self.client.post(f'{P}/staff/applications/{self.app.id}/form/', {'action': 'remind'}, format='json').data
        self.assertTrue(reminded['reminded_at'])
        self.assertIn('Reminder', mail.outbox[-1].subject)
        self.assertIn('fill it in online', mail.outbox[-1].body)
        self.client.force_authenticate(self.student)
        self.assertEqual(self.upload(SimpleUploadedFile('form.pdf', PDF)).status_code, 400)  # paper route switched off
        self.assertEqual(self.client.get(f'{P}/me/applications/{self.app.id}/form/').data['allow_upload'], False)

    def test_payment_confirmation_says_the_form_is_ready(self):
        ServiceRequest.objects.filter(pk=self.service.pk).update(status=ServiceRequest.PAYMENT_SUBMITTED)
        self.client.force_authenticate(self.admin)
        with self.captureOnCommitCallbacks(execute=True):
            self.client.post(f'{P}/staff/applications/{self.app.id}/service/', {'action': 'confirm_payment'}, format='json')
        message = mail.outbox[-1]
        self.assertIn('application form is ready', message.subject)
        self.assertIn(f'/student/applications/{self.app.id}/form', message.body)


@override_settings(EMAIL_BACKEND='django.core.mail.backends.locmem.EmailBackend', CONTACT_NOTIFY_EMAIL='team@example.com')
class ApprovalTests(APITestCase):
    """Signing and approving a submitted form, or pointing the student to the answers to fix."""

    @classmethod
    def setUpTestData(cls):
        cls.admin = User.objects.create_user(email='admin@example.com', password='x', role=User.ADMIN, is_verified=True, first_name='Ada', last_name='Bangura')
        cls.student = User.objects.create_user(email='ama@example.com', password='x', role=User.STUDENT, is_verified=True, first_name='Ama', last_name='Kamara')
        cls.app = Application.objects.create(student=cls.student, scholarship_name='Chevening Scholarship')
        ServiceRequest.objects.create(application=cls.app, status=ServiceRequest.PAID, amount=1500)

    def setUp(self):
        self.client.force_authenticate(self.student)
        self.client.put(f'{P}/me/applications/{self.app.id}/form/', {'answers': full_answers(), 'declared': True, 'submit': True}, format='json')
        self.client.force_authenticate(self.admin)
        self.staff = f'{P}/staff/applications/{self.app.id}/form/'

    def test_flag_questions_then_resubmit(self):
        with self.captureOnCommitCallbacks(execute=True):
            back = self.client.post(self.staff, {'action': 'return', 'fields': ['passport_number', 'not_a_question'], 'note': ''}, format='json').data
        self.assertEqual((back['status'], back['flagged_fields']), ('returned', ['passport_number']))
        email = mail.outbox[-1]
        self.assertIn('Passport number', email.body)
        from lms.models import Notification
        self.assertTrue(Notification.objects.filter(user=self.student, title='Please update your application form').exists())
        self.assertEqual(self.client.post(self.staff, {'action': 'return'}, format='json').status_code, 400)  # nothing to fix

        self.client.force_authenticate(self.student)
        seen = self.client.get(f'{P}/me/applications/{self.app.id}/form/').data
        self.assertEqual(seen['flagged_fields'], ['passport_number'])
        again = self.client.put(f'{P}/me/applications/{self.app.id}/form/', {'answers': {**full_answers(), 'passport_number': 'B123'}, 'declared': True, 'submit': True}, format='json').data
        self.assertEqual((again['status'], again['flagged_fields']), ('submitted', []))

    def test_saved_signature_is_reused_and_reopen_clears_approval(self):
        self.client.put(f'{P}/staff/my-signature/', {'image': signature_png(), 'title': 'Head of Scholarships'}, format='json')
        approved = self.client.post(self.staff, {'action': 'approve'}, format='json').data  # uses the saved signature
        self.assertEqual((approved['approval']['name'], approved['approval']['title']), ('Ada Bangura', 'Head of Scholarships'))
        self.client.force_authenticate(self.student)
        self.assertEqual(self.client.get(f'{P}/me/applications/{self.app.id}/form/').data['approval']['name'], 'Ada Bangura')
        self.client.force_authenticate(self.admin)
        reopened = self.client.post(self.staff, {'action': 'reopen'}, format='json').data
        self.assertEqual((reopened['status'], reopened['approval']), ('returned', None))
        self.assertEqual(self.client.put(f'{P}/staff/my-signature/', {'image': 'not an image'}, format='json').status_code, 400)

