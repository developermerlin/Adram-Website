"""The similarity check on assignment hand-ins."""
import io
import zipfile

from django.core.files.uploadedfile import SimpleUploadedFile

from accounts.models import User
from portal.models import TrainingEnrollment

from .models import Lesson, Submission
from .similarity import overlap, shingles
from .tests import API, LmsCase

ESSAY = ('The internet is a network of networks that connects millions of computers around the world. Data travels in small '
         'packets that each find their own route, and routers pass them along until they reach the right address. Protocols '
         'such as TCP and IP make sure the pieces arrive and are put back together in the correct order.')
OTHER = ('My favourite programming language is Python because it reads almost like English and has libraries for nearly '
         'everything, from building websites with Django to analysing data with pandas and drawing charts with matplotlib.')


def docx(text):
    buf = io.BytesIO()
    with zipfile.ZipFile(buf, 'w') as z:
        z.writestr('word/document.xml', f'<w:document><w:body><w:p><w:r><w:t>{text}</w:t></w:r></w:p></w:body></w:document>')
    return buf.getvalue()


class SimilarityTests(LmsCase):
    def setUp(self):
        super().setUp()
        self.task = Lesson.objects.create(section=self.section, title='Essay', kind=Lesson.ASSIGNMENT, sort_order=5, is_published=True,
                                          body='Explain how the internet works.')
        self.third = User.objects.create_user(email='cara@example.com', password='x', role=User.STUDENT, is_verified=True)
        for user in (self.student, self.other, self.third):
            TrainingEnrollment.objects.create(student=user, course=self.course, status=TrainingEnrollment.ACTIVE)

    def hand_in(self, user, text='', files=None):
        self.as_(user)
        data = {'text': text}
        if files:
            data['files'] = files
        return Submission.objects.get(pk=self.client.post(f'{API}/lessons/{self.task.id}/submissions/', data, format='multipart').data['id'])

    def test_overlap(self):
        self.assertEqual(overlap(shingles(ESSAY), shingles(ESSAY + ' ' + OTHER)), 100)  # copied into a longer answer
        self.assertEqual(overlap(shingles(ESSAY), shingles(OTHER)), 0)
        self.assertEqual(shingles('too short to judge'), set())

    def test_copied_work_is_flagged_both_ways(self):
        first = self.hand_in(self.student, ESSAY)
        self.assertEqual(first.similarity, 0)  # nobody else yet
        copy = self.hand_in(self.other, ESSAY.replace('millions', 'billions'))
        honest = self.hand_in(self.third, OTHER)
        copy.refresh_from_db()
        first.refresh_from_db()
        honest.refresh_from_db()
        self.assertGreaterEqual(copy.similarity, 80)
        self.assertEqual(copy.similar_to, first)
        self.assertGreaterEqual(first.similarity, 80)  # the earlier work is marked too
        self.assertEqual(honest.similarity, 0)
        self.as_(self.admin)
        rows = {r['id']: r for r in self.client.get(f'{API}/manage/courses/web/submissions/').data['submissions']}
        self.assertEqual((rows[copy.id]['similarity']['with'], rows[copy.id]['similarity']['flag']), ('Amina Kamara', True))

    def test_files_are_read(self):
        self.hand_in(self.student, files=[SimpleUploadedFile('essay.docx', docx(ESSAY))])
        copy = self.hand_in(self.other, files=[SimpleUploadedFile('essay.txt', ESSAY.encode())])
        self.assertGreaterEqual(copy.similarity, 90)
        pic = self.hand_in(self.third, 'Here is my diagram.', [SimpleUploadedFile('diagram.png', b'\x89PNG')])
        self.assertIsNone(pic.similarity)  # nothing readable to compare
