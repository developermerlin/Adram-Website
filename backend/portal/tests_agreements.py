"""The service agreement students sign once their scholarship is awarded."""
from django.contrib.auth import get_user_model
from django.core import mail
import json

from django.test import override_settings
from rest_framework.test import APITestCase

from .models import AgreementTemplate, Application, IntakeSubmission, ServiceRequest, StudentAgreement
from .tests_intake import signature_png

User = get_user_model()
P = '/api/v1/portal'
DETAILS = {'full_name': 'Ama Kamara', 'date_of_birth': '2000-05-17', 'passport_number': 'SL998877',
           'address': '5 Kissy Road, Freetown', 'phone': '+232 76 111 222', 'email': 'ama@example.com'}
BESIDE = {'signed_name': 'Ama Kamara', 'signed_date': '2026-10-03'}


@override_settings(EMAIL_BACKEND='django.core.mail.backends.locmem.EmailBackend', CONTACT_NOTIFY_EMAIL='team@example.com')
class AgreementTests(APITestCase):
    @classmethod
    def setUpTestData(cls):
        cls.admin = User.objects.create_user(email='admin@example.com', password='x', role=User.ADMIN, is_verified=True, first_name='Ada', last_name='Bangura')
        cls.student = User.objects.create_user(email='ama@example.com', password='x', role=User.STUDENT, is_verified=True, first_name='Ama', last_name='Kamara')
        cls.app = Application.objects.create(student=cls.student, scholarship_name='Chevening Scholarship', stage='submitted')
        ServiceRequest.objects.create(application=cls.app, status=ServiceRequest.PAID, amount=1500)

    def accept(self):
        self.client.force_authenticate(self.admin)
        with self.captureOnCommitCallbacks(execute=True):
            self.client.patch(f'{P}/staff/applications/{self.app.id}/', {'stage': 'accepted'}, format='json')

    def test_award_sends_the_agreement_and_the_student_signs(self):
        t = AgreementTemplate.load()
        t.currency, t.default_amount = 'NLe', 15000
        t.save()
        IntakeSubmission.objects.create(application=self.app, answers={'passport_number': 'SL998877', 'date_of_birth': '2000-05-17'})
        self.accept()
        ag = StudentAgreement.objects.get()
        self.assertEqual((ag.status, ag.fee, ag.reference), ('pending', 'NLe 15,000', f'ADR-STU-{self.app.id:05d}'))
        self.assertIn('NLe 9,000', json.dumps(self.client.get(f'{P}/staff/applications/{self.app.id}/agreement/').data['values']))
        self.assertEqual(len(ag.content['clauses']), 12)
        invite = next(m for m in mail.outbox if m.to == ['ama@example.com'] and 'sign your service agreement' in m.subject)
        self.assertIn(f'/student/applications/{self.app.id}/agreement', invite.body)

        self.client.force_authenticate(self.student)
        url = f'{P}/me/applications/{self.app.id}/agreement/'
        data = self.client.get(url).data
        self.assertEqual((data['prefill']['passport_number'], data['prefill']['full_name']), ('SL998877', 'Ama Kamara'))
        self.assertEqual(data['status'], 'pending')
        self.assertEqual([f['label'] for f in data['signature_fields']], ['Full name', 'Date'])
        self.assertTrue(data['signature_prefill']['signed_date'])  # today, which the student can change
        bad = self.client.post(url, {'details': {**DETAILS, 'passport_number': ''}, 'signature_details': {'signed_date': '3 Oct'}}, format='json')
        self.assertEqual(set(bad.data['errors']), {'passport_number', 'agree', 'signature', 'sig_signed_name', 'sig_signed_date'})
        with self.captureOnCommitCallbacks(execute=True):
            signed = self.client.post(url, {'details': DETAILS, 'signature_details': BESIDE, 'agree': True, 'signature': signature_png()}, format='json',
                                      HTTP_USER_AGENT='TestBrowser/1.0', REMOTE_ADDR='196.10.2.3').data
        self.assertEqual((signed['status'], len(signed['fingerprint'])), ('signed', 64))
        ag.refresh_from_db()
        self.assertEqual((ag.signed_ip, ag.signed_user_agent, ag.student_details['passport_number']), ('196.10.2.3', 'TestBrowser/1.0', 'SL998877'))
        self.assertEqual(ag.signature_details, BESIDE)
        self.assertEqual(self.client.post(url, {'details': DETAILS, 'signature_details': BESIDE, 'agree': True, 'signature': signature_png()}, format='json').status_code, 400)  # once
        recipients = [m.to for m in mail.outbox[-2:]]
        self.assertIn(['ama@example.com'], recipients)
        self.assertIn(['team@example.com'], recipients)
        card = self.client.get(f'{P}/me/applications/{self.app.id}/').data['agreement']
        self.assertEqual(card['status'], 'signed')

    def test_admin_controls(self):
        self.client.force_authenticate(self.student)
        self.assertEqual(self.client.get(f'{P}/staff/agreements/').status_code, 403)
        self.client.force_authenticate(self.admin)
        listing = self.client.get(f'{P}/staff/agreements/').data
        self.assertEqual([(w['application_id'], w['awarded']) for w in listing['awaiting']], [(self.app.id, False)])  # paid, none yet
        Application.objects.filter(pk=self.app.id).update(stage='accepted')
        self.assertEqual(self.client.get(f'{P}/staff/agreements/').data['awaiting'][0]['awarded'], True)
        with self.captureOnCommitCallbacks(execute=True):
            made = self.client.post(f'{P}/staff/agreements/', {'application_id': self.app.id, 'fee': 'USD 1,200'}, format='json').data
        self.assertEqual((made['status'], made['fee']), ('pending', 'USD 1,200'))
        one = f'{P}/staff/applications/{self.app.id}/agreement/'
        self.assertEqual(self.client.post(one, {'action': 'fee', 'fee': 'USD 1,000'}, format='json').data['fee'], 'USD 1,000')
        with self.captureOnCommitCallbacks(execute=True):
            self.assertTrue(self.client.post(one, {'action': 'remind'}, format='json').data['reminded_at'])
        self.assertIn('Reminder', mail.outbox[-1].subject)
        self.client.post(one, {'action': 'void', 'reason': 'Wrong fee'}, format='json')
        self.client.force_authenticate(self.student)
        self.assertEqual(self.client.get(f'{P}/me/applications/{self.app.id}/agreement/').status_code, 404)  # cancelled: hidden
        self.client.force_authenticate(self.admin)
        self.assertEqual(self.client.post(one, {'action': 'reissue', 'fee': 'USD 900'}, format='json').data['status'], 'pending')

    def test_template_editing_and_auto_issue_switch(self):
        self.client.force_authenticate(self.admin)
        url = f'{P}/staff/agreement-template/'
        tpl = self.client.get(url).data
        self.assertEqual(tpl['clauses'][3]['title'], 'Service Fee and Payment Structure')
        bad = self.client.put(url, {'clauses': [{'title': 'Only a title', 'body': ''}], 'company_stamp': 'data:image/gif;base64,R0lG'}, format='json')
        self.assertEqual((bad.status_code, len(bad.data['errors'])), (400, 2))
        ok = self.client.put(url, {'representative_name': 'Ibrahim Kamara', 'company_signature': signature_png(), 'auto_issue': False}, format='json').data
        self.assertEqual((ok['representative_name'], ok['auto_issue'], ok['company_signature'][:14]), ('Ibrahim Kamara', False, 'data:image/png'))
        self.accept()
        self.assertFalse(StudentAgreement.objects.exists())  # automatic sending switched off
        self.assertEqual(self.client.delete(url).data['title'], 'Scholarship Application and Success-Based Service Agreement')

    def test_sent_with_the_form_at_payment_then_fee_due_on_award(self):
        AgreementTemplate.objects.update_or_create(pk=AgreementTemplate.load().pk, defaults={'default_amount': 20000})
        ServiceRequest.objects.filter(application=self.app).update(status=ServiceRequest.PAYMENT_SUBMITTED)
        self.client.force_authenticate(self.admin)
        with self.captureOnCommitCallbacks(execute=True):
            self.client.post(f'{P}/staff/applications/{self.app.id}/service/', {'action': 'confirm_payment'}, format='json')
        ag = StudentAgreement.objects.get()
        self.assertEqual(ag.status, 'pending')
        student_mail = [m for m in mail.outbox if m.to == ['ama@example.com']]
        self.assertEqual(len(student_mail), 1)  # one email announces both the form and the agreement
        self.assertIn('service agreement is also ready', student_mail[0].body)
        self.client.force_authenticate(self.student)
        card = self.client.get(f'{P}/me/applications/{self.app.id}/').data['agreement']
        self.assertEqual((card['status'], card['awarded']), ('pending', False))
        with self.captureOnCommitCallbacks(execute=True):
            self.client.post(f'{P}/me/applications/{self.app.id}/agreement/', {'details': DETAILS, 'signature_details': BESIDE, 'agree': True, 'signature': signature_png()}, format='json')
        mail.outbox.clear()
        self.accept()
        self.assertEqual(StudentAgreement.objects.count(), 1)
        due = next(m for m in mail.outbox if m.to == ['ama@example.com'] and 'Congratulations' in m.subject)
        self.assertIn('First payment (60%)', due.body)
        self.assertIn('NLe 12,000', due.body)

    def test_award_with_unsigned_agreement_sends_congratulations(self):
        StudentAgreement.objects.create(application=self.app, status='pending', content={}, fee='NLe 10,000')
        self.accept()
        self.assertEqual(StudentAgreement.objects.count(), 1)
        self.assertTrue(any('Congratulations! Please sign' in m.subject for m in mail.outbox))

    def test_backfill_command_for_applications_paid_earlier(self):
        from io import StringIO
        from django.core.management import call_command
        out = StringIO()
        call_command('issue_agreements', '--dry-run', stdout=out)
        self.assertFalse(StudentAgreement.objects.exists())
        call_command('issue_agreements', stdout=out)
        self.assertEqual(StudentAgreement.objects.get().status, 'pending')
        self.assertEqual(len(mail.outbox), 0)  # portal notification only
        call_command('issue_agreements', stdout=out)
        self.assertEqual(StudentAgreement.objects.count(), 1)  # nothing sent twice

    def test_admin_sets_the_fields_and_wording(self):
        self.client.force_authenticate(self.admin)
        url = f'{P}/staff/agreement-template/'
        tpl = self.client.get(url).data
        self.assertEqual(len(tpl['student_fields']), 6)
        self.assertIn('full_name', [q['id'] for q in tpl['intake_questions']])
        bad = self.client.put(url, {'signature_fields': [], 'student_fields': [{'label': ''}]}, format='json')
        self.assertEqual(bad.status_code, 400)
        saved = self.client.put(url, {
            'student_fields': [{'label': 'Full name', 'id': 'full_name', 'type': 'text', 'prefill': 'account:name'},
                               {'label': 'National ID', 'type': 'text', 'required': False, 'prefill': ''}],
            'signature_fields': [{'label': 'Date', 'type': 'date', 'prefill': 'today'}, {'label': 'Place of signing', 'type': 'text', 'prefill': ''}],
            'wording': {'card_badge': 'Pay only on success', 'student_ref': 'the Client', 'made_on': ''},
            'require_read': False,
        }, format='json').data
        self.assertEqual([f['id'] for f in saved['student_fields']], ['full_name', 'national_id'])
        self.assertEqual(saved['wording']['made_on'][:4], 'This')  # empty = original wording
        self.assertEqual(saved['wording']['card_badge'], 'Pay only on success')
        with self.captureOnCommitCallbacks(execute=True):
            self.client.post(f'{P}/staff/agreements/', {'application_id': self.app.id, 'amount': '10000'}, format='json')

        self.client.force_authenticate(self.student)
        card = self.client.get(f'{P}/me/applications/{self.app.id}/').data['agreement']['card']
        self.assertEqual(card['card_badge'], 'Pay only on success')
        url = f'{P}/me/applications/{self.app.id}/agreement/'
        data = self.client.get(url).data
        self.assertEqual((data['wording']['student_ref'], data['require_read']), ('the Client', False))
        self.assertEqual(data['prefill'], {'full_name': 'Ama Kamara', 'national_id': ''})
        bad = self.client.post(url, {'details': {'full_name': 'Ama Kamara'}, 'signature_details': {'date': '2026-10-03'},
                                     'agree': True, 'signature': signature_png()}, format='json')
        self.assertEqual(set(bad.data['errors']), {'sig_place_of_signing'})  # National ID is optional
        ok = self.client.post(url, {'details': {'full_name': 'Ama Kamara'}, 'signature_details': {'date': '2026-10-03', 'place_of_signing': 'Freetown'},
                                    'agree': True, 'signature': signature_png()}, format='json').data
        self.assertEqual((ok['status'], ok['signature_details']['place_of_signing']), ('signed', 'Freetown'))

        # later edits don't change the signed document's wording
        self.client.force_authenticate(self.admin)
        self.client.put(f'{P}/staff/agreement-template/', {'wording': {'student_ref': 'Changed later'}}, format='json')
        self.assertEqual(self.client.get(f'{P}/staff/applications/{self.app.id}/agreement/').data['wording']['student_ref'], 'the Client')

    def test_fee_split_filling_in_and_payments(self):
        from .agreements import fmt_money, percent_words
        self.assertEqual((fmt_money('NLe', 25000), fmt_money('$', 1500), percent_words(60), percent_words(45)), ('NLe 25,000', '$1,500', 'sixty', 'forty-five'))
        self.client.force_authenticate(self.admin)
        with self.captureOnCommitCallbacks(execute=True):
            self.client.post(f'{P}/staff/agreements/', {'application_id': self.app.id}, format='json')  # no fee yet
        one = f'{P}/staff/applications/{self.app.id}/agreement/'
        data = self.client.get(one).data
        self.assertEqual((data['ready'], data['missing']), (False, ['The service fee']))
        self.assertIn('Represented by: name', data['blanks'])
        self.assertEqual(self.client.post(one, {'action': 'remind'}, format='json').status_code, 400)

        # the student can read it but not sign yet
        self.client.force_authenticate(self.student)
        url = f'{P}/me/applications/{self.app.id}/agreement/'
        self.assertFalse(self.client.get(url).data['ready'])
        self.assertEqual(self.client.post(url, {'details': DETAILS, 'signature_details': BESIDE, 'agree': True, 'signature': signature_png()}, format='json').status_code, 400)

        # ADRAM fills it in: 25,000 split 70/30
        self.client.force_authenticate(self.admin)
        self.assertEqual(self.client.post(one, {'action': 'fill', 'amount': 'abc'}, format='json').status_code, 400)
        mail.outbox.clear()
        with self.captureOnCommitCallbacks(execute=True):
            filled = self.client.post(one, {'action': 'fill', 'currency': 'NLe', 'amount': '25,000', 'first_percent': 70, 'effective_date': '2026-11-01'}, format='json').data
        self.assertTrue(filled['ready'])
        self.assertEqual((filled['fee'], filled['money']['first_amount'], filled['money']['second_amount']), ('NLe 25,000', 'NLe 17,500', 'NLe 7,500'))
        self.assertEqual((filled['values']['first_percent_words'], filled['values']['second_percent'], filled['values']['effective_date']), ('seventy', '30', '1 November 2026'))
        self.assertTrue(any('ready' in m.subject for m in mail.outbox if m.to == ['ama@example.com']))  # told it can be signed now
        self.assertEqual(self.client.post(one, {'action': 'add_payment', 'amount': 100, 'paid_on': '2026-11-02'}, format='json').status_code, 400)  # not signed

        self.client.force_authenticate(self.student)
        with self.captureOnCommitCallbacks(execute=True):
            self.client.post(url, {'details': DETAILS, 'signature_details': BESIDE, 'agree': True, 'signature': signature_png()}, format='json')
        self.client.force_authenticate(self.admin)
        self.assertEqual(self.client.post(one, {'action': 'fill', 'amount': 1}, format='json').status_code, 400)  # signed: locked

        # payments: the first instalment, partly; then too much; then the rest
        mail.outbox.clear()
        with self.captureOnCommitCallbacks(execute=True):
            paid = self.client.post(one, {'action': 'add_payment', 'amount': '10000', 'paid_on': '2026-12-01', 'method': 'Orange Money', 'reference': 'OM55'}, format='json').data
        m = paid['money']
        self.assertEqual((m['paid'], m['balance'], m['paid_percent']), ('NLe 10,000', 'NLe 15,000', 40))
        self.assertEqual([i['status'] for i in m['installments']], ['part', 'unpaid'])
        receipt = next(x for x in mail.outbox if x.to == ['ama@example.com'])
        self.assertIn('NLe 15,000', receipt.body)
        too_much = self.client.post(one, {'action': 'add_payment', 'amount': '20000', 'paid_on': '2026-12-02'}, format='json')
        self.assertIn('more than the balance', too_much.data['detail'])
        done = self.client.post(one, {'action': 'add_payment', 'amount': '15000', 'paid_on': '2027-02-01', 'notify': False}, format='json').data
        self.assertEqual((done['money']['fully_paid'], done['money']['balance'], [i['status'] for i in done['money']['installments']]), (True, 'NLe 0', ['paid', 'paid']))
        card = self.client.get(f'{P}/staff/agreements/').data['results'][0]
        self.assertEqual((card['paid'], card['fully_paid']), ('NLe 25,000', True))
        undone = self.client.post(one, {'action': 'delete_payment', 'payment_id': done['payments'][-1]['id']}, format='json').data
        self.assertEqual(undone['money']['balance'], 'NLe 15,000')

        self.client.force_authenticate(self.student)
        mine = self.client.get(url).data
        self.assertEqual((len(mine['payments']), mine['money']['paid']), (1, 'NLe 10,000'))
        self.assertEqual(self.client.get(f'{P}/me/applications/{self.app.id}/').data['agreement']['money']['balance'], 'NLe 15,000')

    def test_details_adram_fills_in_and_text_for_one_student(self):
        self.client.force_authenticate(self.admin)
        self.client.put(f'{P}/staff/agreement-template/', {'default_amount': '5000', 'first_percent': 50,
                                                          'admin_fields': [{'label': 'Destination country', 'type': 'text', 'required': True},
                                                                           {'label': 'Fee', 'type': 'text', 'required': False}]}, format='json')
        tpl = self.client.get(f'{P}/staff/agreement-template/').data
        self.assertEqual([f['id'] for f in tpl['admin_fields']], ['destination_country', 'fee_value'])  # 'fee' is taken by the total
        with self.captureOnCommitCallbacks(execute=True):
            self.client.post(f'{P}/staff/agreements/', {'application_id': self.app.id}, format='json')
        one = f'{P}/staff/applications/{self.app.id}/agreement/'
        data = self.client.get(one).data
        self.assertEqual((data['fee'], data['missing']), ('NLe 5,000', ['Destination country']))
        filled = self.client.post(one, {'action': 'fill', 'values': {'destination_country': 'United Kingdom'}}, format='json').data
        self.assertEqual((filled['ready'], filled['values']['destination_country']), (True, 'United Kingdom'))
        clauses = [{'title': 'Purpose', 'body': 'Only for {student_name}, going to {destination_country}.'}]
        changed = self.client.post(one, {'action': 'content', 'clauses': clauses}, format='json').data
        self.assertEqual(len(changed['content']['clauses']), 1)
        self.assertEqual(len(AgreementTemplate.load().clauses), 12)  # the template is unchanged
        back = self.client.post(one, {'action': 'refresh'}, format='json').data
        self.assertEqual((len(back['content']['clauses']), back['fee']), (12, 'NLe 5,000'))



@override_settings(EMAIL_BACKEND='django.core.mail.backends.locmem.EmailBackend', CONTACT_NOTIFY_EMAIL='team@example.com')
class AgreementTemplateSyncAndPaperTests(APITestCase):
    """Unsigned agreements follow the template; the paper route (download, sign by hand, upload, accept)."""

    @classmethod
    def setUpTestData(cls):
        cls.admin = User.objects.create_user(email='admin@example.com', password='x', role=User.ADMIN, is_verified=True, first_name='Ada', last_name='Bangura')
        cls.student = User.objects.create_user(email='ama@example.com', password='x', role=User.STUDENT, is_verified=True, first_name='Ama', last_name='Kamara')
        cls.app = Application.objects.create(student=cls.student, scholarship_name='Chevening Scholarship', stage='submitted')
        ServiceRequest.objects.create(application=cls.app, status=ServiceRequest.PAID, amount=1500)

    def setUp(self):
        import shutil
        import tempfile
        from portal import models as pm
        self.media = tempfile.mkdtemp()  # uploads must never land in the real private_media folder
        self.addCleanup(shutil.rmtree, self.media, True)
        old = pm.private_storage.location

        def restore():
            pm.private_storage._location = old
            pm.private_storage.__dict__.pop('base_location', None)
            pm.private_storage.__dict__.pop('location', None)
        pm.private_storage._location = self.media
        pm.private_storage.__dict__.pop('base_location', None)
        pm.private_storage.__dict__.pop('location', None)
        self.addCleanup(restore)

    def send(self):
        self.client.force_authenticate(self.admin)
        with self.captureOnCommitCallbacks(execute=True):
            self.client.post(f'{P}/staff/agreements/', {'application_id': self.app.id}, format='json')

    def test_template_edits_reach_unsigned_agreements(self):
        self.send()
        self.assertFalse(self.client.get(f'{P}/staff/applications/{self.app.id}/agreement/').data['ready'])
        mail.outbox.clear()
        with self.captureOnCommitCallbacks(execute=True):
            self.client.put(f'{P}/staff/agreement-template/', {'representative_name': 'Mohamed Sesay', 'default_amount': '30000', 'first_percent': 70,
                                                               'wording': {'student_ref': 'the Client'}}, format='json')
        self.client.force_authenticate(self.student)
        data = self.client.get(f'{P}/me/applications/{self.app.id}/agreement/').data
        self.assertEqual((data['content']['representative_name'], data['fee'], data['money']['first_amount'], data['wording']['student_ref']),
                         ('Mohamed Sesay', 'NLe 30,000', 'NLe 21,000', 'the Client'))
        self.assertTrue(data['ready'])
        self.assertTrue(any('ready' in m.subject for m in mail.outbox))  # the student can sign now

        # a fee and text set for this student are kept when the template changes again
        self.client.force_authenticate(self.admin)
        one = f'{P}/staff/applications/{self.app.id}/agreement/'
        self.client.post(one, {'action': 'fill', 'amount': '45000'}, format='json')
        self.client.post(one, {'action': 'content', 'clauses': [{'title': 'Only', 'body': 'Just for Ama.'}]}, format='json')
        self.client.put(f'{P}/staff/agreement-template/', {'default_amount': '10000', 'representative_name': 'Someone Else'}, format='json')
        data = self.client.get(one).data
        self.assertEqual((data['fee'], len(data['content']['clauses']), data['own_fee'], data['own_text']), ('NLe 45,000', 1, True, True))
        back = self.client.post(one, {'action': 'fill', 'use_template_fee': True}, format='json').data
        self.assertEqual((back['fee'], back['own_fee']), ('NLe 10,000', False))

    def test_paper_route(self):
        from django.core.files.uploadedfile import SimpleUploadedFile
        self.client.force_authenticate(self.admin)
        self.client.put(f'{P}/staff/agreement-template/', {'default_amount': '20000'}, format='json')
        self.send()
        self.client.force_authenticate(self.student)
        url = f'{P}/me/applications/{self.app.id}/agreement/upload/'
        pdf = lambda: SimpleUploadedFile('signed.pdf', b'%PDF-1.4\n%signed agreement\n', content_type='application/pdf')  # noqa: E731
        self.assertEqual(self.client.post(url, {'files': [pdf()]}).status_code, 400)  # declaration missing
        fake = SimpleUploadedFile('signed.pdf', b'not a pdf', content_type='application/pdf')
        self.assertEqual(self.client.post(url, {'files': [fake], 'declared': 'true'}).status_code, 400)
        with self.captureOnCommitCallbacks(execute=True):
            up = self.client.post(url, {'files': [pdf()], 'declared': 'true'})
        self.assertEqual((up.status_code, up.data['status'], up.data['method'], len(up.data['files'])), (201, 'uploaded', 'upload', 1))
        self.assertTrue(any(m.to == ['team@example.com'] for m in mail.outbox))
        file_id = up.data['files'][0]['id']
        self.assertEqual(self.client.get(f'{P}/files/agreements/{file_id}/').status_code, 200)
        other = User.objects.create_user(email='x@example.com', password='x', role=User.STUDENT, is_verified=True)
        self.client.force_authenticate(other)
        self.assertEqual(self.client.get(f'{P}/files/agreements/{file_id}/').status_code, 404)

        # ADRAM returns it, the student uploads again, ADRAM accepts it
        self.client.force_authenticate(self.admin)
        one = f'{P}/staff/applications/{self.app.id}/agreement/'
        self.assertEqual(self.client.post(one, {'action': 'return_upload'}, format='json').status_code, 400)  # needs a note
        with self.captureOnCommitCallbacks(execute=True):
            back = self.client.post(one, {'action': 'return_upload', 'note': 'Page 8 is not signed.'}, format='json').data
        self.assertEqual((back['status'], back['return_note']), ('pending', 'Page 8 is not signed.'))
        self.client.force_authenticate(self.student)
        self.assertEqual(self.client.get(f'{P}/me/applications/{self.app.id}/').data['agreement']['return_note'], 'Page 8 is not signed.')
        self.client.post(url, {'files': [pdf()], 'declared': 'true'})
        self.client.force_authenticate(self.admin)
        mail.outbox.clear()
        with self.captureOnCommitCallbacks(execute=True):
            ok = self.client.post(one, {'action': 'accept_upload'}, format='json').data
        self.assertEqual((ok['status'], ok['paper_signed'], bool(ok['accepted_at'])), ('signed', True, True))
        self.assertTrue(any('accepted' in m.body for m in mail.outbox if m.to == ['ama@example.com']))
        paid = self.client.post(one, {'action': 'add_payment', 'amount': '12000', 'paid_on': '2026-12-01'}, format='json').data
        self.assertEqual(paid['money']['balance'], 'NLe 8,000')  # payments work as for online signing

    def test_online_or_paper_can_be_switched_off(self):
        self.client.force_authenticate(self.admin)
        self.assertEqual(self.client.put(f'{P}/staff/agreement-template/', {'allow_online': False, 'allow_upload': False}, format='json').status_code, 400)
        self.client.put(f'{P}/staff/agreement-template/', {'allow_online': False, 'default_amount': '20000'}, format='json')
        self.send()
        self.client.force_authenticate(self.student)
        res = self.client.post(f'{P}/me/applications/{self.app.id}/agreement/', {'details': DETAILS, 'signature_details': BESIDE, 'agree': True, 'signature': signature_png()}, format='json')
        self.assertIn('upload', res.data['detail'])
