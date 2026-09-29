"""
Messages between people and the ADRAM team. Each person has one conversation; every administrator
sees all of them and can reply. Unread counts feed the message icon in the portal's top bar.

  GET/POST /portal/me/messages/                   the signed-in person's conversation (GET marks replies read)
  GET      /portal/messages/unread/               unread count + a short preview, for the top-bar icon
  GET      /portal/staff/conversations/           every conversation (?search=, ?unread=1)
  GET/POST /portal/staff/conversations/<user_id>/ one person's conversation (GET marks their messages read)
  DELETE   /portal/staff/conversations/<user_id>/ delete the whole conversation, files included
  DELETE   /portal/staff/conversations/<user_id>/messages/<id>/  delete one message
"""
import os

from django.contrib.auth import get_user_model
from django.db import transaction
from django.db.models import Count, Max, Q
from django.shortcuts import get_object_or_404
from django.utils import timezone
from rest_framework import serializers, status
from rest_framework.parsers import FormParser, JSONParser, MultiPartParser
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView

from accounts.models import User as UserModel
from accounts.permissions import IsAdmin
from . import emails
from .models import Call, Conversation, Message
from .views import discard

User = get_user_model()


def is_staff_user(user):
    return user.role == UserModel.ADMIN


def person(user):
    return {
        'id': user.pk,
        'full_name': user.get_full_name(),
        'first_name': user.first_name,
        'last_name': user.last_name,
        'email': user.email,
        'role': user.role,
        'role_display': user.get_role_display(),
        'profile_picture': user.profile_picture.url if user.profile_picture else None,
    }


def message_data(message, viewer):
    attachment = None
    if message.attachment:
        attachment = {
            'id': message.id,           # opened through /portal/files/messages/<id>/
            'name': message.attachment_name,
            'kind': message.attachment_kind,
            'size': message.attachment_size,
            'duration': message.duration,
        }
    call = None
    if message.call_id:
        c = message.call
        call = {'kind': c.kind, 'status': c.status, 'duration': c.duration, 'summary': message.preview}
    return {
        'id': message.id,
        'body': message.body,
        'attachment': attachment,
        'call': call,
        'from_staff': message.from_staff,
        'mine': message.sender_id == viewer.pk,
        'sender_name': message.sender.get_full_name() if message.sender else ('ADRAM team' if message.from_staff else ''),
        'created_at': message.created_at,
        'read_at': message.read_at,
    }


# What can be sent in a chat: documents, photos and voice messages, 10 MB at most.
MAX_ATTACHMENT_MB = 10
MAX_VOICE_SECONDS = 300
DOCUMENT_TYPES = {'.pdf', '.doc', '.docx', '.xls', '.xlsx', '.ppt', '.pptx', '.txt', '.csv', '.zip', '.rtf', '.odt'}
IMAGE_TYPES = {'.jpg', '.jpeg', '.png', '.webp', '.gif', '.heic'}
AUDIO_TYPES = {'.mp3', '.m4a', '.wav', '.ogg', '.oga', '.aac', '.opus'}
RECORDING_TYPES = AUDIO_TYPES | {'.webm', '.mp4'}   # what browsers record voice messages as


class MessageInput(serializers.Serializer):
    body = serializers.CharField(max_length=Message.MAX_LENGTH, trim_whitespace=True, required=False, allow_blank=True, default='')
    file = serializers.FileField(required=False, allow_empty_file=False)
    voice = serializers.BooleanField(required=False, default=False)   # the file is a recorded voice message
    duration = serializers.IntegerField(required=False, min_value=0, max_value=MAX_VOICE_SECONDS + 5)

    def validate(self, data):
        file = data.get('file')
        if not data['body'] and not file:
            raise serializers.ValidationError({'body': 'Write a message or attach a file.'})
        if file:
            ext = os.path.splitext(file.name)[1].lower()
            if file.size > MAX_ATTACHMENT_MB * 1024 * 1024:
                raise serializers.ValidationError({'file': f'Files can be up to {MAX_ATTACHMENT_MB} MB.'})
            if data['voice']:
                if ext not in RECORDING_TYPES:
                    raise serializers.ValidationError({'file': 'That voice recording format isn’t supported.'})
                data['kind'] = Message.AUDIO
            elif ext in IMAGE_TYPES:
                data['kind'] = Message.IMAGE
            elif ext in AUDIO_TYPES:
                data['kind'] = Message.AUDIO
            elif ext in DOCUMENT_TYPES:
                data['kind'] = Message.FILE
            else:
                raise serializers.ValidationError(
                    {'file': 'Send a PDF, Word, Excel or PowerPoint file, a photo, a text/CSV/ZIP file or an audio clip.'})
        return data


def post_message(conversation, sender, data, from_staff):
    """Save a message (text and/or one attachment); email the other side after the transaction commits."""
    file = data.get('file')
    with transaction.atomic():
        # Tell the team only when this starts a new unread run, so a burst of messages sends one email.
        first_unread = not from_staff and not conversation.messages.filter(from_staff=False, read_at__isnull=True).exists()
        message = Message(conversation=conversation, sender=sender, body=data['body'], from_staff=from_staff)
        if file:
            name = os.path.basename(file.name)[:200]
            if data['voice']:
                name = f'Voice message{os.path.splitext(file.name)[1].lower()}'
            message.attachment = file
            message.attachment_name = name
            message.attachment_kind = data['kind']
            message.attachment_size = file.size
            if data['kind'] == Message.AUDIO and data.get('duration') is not None:
                message.duration = min(data['duration'], MAX_VOICE_SECONDS)
        message.save()
        conversation.last_message_at = message.created_at
        conversation.save(update_fields=['last_message_at'])
        if from_staff:
            transaction.on_commit(lambda: emails.send_new_message(message))
        elif first_unread:
            transaction.on_commit(lambda: emails.notify_team_message(message))
    return message


def mark_read(conversation, from_staff):
    """Mark the other side's messages as read; returns how many were newly read."""
    return conversation.messages.filter(from_staff=from_staff, read_at__isnull=True).update(read_at=timezone.now())


# ---------------------------------------------------------------- The signed-in person

class MyMessagesView(APIView):
    permission_classes = [IsAuthenticated]
    parser_classes = [JSONParser, MultiPartParser, FormParser]

    def get(self, request):
        conversation = Conversation.objects.filter(user=request.user).first()
        if not conversation:
            return Response({'messages': []})
        mark_read(conversation, from_staff=True)
        messages = conversation.messages.select_related('sender', 'call')
        return Response({'messages': [message_data(m, request.user) for m in messages]})

    def post(self, request):
        if is_staff_user(request.user):
            return Response({'detail': 'Administrators reply from the Messages inbox.'}, status=status.HTTP_400_BAD_REQUEST)
        data = MessageInput(data=request.data)
        data.is_valid(raise_exception=True)
        conversation, _ = Conversation.objects.get_or_create(user=request.user)
        message = post_message(conversation, request.user, data.validated_data, from_staff=False)
        return Response(message_data(message, request.user), status=status.HTTP_201_CREATED)


class UnreadMessagesView(APIView):
    """Unread count and a preview for the top-bar icon (role-aware)."""
    permission_classes = [IsAuthenticated]

    def get(self, request):
        user = request.user
        if is_staff_user(user):
            unread = Message.objects.filter(from_staff=False, read_at__isnull=True)
            conversations = (Conversation.objects.filter(last_message_at__isnull=False).select_related('user')
                             .annotate(unread=Count('messages', filter=Q(messages__from_staff=False, messages__read_at__isnull=True)))
                             .order_by('-unread', '-last_message_at')[:5])
            recent = []
            for c in conversations:
                last = c.messages.order_by('-created_at').first()
                recent.append({'user': person(c.user), 'unread': c.unread, 'body': last.preview[:140] if last else '',
                               'from_staff': last.from_staff if last else False, 'at': c.last_message_at})
            return Response({'unread': unread.count(), 'conversations': unread.values('conversation').distinct().count(),
                             'recent': recent})

        unread = Message.objects.filter(conversation__user=user, from_staff=True, read_at__isnull=True).select_related('sender', 'call')
        recent = [{'body': m.preview[:140], 'sender_name': m.sender.get_full_name() if m.sender else 'ADRAM team', 'at': m.created_at}
                  for m in unread.order_by('-created_at')[:3]]
        return Response({'unread': unread.count(), 'recent': recent})


# ---------------------------------------------------------------- Administrators

class StaffConversationsView(APIView):
    permission_classes = [IsAdmin]

    def get(self, request):
        conversations = (Conversation.objects.filter(last_message_at__isnull=False).select_related('user')
                         .annotate(unread=Count('messages', filter=Q(messages__from_staff=False, messages__read_at__isnull=True)),
                                   total=Count('messages'))
                         .order_by('-last_message_at'))
        search = request.query_params.get('search', '').strip()
        if search:
            conversations = conversations.filter(Q(user__first_name__icontains=search) | Q(user__last_name__icontains=search)
                                                 | Q(user__email__icontains=search) | Q(messages__body__icontains=search)).distinct()
        if request.query_params.get('unread') == '1':
            conversations = conversations.filter(unread__gt=0)
        conversations = list(conversations[:100])

        # The last message of each conversation, in one query.
        last_ids = (Message.objects.filter(conversation__in=conversations).values('conversation')
                    .annotate(last=Max('id')).values_list('last', flat=True))
        last = {m.conversation_id: m for m in Message.objects.filter(id__in=list(last_ids))}
        return Response([{
            'user': person(c.user),
            'unread': c.unread,
            'total': c.total,
            'last_message_at': c.last_message_at,
            'last': {'body': last[c.id].preview[:160], 'from_staff': last[c.id].from_staff,
                     'kind': last[c.id].attachment_kind} if c.id in last else None,
        } for c in conversations])


class StaffConversationView(APIView):
    permission_classes = [IsAdmin]
    parser_classes = [JSONParser, MultiPartParser, FormParser]

    def get(self, request, user_id):
        user = get_object_or_404(User, pk=user_id)
        conversation = Conversation.objects.filter(user=user).first()
        messages = []
        if conversation:
            mark_read(conversation, from_staff=False)
            messages = [message_data(m, request.user) for m in conversation.messages.select_related('sender', 'call')]
        return Response({'user': person(user), 'messages': messages})

    def post(self, request, user_id):
        user = get_object_or_404(User, pk=user_id)
        if is_staff_user(user):
            return Response({'detail': 'Messages are between people and the ADRAM team, not between administrators.'},
                            status=status.HTTP_400_BAD_REQUEST)
        data = MessageInput(data=request.data)
        data.is_valid(raise_exception=True)
        conversation, _ = Conversation.objects.get_or_create(user=user)
        mark_read(conversation, from_staff=False)  # replying means the admin has seen what came before
        message = post_message(conversation, request.user, data.validated_data, from_staff=True)
        return Response(message_data(message, request.user), status=status.HTTP_201_CREATED)

    def delete(self, request, user_id):
        conversation = get_object_or_404(Conversation, user_id=user_id)
        if conversation.calls.filter(status__in=Call.OPEN).exists():
            return Response({'detail': 'End the call before deleting this conversation.'}, status=status.HTTP_400_BAD_REQUEST)
        for message in conversation.messages.exclude(attachment=''):
            discard(message.attachment)
        conversation.delete()   # messages and the call history go with it
        return Response(status=status.HTTP_204_NO_CONTENT)


class StaffMessageView(APIView):
    """An administrator deletes one message (either side's) from a conversation."""
    permission_classes = [IsAdmin]

    def delete(self, request, user_id, message_id):
        message = get_object_or_404(Message, pk=message_id, conversation__user_id=user_id)
        conversation = message.conversation
        discard(message.attachment)
        message.delete()
        # The inbox is ordered by the newest message left; an emptied conversation drops out of it.
        latest = conversation.messages.order_by('-created_at').first()
        conversation.last_message_at = latest.created_at if latest else None
        conversation.save(update_fields=['last_message_at'])
        return Response(status=status.HTTP_204_NO_CONTENT)


# ---------------------------------------------------------------- Statistics for the Messages page

def response_times(messages):
    """
    Minutes from a person's message to the team's next reply, one value per reply
    (a run of several messages from the person counts from the first of them).
    `messages` must be ordered by conversation, then time.
    """
    times, waiting_since, current = [], None, None
    for m in messages:
        if m.conversation_id != current:
            current, waiting_since = m.conversation_id, None
        if m.call_id:
            continue
        if not m.from_staff:
            waiting_since = waiting_since or m.created_at
        elif waiting_since:
            times.append((m.created_at - waiting_since).total_seconds() / 60)
            waiting_since = None
    return times


def median(values):
    if not values:
        return None
    values = sorted(values)
    mid = len(values) // 2
    return round(values[mid] if len(values) % 2 else (values[mid - 1] + values[mid]) / 2, 1)


class MessageStatsView(APIView):
    """
    GET /portal/messages/stats/ -> figures for the Messages page. Administrators get the whole inbox;
    everyone else gets their own conversation with the team. Covers the last 30 days unless noted.
    """
    permission_classes = [IsAuthenticated]
    DAYS = 14

    def get(self, request):
        from datetime import datetime, time, timedelta
        from django.db.models.functions import TruncDate
        from .models import Call

        user, now, today = request.user, timezone.now(), timezone.localdate()
        staff = is_staff_user(user)
        month_ago = now - timedelta(days=30)
        messages = Message.objects.all() if staff else Message.objects.filter(conversation__user=user)
        calls = Call.objects.all() if staff else Call.objects.filter(conversation__user=user)

        # Messages per day for the last two weeks, from each side (call log entries aren't messages).
        start = today - timedelta(days=self.DAYS - 1)
        since = timezone.make_aware(datetime.combine(start, time.min))
        per_day = {}
        for row in (messages.filter(created_at__gte=since, call__isnull=True).annotate(day=TruncDate('created_at'))
                    .values('day', 'from_staff').annotate(n=Count('id'))):
            per_day[(row['day'], row['from_staff'])] = row['n']
        series = [{'date': (start + timedelta(days=i)).isoformat(),
                   'people': per_day.get((start + timedelta(days=i), False), 0),
                   'team': per_day.get((start + timedelta(days=i), True), 0)} for i in range(self.DAYS)]

        recent = messages.filter(created_at__gte=month_ago).select_related(None).only('conversation_id', 'from_staff', 'created_at', 'call_id')
        replies = response_times(recent.order_by('conversation_id', 'created_at'))

        month_calls = calls.filter(created_at__gte=month_ago)
        call_counts = dict(month_calls.values_list('status').annotate(n=Count('id')))
        talk_seconds = sum(c.duration or 0 for c in month_calls.filter(status=Call.ENDED).only('answered_at', 'ended_at'))
        attachments = dict(messages.exclude(attachment='').values_list('attachment_kind').annotate(n=Count('id')))

        data = {
            'series': series,
            'median_reply_minutes': median(replies),
            'replies_counted': len(replies),
            'replied_within_hour': round(sum(1 for t in replies if t <= 60) / len(replies) * 100) if replies else None,
            'calls': {
                'answered': call_counts.get(Call.ENDED, 0),
                'missed': call_counts.get(Call.MISSED, 0) + call_counts.get(Call.CANCELLED, 0),
                'declined': call_counts.get(Call.DECLINED, 0),
                'talk_minutes': round(talk_seconds / 60),
                'video': month_calls.filter(kind=Call.VIDEO).count(),
            },
            'attachments': {'files': attachments.get(Message.FILE, 0), 'images': attachments.get(Message.IMAGE, 0),
                            'voice': attachments.get(Message.AUDIO, 0)},
        }
        text = messages.filter(call__isnull=True)
        if staff:
            conversations = Conversation.objects.filter(last_message_at__isnull=False)
            last_from = {}
            for conv_id, from_staff in (Message.objects.filter(call__isnull=True).order_by('conversation_id', '-created_at')
                                        .values_list('conversation_id', 'from_staff')):
                last_from.setdefault(conv_id, from_staff)
            data.update({
                'conversations': conversations.count(),
                'active_7': conversations.filter(last_message_at__gte=now - timedelta(days=7)).count(),
                'awaiting_reply': sum(1 for from_staff in last_from.values() if not from_staff),
                'unread': Message.objects.filter(from_staff=False, read_at__isnull=True).count(),
                'received_30': text.filter(from_staff=False, created_at__gte=month_ago).count(),
                'sent_30': text.filter(from_staff=True, created_at__gte=month_ago).count(),
            })
        else:
            data.update({
                'sent': text.filter(from_staff=False).count(),
                'received': text.filter(from_staff=True).count(),
                'unread': messages.filter(from_staff=True, read_at__isnull=True).count(),
                'awaiting_reply': bool(text.exists() and not text.order_by('-created_at').first().from_staff),
            })
        return Response(data)
