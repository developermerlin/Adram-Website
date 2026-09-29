from django.core import mail
from django.test import TestCase, override_settings
from rest_framework.test import APIClient


@override_settings(CONTACT_NOTIFY_EMAIL='team@example.com')
class ContactEmailTests(TestCase):
    def test_enquiry_sends_branded_alert_and_confirmation(self):
        resp = APIClient().post('/api/contact/', {
            'name': 'Aminata Conteh', 'email': 'aminata@example.com',
            'subject': 'Office network', 'message': 'We need Wi-Fi for 20 staff.',
        }, format='json')
        self.assertEqual(resp.status_code, 201)
        alert, confirmation = mail.outbox
        self.assertEqual(alert.to, ['team@example.com'])
        self.assertEqual(alert.reply_to, ['aminata@example.com'])  # "Reply" answers the visitor
        self.assertIn('Office network', alert.subject)
        self.assertEqual(confirmation.to, ['aminata@example.com'])
        for email in (alert, confirmation):
            html = email.alternatives[0][0]
            self.assertIn('ADRAM', html)
            self.assertIn('We need Wi-Fi for 20 staff.', html)
