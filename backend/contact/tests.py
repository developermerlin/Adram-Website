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



class EngagementStatsTests(TestCase):
    """The Overview's enquiries and notifications statistics."""

    def test_stats(self):
        from datetime import timedelta
        from django.contrib.auth import get_user_model
        from django.utils import timezone
        from lms.models import Notification
        from partners.models import PartnerApplication
        from .models import ContactMessage
        User = get_user_model()
        admin = User.objects.create_user(email='admin@example.com', password='x', role=User.ADMIN, is_verified=True)
        student = User.objects.create_user(email='s@example.com', password='x', role=User.STUDENT, is_verified=True)
        ContactMessage.objects.create(name='A', email='a@example.com', subject='Scholarships', message='Hi')
        ContactMessage.objects.create(name='B', email='b@example.com', subject=' scholarships ', message='Hi', is_read=True)
        old = ContactMessage.objects.create(name='C', email='c@example.com', subject='Training', message='Hi', is_read=True)
        ContactMessage.objects.filter(pk=old.pk).update(created_at=timezone.now() - timedelta(days=40))  # the period before
        PartnerApplication.objects.create(organisation='Uni', contact_name='D', email='d@example.com', message='Partner?')
        Notification.objects.create(user=student, kind='system', title='One', is_read=True)
        Notification.objects.create(user=student, kind='payment', title='Two')
        Notification.objects.create(user=admin, kind='system', title='Three')

        client = APIClient()
        client.force_authenticate(student)
        self.assertEqual(client.get('/api/contact/stats/').status_code, 403)
        client.force_authenticate(admin)
        d = client.get('/api/contact/stats/?days=30').data
        e, n = d['enquiries'], d['notifications']
        self.assertEqual((e['total'], e['total_prev'], e['contact'], e['partnerships'], e['unread'], e['read_rate']), (3, 1, 2, 1, 1, 50))
        self.assertEqual(e['top_subjects'][0]['count'], 2)  # "Scholarships" and " scholarships " are the same subject
        self.assertEqual(sum(map(sum, e['heatmap'])), 3)
        self.assertEqual((n['sent'], n['read'], n['read_rate'], n['recipients'], n['unread_total'], n['admin_unread']), (3, 1, 33, 2, 2, 1))
        self.assertEqual(n['by_kind'][0], {'key': 'system', 'label': 'System', 'count': 2})
        self.assertEqual({r['key']: r['people'] for r in n['by_role']}, {'STUDENT': 1, 'ADMIN': 1})
        self.assertEqual((len(d['series']), d['series'][-1]['enquiries']), (30, 3))
        self.assertEqual(len(client.get('/api/contact/stats/?days=7').data['series']), 7)
        self.assertEqual(client.get('/api/contact/stats/?days=12').data['days'], 30)  # only 7, 30 or 90
