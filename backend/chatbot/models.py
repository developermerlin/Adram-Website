"""
The website's AI assistant: its settings (one row, edited in Admin → Chatbot) and the conversations it has had.
"""
import uuid

from django.conf import settings
from django.db import models

DEFAULT_SUGGESTIONS = [
    'What services does ADRAM offer?',
    'Which training programmes can I join?',
    'How can ADRAM help me apply for a scholarship?',
    'How do I contact the team?',
]


class ChatbotSettings(models.Model):
    HAIKU, SONNET = 'claude-haiku-4-5-20251001', 'claude-sonnet-5-5'
    MODELS = [(HAIKU, 'Claude Haiku 4.5 (fast, lowest cost)'), (SONNET, 'Claude Sonnet 5.5 (more capable, higher cost)')]

    enabled = models.BooleanField(default=True, help_text='Show the chat button on the website.')
    name = models.CharField(max_length=60, default='ADRAM Assistant')
    greeting = models.CharField(max_length=300, default='Hi! I’m the ADRAM Assistant. Ask me about our services, training programmes or scholarships.')
    suggestions = models.JSONField(default=list, blank=True, help_text='Questions offered to visitors before they type.')
    instructions = models.TextField(blank=True, max_length=4000, help_text='Extra rules for the assistant, e.g. topics to avoid.')
    knowledge = models.TextField(blank=True, max_length=20000, help_text='Extra facts and FAQs the assistant should know.')
    faqs = models.JSONField(default=list, blank=True, help_text='Ready-made questions and answers (see chatbot/faqs.py).')
    model = models.CharField(max_length=60, choices=MODELS, default=HAIKU)
    per_hour = models.PositiveSmallIntegerField(default=20, help_text='Messages one visitor can send per hour.')
    per_conversation = models.PositiveSmallIntegerField(default=40, help_text='Messages in one conversation.')
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        verbose_name = verbose_name_plural = 'chatbot settings'

    @classmethod
    def load(cls):
        row = cls.objects.first()
        if row:
            return row
        from .faqs import DEFAULT_FAQS
        return cls.objects.create(suggestions=DEFAULT_SUGGESTIONS, faqs=DEFAULT_FAQS)


class ChatSession(models.Model):
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    user = models.ForeignKey(settings.AUTH_USER_MODEL, null=True, blank=True, on_delete=models.SET_NULL, related_name='chatbot_sessions')
    visitor = models.CharField(max_length=64, blank=True, help_text='A one-way fingerprint of the visitor’s network address.')
    page = models.CharField(max_length=300, blank=True, help_text='Where the conversation started.')
    message_count = models.PositiveIntegerField(default=0)
    handoff = models.BooleanField(default=False, help_text='The visitor was pointed to a person.')
    rating = models.SmallIntegerField(null=True, blank=True, help_text='1 = helpful, -1 = not helpful.')
    started_at = models.DateTimeField(auto_now_add=True)
    last_at = models.DateTimeField(auto_now=True, db_index=True)

    class Meta:
        ordering = ['-last_at']


class ChatMessage(models.Model):
    USER, ASSISTANT = 'user', 'assistant'
    session = models.ForeignKey(ChatSession, on_delete=models.CASCADE, related_name='messages')
    role = models.CharField(max_length=10, choices=[(USER, 'Visitor'), (ASSISTANT, 'Assistant')])
    content = models.TextField(max_length=8000)
    failed = models.BooleanField(default=False)
    input_tokens = models.PositiveIntegerField(default=0)
    output_tokens = models.PositiveIntegerField(default=0)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ['created_at', 'id']
