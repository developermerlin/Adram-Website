"""Audiences, email campaigns, click tracking and unsubscribing."""
from datetime import timedelta

from django.core import mail
from django.utils import timezone

from accounts.models import User
from portal.models import TrainingEnrollment

from .campaigns import audience
from .models import Campaign, CampaignRecipient, CartItem, LearningDay, Notification, Profile, Wishlist
from .tests import API
from .tests_marketplace import MarketCase

MANAGE = f'{API}/manage'


class AudienceTests(MarketCase):
    def emails(self, rules):
        return sorted(u.email for u in audience(rules))

    def test_rules(self):
        TrainingEnrollment.objects.create(student=self.student, course=self.course, status=TrainingEnrollment.ACTIVE)
        Wishlist.objects.create(student=self.other, course=self.second)
        CartItem.objects.create(student=self.other, course=self.second)
        self.assertEqual(self.emails({}), ['amina@example.com', 'bob@example.com'])  # students only (not staff)
        self.assertEqual(self.emails({'enrolled_in': ['web']}), ['amina@example.com'])
        self.assertEqual(self.emails({'not_enrolled_in': ['web']}), ['bob@example.com'])
        self.assertEqual(self.emails({'wishlisted': ['python'], 'cart_not_empty': True}), ['bob@example.com'])
        self.assertEqual(self.emails({'purchased': 'yes'}), [])
        self.assertEqual(self.emails({'roles': ['INSTRUCTOR']}), ['rival@example.com', 'teach@example.com'])
        # inactive: no learning and no sign-in for 14 days
        User.objects.filter(pk__in=[self.student.pk, self.other.pk]).update(last_login=timezone.now() - timedelta(days=30))
        LearningDay.objects.create(user=self.student, date=timezone.localdate(), seconds=600)
        self.assertEqual(self.emails({'inactive_days': 14}), ['bob@example.com'])
        # opted out of marketing: never included
        Profile.objects.update_or_create(user=self.other, defaults={'marketing_emails': False})
        self.assertNotIn('bob@example.com', self.emails({}))

    def test_preview_and_segments(self):
        self.as_(self.admin)
        data = self.client.post(f'{MANAGE}/audience/preview/', {'rules': {}}, format='json').data
        self.assertEqual(data['count'], 2)
        seg = self.client.post(f'{MANAGE}/segments/', {'name': 'Everyone', 'rules': {}}, format='json').data
        self.assertEqual(self.client.get(f'{MANAGE}/segments/').data[0]['count'], 2)
        self.assertEqual(self.client.delete(f'{MANAGE}/segments/{seg["id"]}/').status_code, 204)
        self.as_(self.student)
        self.assertEqual(self.client.post(f'{MANAGE}/audience/preview/', {'rules': {}}, format='json').status_code, 403)


class CampaignTests(MarketCase):
    def make(self, **extra):
        self.as_(self.admin)
        resp = self.client.post(f'{MANAGE}/campaigns/', {
            'name': 'October news', 'subject': 'New courses for you, {first_name}', 'body': 'Hello {first_name},\n\nWe added Python Basics.',
            'button_label': 'See the course', 'button_link': '/courses/python', 'rules': {}, **extra}, format='json')
        self.assertEqual(resp.status_code, 201, resp.data)
        return resp.data

    def test_validation(self):
        self.as_(self.admin)
        bad = self.client.post(f'{MANAGE}/campaigns/', {'name': '', 'subject': '', 'body': '', 'button_label': 'Go', 'button_link': 'javascript:x'}, format='json')
        self.assertEqual(set(bad.data), {'name', 'subject', 'body', 'button_link'})

    def test_test_send_and_click_and_unsubscribe(self):
        campaign = self.make()
        mail.outbox.clear()
        self.assertEqual(self.client.post(f'{MANAGE}/campaigns/{campaign["id"]}/test/').status_code, 200)
        self.assertEqual(mail.outbox[0].to, ['admin@example.com'])
        mail.outbox.clear()
        data = self.client.post(f'{MANAGE}/campaigns/{campaign["id"]}/send/').data
        self.assertEqual((data['status'], data['sent']), ('sent', 2))
        to_amina = next(m for m in mail.outbox if m.to == ['amina@example.com'])
        self.assertEqual(to_amina.subject, 'New courses for you, Amina')
        self.assertIn('Hello Amina,', to_amina.body)
        self.assertIn('List-Unsubscribe', to_amina.extra_headers)
        self.assertTrue(Notification.objects.filter(user=self.student, kind='announcement', link='/courses/python').exists())
        # sending twice is refused; editing a sent campaign too
        self.assertEqual(self.client.post(f'{MANAGE}/campaigns/{campaign["id"]}/send/').status_code, 400)
        self.assertEqual(self.client.patch(f'{MANAGE}/campaigns/{campaign["id"]}/', {'subject': 'x'}, format='json').status_code, 400)

        # the tracked button
        click = next(line for line in to_amina.body.splitlines() if line.startswith('See the course: '))[len('See the course: '):]
        path = click[click.index('/api/'):]
        self.client.force_authenticate(None)
        resp = self.client.get(path)
        self.assertEqual((resp.status_code, resp['Location'].endswith('/courses/python')), (302, True))
        self.assertIsNotNone(CampaignRecipient.objects.get(user=self.student).clicked_at)

        # unsubscribing from the link
        stop = next(line for line in to_amina.body.splitlines() if line.startswith('Unsubscribe: '))[len('Unsubscribe: '):]
        token = stop.rstrip('/').split('/unsubscribe/')[1]
        self.assertTrue(self.client.get(f'{API}/unsubscribe/{token}/').data['subscribed'])
        self.client.post(f'{API}/unsubscribe/{token}/', {'subscribe': False}, format='json')
        self.assertFalse(Profile.objects.get(user=self.student).marketing_emails)
        self.as_(self.admin)
        result = self.client.get(f'{MANAGE}/campaigns/{campaign["id"]}/').data
        self.assertEqual((result['clicks'], result['click_rate'], result['unsubscribed'], result['audience']), (1, 50.0, 1, 1))
        self.assertEqual(self.client.get(f'{API}/unsubscribe/not-a-token/').status_code, 404)

    def test_email_preferences(self):
        self.as_(self.student)
        self.assertTrue(self.client.get(f'{API}/me/email-preferences/').data['marketing_emails'])
        self.assertFalse(self.client.put(f'{API}/me/email-preferences/', {'marketing_emails': False}, format='json').data['marketing_emails'])
        self.assertNotIn(self.student, list(audience({})))

    def test_empty_audience_and_drafts(self):
        campaign = self.make(rules={'enrolled_in': ['nothing-here']})
        self.assertIn('Nobody', self.client.post(f'{MANAGE}/campaigns/{campaign["id"]}/send/').data['detail'])
        self.assertEqual(self.client.delete(f'{MANAGE}/campaigns/{campaign["id"]}/').status_code, 204)
        self.assertFalse(Campaign.objects.exists())
