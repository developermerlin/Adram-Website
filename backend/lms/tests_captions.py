"""Subtitles for uploaded videos: .vtt and .srt upload, replacing, serving, and who may manage them."""
from django.core.files.uploadedfile import SimpleUploadedFile

from .captions import srt_to_vtt
from .models import Lesson, LessonCaption
from .tests import API, LmsCase

SRT = b'1\n00:00:01,000 --> 00:00:04,000\nHello and welcome.\n\n2\n00:00:05,500 --> 00:00:08,000\nLet us begin.\n'
VTT = b'WEBVTT\n\n00:00:01.000 --> 00:00:04.000\nBonjour.\n'


class CaptionTests(LmsCase):
    def setUp(self):
        super().setUp()
        self.video = Lesson.objects.create(section=self.section, title='Upload', kind=Lesson.VIDEO, sort_order=8, is_published=True,
                                           video_source=Lesson.UPLOAD, video_file=SimpleUploadedFile('v.mp4', b'\x00\x00\x00\x18ftypmp42'))

    def upload(self, name, content, language='en', label='English', lesson=None):
        return self.client.post(f'{API}/manage/lessons/{(lesson or self.video).id}/captions/',
                                {'file': SimpleUploadedFile(name, content), 'language': language, 'label': label}, format='multipart')

    def test_srt_conversion(self):
        vtt = srt_to_vtt(SRT.decode())
        self.assertTrue(vtt.startswith('WEBVTT'))
        self.assertIn('00:00:05.500 --> 00:00:08.000', vtt)

    def test_upload_replace_serve_delete(self):
        self.as_(self.admin)
        en = self.upload('subs.srt', SRT).data
        self.assertEqual((en['language'], en['label']), ('en', 'English'))
        self.upload('fr.vtt', VTT, 'fr', 'Français')
        self.upload('subs2.srt', SRT.replace(b'Hello', b'Hi'))  # English again: replaces
        self.assertEqual(LessonCaption.objects.count(), 2)
        # bad files
        self.assertIn('vtt or .srt', str(self.upload('notes.txt', b'hello').data))
        self.assertIn('no timings', str(self.upload('x.vtt', b'WEBVTT\n\nnothing').data))
        self.assertEqual(self.upload('x.vtt', VTT, lesson=self.intro).status_code, 400)  # a YouTube lesson
        # students see them with the video and can load them
        self.as_(self.student)
        self.enroll()
        captions = self.client.get(f'{API}/lessons/{self.video.id}/').data['video']['captions']
        self.assertEqual([c['label'] for c in captions], ['English', 'Français'])
        resp = self.client.get(next(c['url'] for c in captions if c['language'] == 'en'))
        self.assertEqual(resp['Content-Type'].split(';')[0], 'text/vtt')
        self.assertIn(b'Hi and welcome', b''.join(resp.streaming_content))
        self.assertEqual(self.client.delete(f'{API}/manage/captions/{captions[0]["id"]}/').status_code, 403)
        self.as_(self.admin)
        self.assertEqual(self.client.delete(f'{API}/manage/captions/{captions[0]["id"]}/').status_code, 204)
        self.assertEqual(LessonCaption.objects.count(), 1)
