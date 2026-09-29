"""
Voice and video calls between a person and the ADRAM team (WebRTC). The audio and video travel directly
between the two browsers; the server only relays the connection details and the call's status, which
both sides check every couple of seconds (no WebSocket server needed).

  GET  /portal/calls/config/            ICE servers for the browser's RTCPeerConnection
  POST /portal/calls/                   start {kind, offer, user?}  (admins pass the person to call)
  GET  /portal/calls/incoming/          calls ringing for me
  GET  /portal/calls/<id>/              status (and the answer, once there is one)
  POST /portal/calls/<id>/answer/       {answer}
  POST /portal/calls/<id>/decline/
  POST /portal/calls/<id>/end/          hang up (or cancel while it's still ringing)

A person's call rings every administrator; the first to answer takes it. Each finished call is logged in
the conversation as a message ("Missed video call", "Voice call (2:31)"), so it shows in the chat and
missed calls count as unread.
"""
from datetime import timedelta

from django.conf import settings
from django.contrib.auth import get_user_model
from django.db import transaction
from django.http import Http404
from django.shortcuts import get_object_or_404
from django.utils import timezone
from rest_framework import serializers, status
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView

from .messaging import is_staff_user, person
from .models import Call, Conversation, Message

User = get_user_model()
MAX_SDP = 20000


def log_call(call):
    """Record a finished call in the chat. Missed calls stay unread for the person who didn't pick up."""
    if Message.objects.filter(call=call).exists():
        return
    seen = call.status in (Call.ENDED, Call.DECLINED)
    message = Message.objects.create(conversation=call.conversation, sender=call.caller, from_staff=call.from_staff,
                                     call=call, read_at=timezone.now() if seen else None)
    Conversation.objects.filter(pk=call.conversation_id).update(last_message_at=message.created_at)


def finish(call, new_status):
    """Move a call to a final status (once) and log it."""
    with transaction.atomic():
        call = Call.objects.select_for_update().get(pk=call.pk)
        if call.status not in Call.OPEN:
            return call
        call.status = new_status
        call.ended_at = timezone.now()
        call.save(update_fields=['status', 'ended_at'])
        log_call(call)
    return call


def expire_stale(queryset=None):
    """Ringing too long without an answer becomes a missed call."""
    cutoff = timezone.now() - timedelta(seconds=Call.RING_SECONDS)
    for call in (queryset or Call.objects).filter(status=Call.RINGING, created_at__lt=cutoff):
        finish(call, Call.MISSED)


def can_see(user, call):
    return is_staff_user(user) or call.conversation.user_id == user.pk


def on_answering_side(user, call):
    """The side being called: admins for a person's call, the person for an admin's call."""
    return is_staff_user(user) != call.from_staff and (is_staff_user(user) or call.conversation.user_id == user.pk)


def call_data(call, viewer):
    # The administrator on the call: whoever placed it, or whoever answered the person's call.
    staff_member = call.caller if call.from_staff else call.answered_by
    return {
        'id': call.id,
        'kind': call.kind,
        'status': call.status,
        'from_staff': call.from_staff,
        'outgoing': call.caller_id == viewer.pk,
        'user': person(call.conversation.user),                # the person (not the ADRAM side)
        'staff_name': staff_member.get_full_name() if staff_member else 'ADRAM team',
        'answer': call.answer if call.caller_id == viewer.pk else '',
        'created_at': call.created_at,
        'answered_at': call.answered_at,
        'duration': call.duration,
        'ring_seconds': Call.RING_SECONDS,
    }


class StartCallInput(serializers.Serializer):
    kind = serializers.ChoiceField(choices=[Call.AUDIO, Call.VIDEO])
    offer = serializers.CharField(max_length=MAX_SDP)
    user = serializers.IntegerField(required=False)


class CallConfigView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request):
        return Response({'ice_servers': settings.WEBRTC_ICE_SERVERS, 'ring_seconds': Call.RING_SECONDS})


class CallsView(APIView):
    permission_classes = [IsAuthenticated]

    def post(self, request):
        data = StartCallInput(data=request.data)
        data.is_valid(raise_exception=True)
        staff = is_staff_user(request.user)
        if staff:
            if not data.validated_data.get('user'):
                return Response({'detail': 'Choose who to call.'}, status=status.HTTP_400_BAD_REQUEST)
            person_user = get_object_or_404(User, pk=data.validated_data['user'])
            if is_staff_user(person_user):
                return Response({'detail': 'Calls are between people and the ADRAM team.'}, status=status.HTTP_400_BAD_REQUEST)
        else:
            person_user = request.user
        conversation, _ = Conversation.objects.get_or_create(user=person_user)

        expire_stale(conversation.calls)
        if conversation.calls.filter(status__in=Call.OPEN).exists():
            return Response({'detail': 'There’s already a call in progress in this conversation.'}, status=status.HTTP_409_CONFLICT)
        call = Call.objects.create(conversation=conversation, caller=request.user, from_staff=staff,
                                   kind=data.validated_data['kind'], offer=data.validated_data['offer'])
        return Response(call_data(call, request.user), status=status.HTTP_201_CREATED)


class IncomingCallsView(APIView):
    """Calls ringing for me, with the caller's offer so I can answer."""
    permission_classes = [IsAuthenticated]

    def get(self, request):
        expire_stale()
        ringing = Call.objects.filter(status=Call.RINGING).select_related('conversation__user', 'caller')
        if is_staff_user(request.user):
            ringing = ringing.filter(from_staff=False)
        else:
            ringing = ringing.filter(from_staff=True, conversation__user=request.user)
        return Response([{**call_data(c, request.user), 'offer': c.offer,
                          'caller_name': c.caller.get_full_name() if c.caller else '',
                          'caller_picture': c.caller.profile_picture.url if c.caller and c.caller.profile_picture else None}
                         for c in ringing[:3]])


def get_call(request, pk):
    call = get_object_or_404(Call.objects.select_related('conversation__user', 'caller', 'answered_by'), pk=pk)
    if not can_see(request.user, call):
        raise Http404  # don't reveal that the call exists
    return call


class CallDetailView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request, pk):
        call = get_call(request, pk)
        expire_stale(Call.objects.filter(pk=call.pk))
        call.refresh_from_db()
        return Response(call_data(call, request.user))


class AnswerCallView(APIView):
    permission_classes = [IsAuthenticated]

    def post(self, request, pk):
        call = get_call(request, pk)
        answer = str(request.data.get('answer', ''))
        if not answer or len(answer) > MAX_SDP:
            return Response({'detail': 'Missing connection details.'}, status=status.HTTP_400_BAD_REQUEST)
        if not on_answering_side(request.user, call):
            return Response({'detail': 'You can’t answer this call.'}, status=status.HTTP_403_FORBIDDEN)
        with transaction.atomic():
            call = Call.objects.select_for_update().get(pk=call.pk)
            if call.status != Call.RINGING:
                taken = call.status == Call.ACCEPTED
                return Response({'detail': 'Another administrator has answered this call.' if taken else 'This call has ended.'},
                                status=status.HTTP_409_CONFLICT)
            call.status, call.answer = Call.ACCEPTED, answer
            call.answered_by, call.answered_at = request.user, timezone.now()
            call.save(update_fields=['status', 'answer', 'answered_by', 'answered_at'])
        return Response(call_data(call, request.user))


class DeclineCallView(APIView):
    permission_classes = [IsAuthenticated]

    def post(self, request, pk):
        call = get_call(request, pk)
        if not on_answering_side(request.user, call):
            return Response({'detail': 'You can’t decline this call.'}, status=status.HTTP_403_FORBIDDEN)
        if call.status == Call.RINGING:
            call = finish(call, Call.DECLINED)
        return Response(call_data(call, request.user))


class EndCallView(APIView):
    permission_classes = [IsAuthenticated]

    def post(self, request, pk):
        call = get_call(request, pk)
        if call.status == Call.RINGING:
            # The caller gave up before anyone answered: a missed call for the other side.
            if call.caller_id != request.user.pk:
                return Response({'detail': 'Decline the call instead.'}, status=status.HTTP_400_BAD_REQUEST)
            call = finish(call, Call.CANCELLED)
        elif call.status == Call.ACCEPTED:
            if request.user.pk not in (call.caller_id, call.answered_by_id):
                return Response({'detail': 'You’re not on this call.'}, status=status.HTTP_403_FORBIDDEN)
            call = finish(call, Call.ENDED)
        return Response(call_data(call, request.user))
