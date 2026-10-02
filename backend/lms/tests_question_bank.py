"""Question banks, fill-in-the-blanks and matching questions, random draws from banks, CSV import and question stats."""
from django.core.files.uploadedfile import SimpleUploadedFile

from accounts.models import User
from catalog.models import Course

from .models import Lesson, Question, QuestionBank, QuestionCategory, QuizAttempt
from .questions import blanks_of, grade, parts_of
from .tests import API, LmsCase

MANAGE = f'{API}/manage'


class NewQuestionTypeTests(LmsCase):
    def test_fill_in_the_blanks(self):
        q = Question(kind=Question.FILL_BLANK, text='The capital is [Freetown] and the sky is [blue|grey].')
        q.data = {'blanks': blanks_of(q.text)}
        self.assertEqual(q.data['blanks'], [['Freetown'], ['blue', 'grey']])
        self.assertEqual([p.get('blank') for p in parts_of(q.text)], [None, 0, None, 1, None])
        self.assertTrue(grade(q, [' freetown ', 'Grey'])[0])
        self.assertFalse(grade(q, ['Freetown', ''])[0])
        self.assertFalse(grade(q, 'Freetown')[0])

    def test_matching(self):
        q = Question(kind=Question.MATCHING, text='Match', data={'pairs': [{'left': 'HTML', 'right': 'Structure'}, {'left': 'CSS', 'right': 'Style'}]})
        self.assertTrue(grade(q, ['structure', 'Style'])[0])
        self.assertFalse(grade(q, ['Style', 'Structure'])[0])

    def test_quiz_editor_saves_and_students_take_new_types(self):
        self.as_(self.admin)
        resp = self.client.put(f'{MANAGE}/lessons/{self.quiz.id}/quiz/', {'questions': [
            {'kind': 'fill_blank', 'text': 'HTML stands for [HyperText] Markup Language.', 'difficulty': 'hard'},
            {'kind': 'matching', 'text': 'Match them', 'data': {'pairs': [{'left': 'a', 'right': '1'}, {'left': 'b', 'right': '2'}, {'left': 'c', 'right': '3'}]}},
        ]}, format='json')
        self.assertEqual(resp.status_code, 200, resp.data)
        self.assertEqual([q['difficulty'] for q in resp.data['questions']], ['hard', 'medium'])
        bad = self.client.put(f'{MANAGE}/lessons/{self.quiz.id}/quiz/', {'questions': [{'kind': 'fill_blank', 'text': 'No blanks here'}]}, format='json')
        self.assertIn('square brackets', bad.data['questions'])
        bad = self.client.put(f'{MANAGE}/lessons/{self.quiz.id}/quiz/', {'questions': [{'kind': 'matching', 'text': 'x', 'data': {'pairs': [{'left': 'a', 'right': '1'}]}}]}, format='json')
        self.assertIn('between 2 and 10 pairs', bad.data['questions'])

        self.as_(self.student)
        self.enroll()
        attempt = self.client.post(f'{API}/lessons/{self.quiz.id}/quiz/start/').data
        blank, match = attempt['questions']
        self.assertNotIn('HyperText', str(blank))  # the answers are never sent
        self.assertIn('_____', blank['text'])
        self.assertEqual(match['prompts'], ['a', 'b', 'c'])
        self.assertEqual(sorted(match['options']), ['1', '2', '3'])
        self.assertNotIn('pairs', match)
        result = self.client.post(f'{API}/lessons/{self.quiz.id}/quiz/', {'attempt': attempt['id'], 'answers': {
            str(blank['id']): ['hypertext'], str(match['id']): ['1', '2', '3']}}, format='json').data
        self.assertEqual(result['score_percent'], 100)
        self.assertEqual(result['results'][0]['blanks'], [['HyperText']])
        self.assertEqual(len(result['results'][1]['pairs']), 3)


class QuestionBankTests(LmsCase):
    @classmethod
    def setUpTestData(cls):
        super().setUpTestData()
        cls.teacher = User.objects.create_user(email='teach@example.com', password='Str0ng!Pass', role=User.INSTRUCTOR, is_verified=True)
        cls.rival = User.objects.create_user(email='rival@example.com', password='Str0ng!Pass', role=User.INSTRUCTOR, is_verified=True)

    def setUp(self):
        super().setUp()
        Course.objects.filter(pk=self.course.pk).update(instructor=self.teacher)

    def make_bank(self, user=None):
        self.as_(user or self.teacher)
        bank = self.client.post(f'{MANAGE}/banks/', {'title': 'Web basics', 'course': 'web'}, format='json').data
        cat = self.client.post(f'{MANAGE}/banks/{bank["id"]}/categories/', {'name': 'HTML'}, format='json').data
        for i in range(4):
            resp = self.client.post(f'{MANAGE}/banks/{bank["id"]}/questions/', {
                'kind': 'single', 'text': f'Hard question {i}', 'difficulty': 'hard' if i < 3 else 'easy', 'category': cat['id'],
                'choices': [{'text': 'Right', 'is_correct': True}, {'text': 'Wrong'}]}, format='json')
            self.assertEqual(resp.status_code, 201, resp.data)
        return bank, cat

    def test_banks_belong_to_their_owner(self):
        bank, cat = self.make_bank()
        self.assertEqual(len(self.client.get(f'{MANAGE}/banks/').data), 1)
        detail = self.client.get(f'{MANAGE}/banks/{bank["id"]}/?difficulty=hard').data
        self.assertEqual((len(detail['questions']), detail['by_difficulty']['hard'], detail['categories'][0]['count']), (3, 3, 4))
        self.as_(self.rival)
        self.assertEqual(self.client.get(f'{MANAGE}/banks/').data, [])
        self.assertEqual(self.client.get(f'{MANAGE}/banks/{bank["id"]}/').status_code, 404)
        self.assertEqual(self.client.post(f'{MANAGE}/banks/', {'title': 'x', 'course': 'web'}, format='json').status_code, 400)
        self.as_(self.admin)
        self.assertEqual(len(self.client.get(f'{MANAGE}/banks/').data), 1)
        self.as_(self.student)
        self.assertEqual(self.client.get(f'{MANAGE}/banks/').status_code, 403)

    def test_edit_and_delete_questions_and_categories(self):
        bank, cat = self.make_bank()
        question = self.client.get(f'{MANAGE}/banks/{bank["id"]}/').data['questions'][0]
        resp = self.client.patch(f'{MANAGE}/bank-questions/{question["id"]}/', {'text': 'Edited', 'category': None}, format='json')
        self.assertEqual((resp.data['text'], resp.data['category'], len(resp.data['choices'])), ('Edited', None, 2))
        self.assertEqual(self.client.delete(f'{MANAGE}/bank-categories/{cat["id"]}/').status_code, 204)
        self.assertEqual(Question.objects.filter(bank_id=bank['id']).count(), 4)  # questions stay without it
        self.assertEqual(self.client.delete(f'{MANAGE}/bank-questions/{question["id"]}/').status_code, 204)
        self.assertEqual(Question.objects.filter(bank_id=bank['id']).count(), 3)

    def test_quiz_draws_random_questions_from_a_bank(self):
        bank, cat = self.make_bank()
        resp = self.client.put(f'{MANAGE}/lessons/{self.quiz.id}/quiz/', {
            'questions': [{'kind': 'true_false', 'text': 'Own question', 'answer': True}],
            'rules': [{'bank': bank['id'], 'category': cat['id'], 'difficulty': 'hard', 'count': 2}]}, format='json')
        self.assertEqual(resp.status_code, 200, resp.data)
        self.assertEqual((resp.data['rules'][0]['available'], resp.data['rules'][0]['count']), (3, 2))
        # someone else's bank can't be used
        self.as_(self.rival)
        other = self.client.post(f'{MANAGE}/banks/', {'title': 'Mine'}, format='json').data
        Course.objects.filter(pk=self.course.pk).update(instructor=self.rival)
        bad = self.client.put(f'{MANAGE}/lessons/{self.quiz.id}/quiz/', {'questions': [], 'rules': [{'bank': bank['id'], 'count': 1}]}, format='json')
        self.assertIn('your question banks', bad.data['rules'])
        self.assertTrue(other['id'])
        Course.objects.filter(pk=self.course.pk).update(instructor=self.teacher)

        self.as_(self.student)
        self.enroll()
        self.assertEqual(self.client.get(f'{API}/lessons/{self.quiz.id}/').data['quiz']['question_count'], 3)
        # bank rules need a started attempt
        self.assertEqual(self.client.post(f'{API}/lessons/{self.quiz.id}/quiz/', {'answers': {}}, format='json').data['code'], 'not_started')
        attempt = self.client.post(f'{API}/lessons/{self.quiz.id}/quiz/start/').data
        texts = [q['text'] for q in attempt['questions']]
        self.assertEqual(len(texts), 3)
        self.assertIn('Own question', texts)
        drawn = [q for q in attempt['questions'] if q['text'].startswith('Hard')]
        self.assertEqual(len(drawn), 2)
        answers = {str(q['id']): next(c['id'] for c in q['choices'] if c['text'] in ('Right', 'True')) for q in attempt['questions']}
        result = self.client.post(f'{API}/lessons/{self.quiz.id}/quiz/', {'attempt': attempt['id'], 'answers': answers}, format='json').data
        self.assertEqual(result['score_percent'], 100)
        # per-question statistics
        for q in drawn:
            stat = Question.objects.get(pk=q['id'])
            self.assertEqual((stat.times_answered, stat.times_correct), (1, 1))
        self.as_(self.teacher)
        stats = {q['id']: q['stats'] for q in self.client.get(f'{MANAGE}/banks/{bank["id"]}/').data['questions']}
        self.assertEqual(stats[drawn[0]['id']]['percent'], 100)

    def test_bank_in_use_needs_confirmation_to_delete(self):
        bank, _ = self.make_bank()
        self.client.put(f'{MANAGE}/lessons/{self.quiz.id}/quiz/', {'questions': [], 'rules': [{'bank': bank['id'], 'count': 2}]}, format='json')
        self.assertEqual(self.client.delete(f'{MANAGE}/banks/{bank["id"]}/').status_code, 409)
        self.assertEqual(self.client.delete(f'{MANAGE}/banks/{bank["id"]}/?force=1').status_code, 204)
        self.quiz.refresh_from_db()
        self.assertEqual(self.quiz.quiz_rules.count(), 0)
        self.assertFalse(self.quiz.is_published)  # no questions left to ask: taken offline

    def test_csv_import(self):
        self.as_(self.teacher)
        bank = QuestionBank.objects.create(owner=self.teacher, title='Imported')
        template = self.client.get(f'{MANAGE}/banks/import-template/')
        self.assertEqual(template.status_code, 200)
        upload = SimpleUploadedFile('q.csv', template.content, content_type='text/csv')
        resp = self.client.post(f'{MANAGE}/banks/{bank.id}/import/', {'file': upload}, format='multipart')
        self.assertEqual((resp.status_code, resp.data['created'], resp.data['errors']), (201, 6, []))
        kinds = sorted(bank.questions.values_list('kind', flat=True))
        self.assertEqual(kinds, sorted(['single', 'multiple', 'true_false', 'short', 'fill_blank', 'matching']))
        self.assertEqual(QuestionCategory.objects.filter(bank=bank).count(), 5)
        multiple = bank.questions.get(kind='multiple')
        self.assertEqual(sorted(c.text for c in multiple.choices.filter(is_correct=True)), ['JavaScript', 'Python'])
        self.assertEqual(bank.questions.get(kind='matching').data['pairs'][1], {'left': 'CSS', 'right': 'Style'})

        bad = ('type,question,options,correct\nsingle,Pick one,A|B,C\nwhatever,Hmm,,\nsingle,Good one,A|B,2\n').encode()
        resp = self.client.post(f'{MANAGE}/banks/{bank.id}/import/', {'file': SimpleUploadedFile('b.csv', bad)}, format='multipart')
        self.assertEqual(resp.data['created'], 1)
        self.assertEqual([e['row'] for e in resp.data['errors']], [2, 3])
        self.assertTrue(bank.questions.get(text='Good one').choices.get(text='B').is_correct)

    def test_lesson_quiz_still_published_with_only_rules(self):
        bank, _ = self.make_bank()
        resp = self.client.put(f'{MANAGE}/lessons/{self.quiz.id}/quiz/', {'questions': [], 'rules': [{'bank': bank['id'], 'count': 2}]}, format='json')
        self.assertTrue(resp.data['is_published'])
        self.assertEqual(Lesson.objects.get(pk=self.quiz.pk).questions.count(), 0)
        self.as_(self.student)
        self.enroll()
        self.assertEqual(len(self.client.post(f'{API}/lessons/{self.quiz.id}/quiz/start/').data['questions']), 2)
        self.assertEqual(QuizAttempt.objects.filter(lesson=self.quiz).count(), 1)
