import shutil
import tempfile

from django.contrib.auth import get_user_model
from django.core.files.uploadedfile import SimpleUploadedFile
from django.test import override_settings
from rest_framework.test import APITestCase

from .models import Field, Note, NoteProgress, Topic

User = get_user_model()
L = '/api/v1/learning'


class LearningTests(APITestCase):
    def setUp(self):
        self.admin = User.objects.create_user(email='admin@example.com', password='x', role=User.ADMIN, is_verified=True)
        self.ama = User.objects.create_user(email='ama@example.com', password='x', role=User.STUDENT, is_verified=True)
        self.client.force_authenticate(self.admin)
        self.field = self.client.post(f'{L}/manage/fields/', {'name': 'Networking', 'summary': 'From cables to clouds.', 'icon': 'network'},
                                      format='json').data
        fid = self.field['id']
        self.client.post(f'{L}/manage/topics/', {'field': fid, 'level': 2, 'title': 'IP addressing'}, format='json')
        self.client.post(f'{L}/manage/topics/', {'field': fid, 'level': 1, 'title': 'What is a network?'}, format='json')
        topics = {t['title']: t['id'] for t in self.client.get(f'{L}/manage/fields/{fid}/').data['curriculum']}
        self.t_basics, self.t_ip = topics['What is a network?'], topics['IP addressing']

        def note(topic, title, **extra):
            return self.client.post(f'{L}/manage/notes/', {'topic': topic, 'title': title, 'body': 'Some words ' * 300, 'is_published': True, **extra},
                                    format='json').data
        self.n1 = note(self.t_basics, 'Networks in everyday life')
        self.n2 = note(self.t_basics, 'Devices on a network', kind='lab')
        self.n3 = note(self.t_ip, 'IPv4 addresses', objectives=['Read an IPv4 address', ''], resources=[
            {'kind': 'file', 'title': 'Subnetting sheet', 'url': '/media/learning/sheet.pdf'}, {'kind': 'video', 'title': 'Video', 'url': 'https://youtu.be/x'}])
        self.draft = note(self.t_ip, 'Subnetting (draft)', is_published=False)
        self.client.patch(f'{L}/manage/fields/{fid}/', {'is_published': True}, format='json')
        self.client.force_authenticate(None)

    def test_public_hub_roadmap_and_reader(self):
        fields = self.client.get(f'{L}/fields/').data['results']
        self.assertEqual((fields[0]['name'], fields[0]['notes'], fields[0]['topics'], fields[0]['levels'], fields[0]['labs']),
                         ('Networking', 3, 2, [1, 2], 1))
        field = self.client.get(f'{L}/fields/networking/').data
        # zero comes before foundations whatever order the topics were created in; drafts are hidden
        self.assertEqual([lv['level'] for lv in field['roadmap']], [1, 2])
        self.assertEqual([n['title'] for n in field['roadmap'][1]['topics'][0]['notes']], ['IPv4 addresses'])
        self.assertEqual(field['next']['slug'], 'networks-in-everyday-life')
        note = self.client.get(f'{L}/fields/networking/notes/devices-on-a-network/').data
        self.assertEqual((note['prev']['slug'], note['next']['slug'], note['position']), ('networks-in-everyday-life', 'ipv4-addresses', 2))
        self.assertEqual(note['minutes'], 3)
        ip = self.client.get(f'{L}/fields/networking/notes/ipv4-addresses/').data
        self.assertEqual(ip['objectives'], ['Read an IPv4 address'])
        self.assertEqual(len(ip['resources']), 2)
        self.assertIsNone(ip['next'])
        self.assertEqual(self.client.get(f'{L}/fields/networking/notes/{self.draft["slug"]}/').status_code, 404)
        # an admin can preview the draft
        self.client.force_authenticate(self.admin)
        self.assertTrue(self.client.get(f'{L}/fields/networking/notes/{self.draft["slug"]}/').data['draft'])

    def test_progress_for_signed_in_learners(self):
        self.assertEqual(self.client.post(f'{L}/notes/{self.n1["id"]}/progress/').status_code, 401)
        self.client.force_authenticate(self.ama)
        res = self.client.post(f'{L}/notes/{self.n1["id"]}/progress/').data
        self.assertEqual((res['done'], res['field_done'], res['field_notes'], res['next']['slug']), (True, 1, 3, 'devices-on-a-network'))
        self.client.post(f'{L}/notes/{self.n1["id"]}/progress/')  # twice is fine
        self.assertEqual(NoteProgress.objects.count(), 1)
        mine = self.client.get(f'{L}/me/').data['results']
        self.assertEqual((mine[0]['done'], mine[0]['next']['slug']), (1, 'devices-on-a-network'))
        self.assertEqual(self.client.get(f'{L}/fields/').data['results'][0]['done'], 1)
        undone = self.client.delete(f'{L}/notes/{self.n1["id"]}/progress/').data
        self.assertFalse(undone['done'])
        # a draft can't be marked
        self.assertEqual(self.client.post(f'{L}/notes/{self.draft["id"]}/progress/').status_code, 404)

    def test_search(self):
        self.assertEqual(self.client.get(f'{L}/search/', {'q': 'a'}).data['results'], [])
        hits = self.client.get(f'{L}/search/', {'q': 'ipv4'}).data['results']
        self.assertEqual([h['slug'] for h in hits], ['ipv4-addresses'])
        self.assertEqual(hits[0]['field']['slug'], 'networking')
        self.assertEqual(self.client.get(f'{L}/search/', {'q': 'subnetting (draft)'}).data['results'], [])

    def test_unpublished_field_is_hidden(self):
        Field.objects.update(is_published=False)
        self.assertEqual(self.client.get(f'{L}/fields/').data['results'], [])
        self.assertEqual(self.client.get(f'{L}/fields/networking/').status_code, 404)
        self.assertEqual(self.client.get(f'{L}/fields/networking/notes/ipv4-addresses/').status_code, 404)

    def test_admin_validation_and_structure(self):
        self.client.force_authenticate(self.ama)
        self.assertEqual(self.client.get(f'{L}/manage/fields/').status_code, 403)
        self.client.force_authenticate(self.admin)
        bad = self.client.post(f'{L}/manage/notes/', {'topic': self.t_ip, 'title': '', 'is_published': True,
                                                     'resources': [{'title': 'x', 'url': 'javascript:alert(1)'}]}, format='json')
        self.assertEqual(set(bad.data['errors']), {'title', 'resources', 'body'})
        # same title in the same field gets its own address; a topic with notes can't be deleted
        twin = self.client.post(f'{L}/manage/notes/', {'topic': self.t_ip, 'title': 'IPv4 addresses'}, format='json').data
        self.assertEqual(twin['slug'], 'ipv4-addresses-2')
        self.assertEqual(self.client.delete(f'{L}/manage/topics/{self.t_ip}/').status_code, 400)
        # moving a topic to another level, and reordering notes
        self.client.patch(f'{L}/manage/topics/{self.t_ip}/', {'level': 3}, format='json')
        self.assertEqual(Topic.objects.get(pk=self.t_ip).level, 3)
        self.client.post(f'{L}/manage/notes/reorder/', {'ids': [self.n2['id'], self.n1['id']]}, format='json')
        self.client.force_authenticate(None)
        first = self.client.get(f'{L}/fields/networking/').data['roadmap'][0]['topics'][0]['notes'][0]
        self.assertEqual(first['slug'], 'devices-on-a-network')
        # a note can't jump to another field's topic
        self.client.force_authenticate(self.admin)
        other = self.client.post(f'{L}/manage/fields/', {'name': 'Web Development'}, format='json').data
        self.client.post(f'{L}/manage/topics/', {'field': other['id'], 'level': 1, 'title': 'HTML'}, format='json')
        html = Topic.objects.get(title='HTML')
        self.assertIn('topic', self.client.patch(f'{L}/manage/notes/{self.n1["id"]}/', {'topic': html.id}, format='json').data['errors'])
        self.assertEqual(Note.objects.get(pk=self.n1['id']).field.slug, 'networking')

    def test_publish_all_notes_in_a_field(self):
        self.client.force_authenticate(self.admin)
        Note.objects.create(topic_id=self.t_ip, title='Empty', slug='empty', body='', is_published=False)
        res = self.client.post(f'{L}/manage/fields/{self.field["id"]}/publish-notes/', {'publish': True}, format='json').data
        self.assertEqual(res['changed'], 1)  # the draft with text; the empty one stays a draft
        self.assertFalse(Note.objects.get(slug='empty').is_published)
        off = self.client.post(f'{L}/manage/fields/{self.field["id"]}/publish-notes/', {'publish': False}, format='json').data
        self.assertEqual((off['changed'], off['published_notes']), (4, 0))
        self.client.force_authenticate(self.ama)
        self.assertEqual(self.client.post(f'{L}/manage/fields/{self.field["id"]}/publish-notes/', {}, format='json').status_code, 403)

    def test_pdf_book(self):
        from django.core.cache import cache
        cache.clear()
        res = self.client.get(f'{L}/fields/networking/pdf/')
        self.assertEqual(res.status_code, 200)
        self.assertEqual(res['Content-Type'], 'application/pdf')
        self.assertIn('attachment; filename="Networking - ADRAM learning notes.pdf"', res['Content-Disposition'])
        pdf = res.content
        self.assertTrue(pdf.startswith(b'%PDF'))
        self.assertGreater(len(pdf), 20000)
        # the same version comes from the cache; an edit makes a new one
        self.assertEqual(self.client.get(f'{L}/fields/networking/pdf/').content, pdf)
        Note.objects.filter(pk=self.n1['id']).update(title='Networks around us')
        Note.objects.get(pk=self.n1['id']).save()
        self.assertNotEqual(self.client.get(f'{L}/fields/networking/pdf/').content, pdf)
        # drafts only for administrators; hidden fields stay hidden
        visitor_drafts = self.client.get(f'{L}/fields/networking/pdf/', {'drafts': 1})
        self.assertNotIn('with drafts', visitor_drafts['Content-Disposition'])
        self.client.force_authenticate(self.admin)
        self.assertIn('(with drafts)', self.client.get(f'{L}/fields/networking/pdf/', {'drafts': 1})['Content-Disposition'])
        self.client.force_authenticate(None)
        Field.objects.update(is_published=False)
        self.assertEqual(self.client.get(f'{L}/fields/networking/pdf/').status_code, 404)

    def test_pdf_text_tools(self):
        from reportlab.lib.colors import HexColor

        from .pdf import inline, parse_blocks, plain
        self.assertEqual(plain('2ⁿ − 2 & <b>'), '2<super>n</super> − 2 &amp; &lt;b&gt;')
        self.assertIn('<b>bold</b>', inline('**bold**', {'primary': HexColor('#7c2d12')}))
        source = '\n'.join(['## Title', '', '| A | B |', '|---|---|', '| 1 | 2 |', '', '> [!TIP] Hi', '',
                            '```cisco Name the switch', 'hostname SW1', '```', '', '![Map](/x.png "medium")'])
        kinds = [b['type'] for b in parse_blocks(source)]
        self.assertEqual(kinds, ['h2', 'table', 'callout', 'code', 'img'])

    def test_upload(self):
        media = tempfile.mkdtemp()
        self.addCleanup(shutil.rmtree, media, ignore_errors=True)
        self.client.force_authenticate(self.admin)
        with override_settings(MEDIA_ROOT=media):
            ok = self.client.post(f'{L}/manage/upload/', {'file': SimpleUploadedFile('Subnet Sheet.pdf', b'%PDF-1.4 test')}, format='multipart')
            fake = self.client.post(f'{L}/manage/upload/', {'file': SimpleUploadedFile('x.pdf', b'<html>')}, format='multipart')
            script = self.client.post(f'{L}/manage/upload/', {'file': SimpleUploadedFile('x.html', b'<script>')}, format='multipart')
        self.assertEqual(ok.status_code, 201)
        self.assertIn('/media/learning/', ok.data['url'])
        self.assertTrue(ok.data['url'].endswith('subnet-sheet.pdf'))
        self.assertEqual((fake.status_code, script.status_code), (400, 400))

    def test_link_preview_and_chatbot(self):
        from chatbot.knowledge import build
        from cms.share import build_meta
        self.assertTrue(build_meta('/learning/networking')['title'].startswith('Networking from zero to hero'))
        self.assertTrue(build_meta('/learning/networking/ipv4-addresses')['title'].startswith('IPv4 addresses | Networking'))
        self.assertIn('/learning/networking', build())
