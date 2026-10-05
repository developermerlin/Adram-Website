from unittest import mock

from django.contrib.auth import get_user_model
from django.core.cache import cache
from django.test import override_settings
from rest_framework.test import APITestCase

from . import ai
from .models import ChatbotSettings, ChatMessage, ChatSession

User = get_user_model()
C = '/api/v1/chatbot'


class ChatbotTests(APITestCase):
    def setUp(self):
        cache.clear()
        self.addCleanup(cache.clear)

    def test_config_and_no_key_fallback(self):
        with override_settings(ANTHROPIC_API_KEY=''):
            cfg = self.client.get(f'{C}/config/').data
            self.assertEqual((cfg['enabled'], cfg['ready'], cfg['name']), (True, False, 'ADRAM Assistant'))
            self.assertTrue(cfg['contact']['whatsapp'].startswith('https://wa.me/'))
            # without a key the assistant answers from the website content itself
            res = self.client.post(f'{C}/chat/', {'message': 'What services do you offer?'}, format='json').data
            self.assertFalse(res['handoff'])
            self.assertIn('/services/web-development', res['reply'])
            steps = self.client.post(f'{C}/chat/', {'session': res['session'], 'message': 'How can I apply for a scholarship?'}, format='json').data
            self.assertIn('ADRAM applies for you', steps['reply'])
            contact = self.client.post(f'{C}/chat/', {'session': res['session'], 'message': 'Where is your office?'}, format='json').data
            self.assertIn('wa.me', contact['reply'])
            person = self.client.post(f'{C}/chat/', {'session': res['session'], 'message': 'I want to talk to a person'}, format='json').data
            self.assertTrue(person['handoff'])
            unknown = self.client.post(f'{C}/chat/', {'session': res['session'], 'message': 'What is the capital of France?'}, format='json').data
            self.assertTrue(unknown['handoff'])
            self.assertEqual(ChatMessage.objects.filter(failed=True).count(), 0)
            # a broken lookup still gives the visitor a way forward
            with mock.patch('chatbot.local.answer', side_effect=RuntimeError):
                broken = self.client.post(f'{C}/chat/', {'message': 'Hello'}, format='json').data
            self.assertTrue(broken['handoff'])
            self.assertIn('ADRAM team', broken['reply'])
            self.assertEqual(ChatMessage.objects.filter(failed=True).count(), 1)

    def test_built_in_answers_on_courses_and_scholarships(self):
        from catalog.models import Course, Scholarship
        Course.objects.create(title='Speed Typing Bootcamp', slug='speed-typing-x', summary='Type fast.', is_published=True)
        Course.objects.create(title='Web Dev Intensive', slug='web-dev-x', summary='Build websites.', is_published=True)
        Scholarship.objects.create(name='Chevening Scholarships', slug='chevening-x', provider='UK Government', summary='UK masters.',
                                   is_published=True)
        with override_settings(ANTHROPIC_API_KEY=''):
            ask = lambda q: self.client.post(f'{C}/chat/', {'message': q}, format='json').data['reply']
            self.assertIn('Our training programmes', ask('Which training programmes can I join?'))
            self.assertIn('/courses/speed-typing-x', ask('How much is the speed typing bootcamp?'))
            self.assertIn('/scholarships/', ask('Tell me about Chevening'))
            self.assertIn('ADRAM applies for you', ask('how can i be able to apply for a scholarship'))

    @override_settings(ANTHROPIC_API_KEY='test-key')
    def test_conversation_with_history_and_handoff(self):
        calls = []

        def fake(model, rules, facts, history, max_tokens=600):
            calls.append((model, rules, facts, history))
            return ('We offer [web development](/services/web-development).\n[HANDOFF]' if len(history) > 1 else 'Hello!', len(history) > 1, 100, 20)

        with mock.patch.object(ai, 'ask', side_effect=fake):
            first = self.client.post(f'{C}/chat/', {'message': 'Hi', 'page': '/about'}, format='json').data
            self.assertEqual((first['reply'], first['handoff']), ('Hello!', False))
            second = self.client.post(f'{C}/chat/', {'session': first['session'], 'message': 'Could you summarise that for my manager?'}, format='json').data
        self.assertEqual(second['session'], first['session'])
        self.assertTrue(second['handoff'])
        self.assertNotIn('[HANDOFF]', second['reply'])
        model, rules, facts, history = calls[-1]
        self.assertEqual(model, ChatbotSettings.HAIKU)
        self.assertEqual([h['role'] for h in history], ['user', 'assistant', 'user'])
        self.assertIn('TRAINING PROGRAMMES', facts)
        self.assertIn('ADRAM Assistant', rules)
        s = ChatSession.objects.get()
        self.assertEqual((s.message_count, s.handoff, s.page), (2, True, '/about'))
        self.assertEqual(self.client.post(f'{C}/rate/', {'session': first['session'], 'rating': 1}, format='json').status_code, 200)
        self.assertEqual(ChatSession.objects.get().rating, 1)

    @override_settings(ANTHROPIC_API_KEY='test-key')
    def test_limits_and_switch_off(self):
        cfg = ChatbotSettings.load()
        cfg.per_hour = 2
        cfg.save()
        with mock.patch.object(ai, 'ask', return_value=('ok', False, 1, 1)):
            for _ in range(2):
                self.assertEqual(self.client.post(f'{C}/chat/', {'message': 'hi'}, format='json').status_code, 200)
            self.assertEqual(self.client.post(f'{C}/chat/', {'message': 'hi'}, format='json').status_code, 429)
        self.assertEqual(self.client.post(f'{C}/chat/', {'message': ''}, format='json').status_code, 400)  # empty: invalid before any limit
        cfg.enabled = False
        cfg.save()
        self.assertEqual(self.client.post(f'{C}/chat/', {'message': 'hi'}, format='json').status_code, 404)

    @override_settings(ANTHROPIC_API_KEY='test-key')
    def test_admin(self):
        admin = User.objects.create_user(email='a@example.com', password='x', role=User.ADMIN, is_verified=True)
        student = User.objects.create_user(email='s@example.com', password='x', role=User.STUDENT, is_verified=True)
        self.client.force_authenticate(student)
        self.assertEqual(self.client.get(f'{C}/manage/settings/').status_code, 403)
        self.client.force_authenticate(admin)
        bad = self.client.put(f'{C}/manage/settings/', {'name': '', 'per_hour': 0, 'model': 'gpt'}, format='json')
        self.assertEqual((bad.status_code, len(bad.data['errors'])), (400, 3))
        ok = self.client.put(f'{C}/manage/settings/', {'name': 'Ada', 'knowledge': 'We are closed on public holidays.',
                                                      'suggestions': ['Fees?', ''], 'model': ChatbotSettings.SONNET}, format='json').data
        self.assertEqual((ok['name'], ok['suggestions'], ok['model']), ('Ada', ['Fees?'], ChatbotSettings.SONNET))
        self.assertIn('public holidays', self.client.get(f'{C}/manage/knowledge/').data['text'])
        with mock.patch.object(ai, 'ask', return_value=('Hi from Ada', False, 5, 3)):
            self.assertEqual(self.client.post(f'{C}/manage/test/', {'message': 'hi'}, format='json').data['reply'], 'Hi from Ada')
            self.client.post(f'{C}/chat/', {'message': 'Do you build websites?'}, format='json')
        listing = self.client.get(f'{C}/manage/conversations/').data
        self.assertEqual((len(listing['results']), listing['results'][0]['first'], listing['figures']['questions']), (1, 'Do you build websites?', 1))
        sid = listing['results'][0]['id']
        self.assertEqual(len(self.client.get(f'{C}/manage/conversations/{sid}/').data['transcript']), 2)
        self.assertEqual(self.client.delete(f'{C}/manage/conversations/{sid}/').status_code, 204)

    def test_ready_made_questions(self):
        cfg = ChatbotSettings.load()
        self.assertGreater(len(cfg.faqs), 10)
        shown = self.client.get(f'{C}/config/').data['questions']
        self.assertIn('How much does a website or app cost?', shown)
        self.assertNotIn('I forgot my password', shown)  # answered, but not offered as a button
        # a tapped question gets the admin's answer word for word, AI key or not, with live blocks filled in
        with override_settings(ANTHROPIC_API_KEY='test-key'), mock.patch.object(ai, 'ask') as asked:
            res = self.client.post(f'{C}/chat/', {'message': 'How much does a website or app cost?'}, format='json').data
            hours = self.client.post(f'{C}/chat/', {'message': 'opening hours'}, format='json').data
            contact = self.client.post(f'{C}/chat/', {'message': 'How do I contact the team?'}, format='json').data
        asked.assert_not_called()
        self.assertTrue(res['handoff'])
        self.assertIn('Every project is different', res['reply'])
        self.assertIn('Monday', hours['reply'])
        self.assertIn('wa.me', contact['reply'])
        self.assertNotIn('{contact}', contact['reply'])
        # longer questions that only mention a keyword word are not hijacked
        from .faqs import match
        self.assertIsNone(match('tell me about the computer networking course', cfg.faqs))
        self.assertEqual(match('do you fix laptops', cfg.faqs)['question'], 'Do you repair computers?')

    def test_admin_edits_questions(self):
        admin = User.objects.create_user(email='a@example.com', password='x', role=User.ADMIN, is_verified=True)
        self.client.force_authenticate(admin)
        url = f'{C}/manage/settings/'
        missing = self.client.put(url, {'faqs': [{'question': 'Fees?', 'answer': ''}]}, format='json')
        self.assertEqual(missing.status_code, 400)
        twice = self.client.put(url, {'faqs': [{'question': 'Fees?', 'answer': 'a'}, {'question': 'fees', 'answer': 'b'}]}, format='json')
        self.assertEqual(twice.status_code, 400)
        ok = self.client.put(url, {'faqs': [{'question': 'Do you accept Orange Money?', 'answer': 'Yes, and bank transfer.', 'keywords': 'orange money, payment methods',
                                             'show': True}, {'question': '', 'answer': ''}]}, format='json').data
        self.assertEqual(len(ok['faqs']), 1)
        self.assertTrue(ok['faqs'][0]['id'])
        self.client.force_authenticate(None)
        self.assertEqual(self.client.get(f'{C}/config/').data['questions'], ['Do you accept Orange Money?'])
        with override_settings(ANTHROPIC_API_KEY=''):
            reply = self.client.post(f'{C}/chat/', {'message': 'Can I pay with orange money?'}, format='json').data['reply']
        self.assertEqual(reply, 'Yes, and bank transfer.')
