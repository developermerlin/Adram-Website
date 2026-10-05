import shutil
import tempfile

from django.contrib.auth import get_user_model
from django.core import mail
from django.core.files.uploadedfile import SimpleUploadedFile
from django.test import override_settings
from rest_framework.test import APITestCase

from portal.models import Conversation, Message

from .models import TeamProfile

User = get_user_model()
T = '/api/v1/team'
P = '/api/v1/portal'
PDF = b'%PDF-1.4\n%a cv\n'


@override_settings(EMAIL_BACKEND='django.core.mail.backends.locmem.EmailBackend', CONTACT_NOTIFY_EMAIL='team@example.com')
class TeamTests(APITestCase):
    @classmethod
    def setUpTestData(cls):
        cls.admin = User.objects.create_user(email='admin@example.com', password='x', role=User.ADMIN, is_verified=True,
                                             first_name='Ada', last_name='Bangura', approval_status=User.APPROVED)
        cls.student = User.objects.create_user(email='ama@example.com', password='x', role=User.STUDENT, is_verified=True,
                                               first_name='Ama', last_name='Kamara', approval_status=User.APPROVED)

    def setUp(self):
        from portal import models as pm
        self.media = tempfile.mkdtemp()  # CVs must never land in the real private_media folder
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

    def make_member(self, publish=True):
        self.client.force_authenticate(self.admin)
        res = self.client.post('/api/v1/lms/admin/users/', {'email': 'mo@example.com', 'first_name': 'Mohamed', 'last_name': 'Sesay',
                                                            'role': 'TEAM_MEMBER', 'password': 'Str0ng-pass-word!', 'job_title': 'Lead Engineer'},
                               format='json')
        self.assertEqual(res.status_code, 201, res.data)
        member = User.objects.get(email='mo@example.com')
        if publish:
            self.client.put(f'{T}/manage/{res.data["team_profile_id"]}/', {'is_published': True}, format='json')
        return member, res.data['team_profile_id']

    def test_profile_is_created_with_the_role(self):
        member, pid = self.make_member(publish=False)
        p = TeamProfile.objects.get(pk=pid)
        self.assertEqual((p.user, p.job_title, p.slug, p.is_published), (member, 'Lead Engineer', 'mohamed-sesay', False))
        # changing someone's role to Team member creates theirs too
        other = User.objects.create_user(email='fatu@example.com', password='x', role=User.COUNSELLOR, first_name='Fatu', last_name='Conteh')
        self.assertFalse(TeamProfile.objects.filter(user=other).exists())
        other.role = User.TEAM_MEMBER
        other.save()
        self.assertTrue(TeamProfile.objects.filter(user=other).exists())
        # unpublished: hidden from the public, visible to the admin
        self.client.force_authenticate(None)
        self.assertEqual(self.client.get(f'{T}/members/').data['results'], [])
        self.assertEqual(self.client.get(f'{T}/members/mohamed-sesay/').status_code, 404)
        self.client.force_authenticate(self.admin)
        self.assertEqual(self.client.get(f'{T}/members/mohamed-sesay/').status_code, 200)

    def test_admin_manages_the_portfolio(self):
        member, pid = self.make_member()
        url = f'{T}/manage/{pid}/'
        bad = self.client.put(url, {'experience': [{'organisation': 'ADRAM'}], 'socials': {'linkedin': 'linkedin.com/in/x'},
                                    'public_email': 'nope'}, format='json')
        self.assertEqual((bad.status_code, len(bad.data['errors'])), (400, 3))
        ok = self.client.put(url, {
            'headline': 'Building reliable networks for Sierra Leone', 'bio': 'Ten years of **networks**.', 'years_experience': '10',
            'skills': [{'name': 'Networking', 'level': 95}, {'name': 'Linux', 'level': 140}, {'name': ''}],
            'languages': ['English', 'Krio', ''], 'expertise': ['Cloud'],
            'experience': [{'title': 'Lead Engineer', 'organisation': 'ADRAM', 'start': '2020', 'current': True}, {}],
            'education': [{'qualification': 'BSc Computer Science', 'institution': 'Fourah Bay College', 'end': '2015'}],
            'projects': [{'title': 'Campus Wi-Fi', 'url': 'https://example.com', 'tags': ['Wi-Fi', 'Cisco']}],
            'testimonials': [{'quote': 'Great work.', 'author': 'A client'}],
            'socials': {'linkedin': 'https://linkedin.com/in/mo', 'facebook': ''}, 'public_email': 'mo@adram.sl', 'featured': True,
            'slug': 'mohamed',
        }, format='json').data
        self.assertEqual([s['level'] for s in ok['skills']], [95, 100])
        self.assertEqual((ok['languages'], len(ok['experience']), ok['experience'][0]['current'], ok['slug'], ok['featured']),
                         (['English', 'Krio'], 1, True, 'mohamed', True))
        self.assertEqual(ok['socials'], {'linkedin': 'https://linkedin.com/in/mo'})
        listing = self.client.get(f'{T}/manage/').data
        self.assertEqual(listing['results'][0]['name'], 'Mohamed Sesay')
        self.assertNotIn(member.id, [c['id'] for c in listing['candidates']])
        self.assertEqual(self.client.delete(url).status_code, 400)  # Team member role keeps its profile
        # the public page
        self.client.force_authenticate(None)
        page = self.client.get(f'{T}/members/mohamed/').data
        self.assertEqual((page['name'], page['headline'], page['can_edit'], page['email']),
                         ('Mohamed Sesay', 'Building reliable networks for Sierra Leone', False, ''))
        self.assertEqual(self.client.get(f'{T}/members/').data['results'][0]['skills'], ['Networking', 'Linux'])

    def test_any_staff_account_can_join_and_leave(self):
        counsellor = User.objects.create_user(email='c@example.com', password='x', role=User.COUNSELLOR, first_name='Isata', last_name='Koroma')
        self.client.force_authenticate(self.admin)
        self.assertIn(counsellor.id, [c['id'] for c in self.client.get(f'{T}/manage/').data['candidates']])
        self.assertEqual(self.client.post(f'{T}/manage/', {'user_id': self.student.id}, format='json').status_code, 400)
        made = self.client.post(f'{T}/manage/', {'user_id': counsellor.id}, format='json').data
        self.assertEqual(self.client.delete(f'{T}/manage/{made["id"]}/').status_code, 204)
        self.assertTrue(User.objects.filter(pk=counsellor.pk).exists())  # the account stays

    def test_cv_visibility(self):
        member, pid = self.make_member()
        self.assertEqual(self.client.post(f'{T}/manage/{pid}/cv/', {'file': SimpleUploadedFile('cv.pdf', b'not a pdf')}).status_code, 400)
        up = self.client.post(f'{T}/manage/{pid}/cv/', {'file': SimpleUploadedFile('Mohamed CV.pdf', PDF)})
        self.assertEqual((up.status_code, up.data['cv']['file']), (201, True))
        url = f'{T}/members/mohamed-sesay/cv/'
        self.client.force_authenticate(None)
        self.assertEqual(self.client.get(url).status_code, 200)  # public by default
        self.client.force_authenticate(self.admin)
        self.client.put(f'{T}/manage/{pid}/', {'cv_visibility': 'members'}, format='json')
        self.client.force_authenticate(None)
        self.assertEqual(self.client.get(url).status_code, 404)
        self.assertTrue(self.client.get(f'{T}/members/mohamed-sesay/').data['cv']['needs_sign_in'])
        self.client.force_authenticate(self.student)
        res = self.client.get(url)
        self.assertEqual((res.status_code, b''.join(res.streaming_content)[:4]), (200, b'%PDF'))
        self.client.force_authenticate(self.admin)
        self.client.put(f'{T}/manage/{pid}/', {'cv_visibility': 'hidden'}, format='json')
        self.client.force_authenticate(self.student)
        self.assertEqual(self.client.get(url).status_code, 404)
        self.assertFalse(self.client.get(f'{T}/members/mohamed-sesay/').data['cv']['generated'])

    def test_member_edits_their_own_profile(self):
        member, pid = self.make_member(publish=False)
        self.client.force_authenticate(member)
        mine = self.client.get(f'{T}/me/').data
        self.assertTrue(mine['can_edit'])
        res = self.client.put(f'{T}/me/', {'headline': 'Hello', 'is_published': True, 'featured': True}, format='json').data
        self.assertEqual((res['headline'], res['is_published'], res['featured']), ('Hello', False, False))  # publishing is the admin's
        self.assertEqual(self.client.post(f'{T}/me/cv/', {'file': SimpleUploadedFile('cv.pdf', PDF)}).status_code, 201)
        self.client.force_authenticate(self.student)
        self.assertEqual(self.client.get(f'{T}/me/').status_code, 404)
        self.assertEqual(self.client.put(f'{T}/manage/{pid}/', {'headline': 'x'}, format='json').status_code, 403)

    def test_chat_with_a_team_member(self):
        member, pid = self.make_member()
        self.client.force_authenticate(self.student)
        with self.captureOnCommitCallbacks(execute=True):
            first = self.client.post(f'{P}/me/messages/?member={member.id}', {'body': 'Hello Mohamed, can you help with Wi-Fi?'}, format='json')
        self.assertEqual(first.status_code, 201, first.data)
        conv = Conversation.objects.get(user=self.student, member=member)
        self.assertTrue(any(m.to == ['mo@example.com'] for m in mail.outbox))  # the member is told, not the team inbox
        # the student's threads: ADRAM team + Mohamed
        threads = self.client.get(f'{P}/me/threads/').data
        self.assertEqual([t['member']['id'] if t['member'] else None for t in threads], [None, member.id])
        # the member's inbox and reply
        self.client.force_authenticate(member)
        self.assertEqual(self.client.get(f'{P}/messages/unread/').data['unread'], 1)
        inbox = self.client.get(f'{P}/team/inbox/').data
        self.assertEqual((inbox[0]['user']['id'], inbox[0]['unread']), (self.student.id, 1))
        self.client.get(f'{P}/team/inbox/{self.student.id}/')
        mail.outbox.clear()
        with self.captureOnCommitCallbacks(execute=True):
            reply = self.client.post(f'{P}/team/inbox/{self.student.id}/', {'body': 'Sure, let’s talk.'}, format='json')
        self.assertEqual(reply.status_code, 201)
        self.assertTrue(any(m.to == ['ama@example.com'] for m in mail.outbox))
        self.assertEqual(self.client.post(f'{P}/team/inbox/{self.admin.id}/', {'body': 'x'}, format='json').status_code, 404)
        # the student sees the reply in that thread; the ADRAM-team thread is separate
        self.client.force_authenticate(self.student)
        thread = self.client.get(f'{P}/me/messages/?member={member.id}').data
        self.assertEqual((len(thread['messages']), thread['member']['job_title']), (2, 'Lead Engineer'))
        self.assertEqual(self.client.get(f'{P}/me/messages/').data['messages'], [])
        # administrators' inbox is the ADRAM-team inbox only
        self.client.force_authenticate(self.admin)
        self.assertEqual(self.client.get(f'{P}/staff/conversations/').data, [])
        self.assertEqual(Message.objects.filter(conversation=conv).count(), 2)

    def test_cannot_message_an_unpublished_or_chat_off_member(self):
        member, pid = self.make_member(publish=False)
        self.client.force_authenticate(self.student)
        self.assertEqual(self.client.post(f'{P}/me/messages/?member={member.id}', {'body': 'hi'}, format='json').status_code, 404)
        self.client.force_authenticate(self.admin)
        self.client.put(f'{T}/manage/{pid}/', {'is_published': True, 'allow_chat': False}, format='json')
        self.client.force_authenticate(self.student)
        self.assertEqual(self.client.post(f'{P}/me/messages/?member={member.id}', {'body': 'hi'}, format='json').status_code, 404)
        self.assertEqual(self.client.post(f'{P}/me/messages/?member={self.admin.id}', {'body': 'hi'}, format='json').status_code, 404)

    def test_link_preview_for_a_member_page(self):
        from cms.share import build_meta
        member, pid = self.make_member()
        TeamProfile.objects.filter(pk=pid).update(headline='Networks that just work', photo='/media/site/mo.jpg')
        meta = build_meta('/team/mohamed-sesay')
        self.assertEqual((meta['title'], meta['description'], meta['image']),
                         ('Mohamed Sesay, Lead Engineer | ADRAM Technologies', 'Networks that just work', '/media/site/mo.jpg'))
        TeamProfile.objects.filter(pk=pid).update(is_published=False)
        self.assertNotIn('Mohamed', build_meta('/team/mohamed-sesay').get('title', ''))
