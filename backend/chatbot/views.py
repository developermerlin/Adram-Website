"""
The website assistant's API.

Public
  GET  /chatbot/config/                   is it on, its name, greeting, suggested questions, how to reach a person
  POST /chatbot/chat/   {session?, message, page?}  -> {session, reply, handoff}
  POST /chatbot/rate/   {session, rating: 1 | -1}
Administrators
  GET/PUT  /chatbot/manage/settings/
  GET      /chatbot/manage/conversations/?q=&handoff=1     (+ figures for the last 30 days)
  GET/DELETE /chatbot/manage/conversations/<uuid>/
  GET      /chatbot/manage/knowledge/     the text the assistant answers from
  POST     /chatbot/manage/test/ {message}   try the assistant without saving anything
"""
import hashlib
import logging
import re
from datetime import timedelta

from django.conf import settings
from django.core.cache import cache
from django.db.models import Count, Q, Sum
from django.shortcuts import get_object_or_404
from django.utils import timezone
from rest_framework import status
from rest_framework.permissions import AllowAny
from rest_framework.response import Response
from rest_framework.views import APIView

from accounts.permissions import IsAdmin

from . import ai, faqs, knowledge, local
from .models import DEFAULT_SUGGESTIONS, ChatbotSettings, ChatMessage, ChatSession

MAX_MESSAGE = 1000
HISTORY_TURNS = 12
logger = logging.getLogger(__name__)
FALLBACK = ('Sorry, I can’t answer right now. You can reach the ADRAM team directly on WhatsApp, by phone or through the '
            'contact form, and someone will get back to you.')


def visitor_key(request):
    ip = request.META.get('HTTP_X_FORWARDED_FOR', '').split(',')[0].strip() or request.META.get('REMOTE_ADDR', '')
    return hashlib.sha256(f'{settings.SECRET_KEY}:{ip}'.encode()).hexdigest()[:32]


def contact():
    data = knowledge._cms('site')
    phones = data.get('phones') if isinstance(data.get('phones'), list) and data.get('phones') else knowledge.SITE['phones']
    return {'whatsapp': knowledge.SITE['whatsapp'], 'phone': phones[0], 'email': data.get('email') or knowledge.SITE['email']}


class ConfigView(APIView):
    permission_classes = [AllowAny]

    def get(self, request):
        cfg = ChatbotSettings.load()
        return Response({'enabled': cfg.enabled, 'ready': ai.configured(), 'name': cfg.name, 'greeting': cfg.greeting,
                         'suggestions': cfg.suggestions or [], 'contact': contact(),
                         'questions': [f['question'] for f in cfg.faqs or [] if f.get('show')]})


def built_in(message, user, faq_list=None):
    """The assistant's own answer from the website content (no AI service). ('', True) if even that goes wrong."""
    try:
        return local.answer(message, user, faq_list)
    except Exception:  # noqa: BLE001 - a broken lookup must never stop the chat
        logger.exception('Built-in chatbot answer failed')
        return '', True


class ChatView(APIView):
    permission_classes = [AllowAny]

    def post(self, request):
        cfg = ChatbotSettings.load()
        if not cfg.enabled:
            return Response({'detail': 'The assistant is switched off.'}, status=status.HTTP_404_NOT_FOUND)
        message = re.sub(r'\s+\n', '\n', str(request.data.get('message') or '')).strip()[:MAX_MESSAGE]
        if not message:
            return Response({'detail': 'Type a question first.'}, status=status.HTTP_400_BAD_REQUEST)
        who = visitor_key(request)
        hour_key = f'chatbot:rate:{who}:{timezone.now():%Y%m%d%H}'
        if cache.get(hour_key, 0) >= cfg.per_hour:
            return Response({'detail': 'You’ve sent a lot of messages. Please wait a little, or contact the team directly.', 'limited': True},
                            status=status.HTTP_429_TOO_MANY_REQUESTS)
        session = None
        raw = str(request.data.get('session') or '')
        if re.fullmatch(r'[0-9a-f-]{36}', raw):
            session = ChatSession.objects.filter(pk=raw, visitor=who).first()
        if session is None:
            user = request.user if request.user.is_authenticated else None
            session = ChatSession.objects.create(visitor=who, user=user, page=str(request.data.get('page') or '')[:300])
        if session.message_count >= cfg.per_conversation:
            return Response({'session': str(session.pk), 'reply': 'We’ve covered a lot in this conversation. For anything else, please contact the ADRAM team directly.',
                             'handoff': True})
        cache.set(hour_key, cache.get(hour_key, 0) + 1, 3600)

        ChatMessage.objects.create(session=session, role=ChatMessage.USER, content=message)
        history = [{'role': m.role, 'content': m.content}
                   for m in session.messages.filter(failed=False).order_by('-created_at', '-id')[:HISTORY_TURNS * 2]][::-1]
        if history and history[0]['role'] == ChatMessage.ASSISTANT:
            history = history[1:]  # the API expects the visitor to speak first
        hit = faqs.match(message, cfg.faqs or [])
        try:
            if hit:  # the admin's own answer, word for word
                reply, handoff, tokens_in, tokens_out, failed = faqs.render(hit['answer']), bool(hit.get('handoff')), 0, 0, False
            else:
                rules, facts = knowledge.system_prompt(cfg, request.user)
                reply, handoff, tokens_in, tokens_out = ai.ask(cfg.model, rules, facts, history)
                failed = False
                if ai.HANDOFF in reply:  # never show the marker, wherever it came from
                    reply, handoff = reply.replace(ai.HANDOFF, '').strip(), True
        except Exception as exc:  # noqa: BLE001 - the visitor always gets an answer
            if not isinstance(exc, ai.AssistantUnavailable):
                logger.exception('Chatbot answer failed')
            (reply, handoff), tokens_in, tokens_out, failed = built_in(message, request.user), 0, 0, False
            if not reply:
                reply, handoff, failed = FALLBACK, True, True
        ChatMessage.objects.create(session=session, role=ChatMessage.ASSISTANT, content=reply or FALLBACK, failed=failed,
                                   input_tokens=tokens_in, output_tokens=tokens_out)
        session.message_count += 1
        session.handoff = session.handoff or handoff
        session.save(update_fields=['message_count', 'handoff', 'last_at'])
        return Response({'session': str(session.pk), 'reply': reply or FALLBACK, 'handoff': handoff})


class RateView(APIView):
    permission_classes = [AllowAny]

    def post(self, request):
        session = get_object_or_404(ChatSession, pk=str(request.data.get('session') or '00000000-0000-0000-0000-000000000000'),
                                    visitor=visitor_key(request))
        rating = request.data.get('rating')
        if rating not in (1, -1):
            return Response({'detail': 'Rate 1 or -1.'}, status=status.HTTP_400_BAD_REQUEST)
        session.rating = rating
        session.save(update_fields=['rating'])
        return Response({'ok': True})


# ---------------------------------------------------------------- administrators

def settings_data(cfg):
    return {'enabled': cfg.enabled, 'name': cfg.name, 'greeting': cfg.greeting, 'suggestions': cfg.suggestions or [],
            'instructions': cfg.instructions, 'knowledge': cfg.knowledge, 'model': cfg.model, 'models': ChatbotSettings.MODELS,
            'per_hour': cfg.per_hour, 'per_conversation': cfg.per_conversation, 'ready': ai.configured(), 'updated_at': cfg.updated_at,
            'default_suggestions': DEFAULT_SUGGESTIONS, 'faqs': cfg.faqs or [], 'default_faqs': faqs.DEFAULT_FAQS}


class ManageSettingsView(APIView):
    permission_classes = [IsAdmin]

    def get(self, request):
        return Response(settings_data(ChatbotSettings.load()))

    def put(self, request):
        cfg = ChatbotSettings.load()
        d, errors = request.data, []
        for field, limit in (('name', 60), ('greeting', 300), ('instructions', 4000), ('knowledge', 20000)):
            if field in d:
                setattr(cfg, field, str(d[field] or '').strip()[:limit])
        if not cfg.name:
            errors.append('Give the assistant a name.')
        if 'enabled' in d:
            cfg.enabled = bool(d['enabled'])
        if 'suggestions' in d:
            cfg.suggestions = [s for s in (str(x).strip()[:120] for x in (d['suggestions'] or [])[:6]) if s]
        if 'faqs' in d:
            try:
                cfg.faqs = faqs.clean(d['faqs'])
            except ValueError as exc:
                errors.append(str(exc))
        if 'model' in d:
            if d['model'] not in dict(ChatbotSettings.MODELS):
                errors.append('Choose one of the listed models.')
            else:
                cfg.model = d['model']
        for field, low, high in (('per_hour', 1, 500), ('per_conversation', 2, 500)):
            if field in d:
                try:
                    value = int(d[field])
                    if not low <= value <= high:
                        raise ValueError
                    setattr(cfg, field, value)
                except (TypeError, ValueError):
                    errors.append(f'{"Messages per hour" if field == "per_hour" else "Messages per conversation"} must be between {low} and {high}.')
        if errors:
            return Response({'detail': errors[0], 'errors': errors}, status=status.HTTP_400_BAD_REQUEST)
        cfg.save()
        return Response(settings_data(cfg))


def session_row(s):
    return {'id': str(s.pk), 'started_at': s.started_at, 'last_at': s.last_at, 'messages': s.message_count, 'handoff': s.handoff,
            'rating': s.rating, 'page': s.page, 'first': getattr(s, 'first_question', '') or '',
            'user': {'id': s.user_id, 'name': s.user.get_full_name(), 'email': s.user.email} if s.user_id else None}


class ManageConversationsView(APIView):
    permission_classes = [IsAdmin]

    def get(self, request):
        sessions = ChatSession.objects.select_related('user').filter(message_count__gt=0)
        q = str(request.query_params.get('q', '')).strip()
        if q:
            sessions = sessions.filter(messages__content__icontains=q).distinct()
        if request.query_params.get('handoff') == '1':
            sessions = sessions.filter(handoff=True)
        rows = list(sessions[:200])
        firsts = {}
        for m in ChatMessage.objects.filter(session__in=rows, role=ChatMessage.USER).order_by('created_at', 'id').values('session_id', 'content'):
            firsts.setdefault(m['session_id'], m['content'])
        for s in rows:
            s.first_question = firsts.get(s.pk, '')[:160]
        since = timezone.now() - timedelta(days=30)
        recent = ChatSession.objects.filter(started_at__gte=since, message_count__gt=0)
        figures = recent.aggregate(conversations=Count('id'), handoffs=Count('id', filter=Q(handoff=True)),
                                   helpful=Count('id', filter=Q(rating=1)), unhelpful=Count('id', filter=Q(rating=-1)))
        usage = ChatMessage.objects.filter(created_at__gte=since).aggregate(
            questions=Count('id', filter=Q(role=ChatMessage.USER)), failed=Count('id', filter=Q(failed=True)),
            tokens_in=Sum('input_tokens'), tokens_out=Sum('output_tokens'))
        return Response({'results': [session_row(s) for s in rows], 'figures': {**figures, **{k: v or 0 for k, v in usage.items()}}})


class ManageConversationView(APIView):
    permission_classes = [IsAdmin]

    def get(self, request, pk):
        s = get_object_or_404(ChatSession.objects.select_related('user'), pk=pk)
        return Response({**session_row(s), 'transcript': [{'role': m.role, 'content': m.content, 'failed': m.failed, 'at': m.created_at}
                                                           for m in s.messages.all()]})

    def delete(self, request, pk):
        get_object_or_404(ChatSession, pk=pk).delete()
        return Response(status=status.HTTP_204_NO_CONTENT)


class ManageKnowledgeView(APIView):
    permission_classes = [IsAdmin]

    def get(self, request):
        cfg = ChatbotSettings.load()
        text = knowledge.build(cfg.knowledge)
        return Response({'text': text, 'characters': len(text)})


class ManageTestView(APIView):
    permission_classes = [IsAdmin]

    def post(self, request):
        cfg = ChatbotSettings.load()
        message = str(request.data.get('message') or '').strip()[:MAX_MESSAGE]
        if not message:
            return Response({'detail': 'Type a question.'}, status=status.HTTP_400_BAD_REQUEST)
        hit = faqs.match(message, cfg.faqs or [])
        if hit:
            return Response({'reply': faqs.render(hit['answer']), 'handoff': bool(hit.get('handoff')), 'faq': hit['question']})
        if not ai.configured():
            reply, handoff = built_in(message, request.user)
            return Response({'reply': reply or FALLBACK, 'handoff': handoff, 'built_in': True})
        rules, facts = knowledge.system_prompt(cfg, request.user)
        try:
            reply, handoff, tokens_in, tokens_out = ai.ask(cfg.model, rules, knowledge.build(cfg.knowledge), [{'role': 'user', 'content': message}])
        except ai.AssistantUnavailable as exc:
            return Response({'detail': f'The AI service didn’t answer ({exc}). Check the API key and your account’s credit.'},
                            status=status.HTTP_502_BAD_GATEWAY)
        return Response({'reply': reply, 'handoff': handoff, 'tokens': {'in': tokens_in, 'out': tokens_out}})
