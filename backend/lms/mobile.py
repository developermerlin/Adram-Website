"""
What the mobile apps need: push notifications, app configuration, and lessons saved for offline learning.

Push: the app registers its push token; every in-app notification (lms.notify) is also pushed to the person's phones.
Tokens from Expo (React Native) are sent through Expo's push service, which needs no keys. Firebase tokens are stored
for when Firebase credentials are configured. Sending happens in the background so pages never wait for it.

Offline: an enrolled student can keep uploaded videos and documents on up to LmsSettings.offline_devices devices. Each
saved lesson has a licence that lasts offline_days; the app checks in to renew them, and is told to delete lessons the
student can no longer open (refund, Premium ended, an overdue instalment…).

  GET  /lms/app/config/                      minimum app version, features switched on, offline rules (no sign-in)
  POST /lms/me/devices/  DELETE (same)       {token, kind: expo|fcm, platform, app_version} register / forget a phone
  POST /lms/lessons/<id>/offline/            {device_id}  a licence and the file links to save the lesson
  GET  /lms/me/offline/?device_id=           the lessons saved on this device
  POST /lms/me/offline/check-in/             {device_id}  renew what is still allowed; lists what to delete
  DELETE /lms/me/offline/<id>/               the student removed a saved lesson
"""
import json
import logging
import threading
import urllib.request
from datetime import timedelta

from django.conf import settings
from django.db import close_old_connections
from django.shortcuts import get_object_or_404
from django.utils import timezone
from rest_framework import status
from rest_framework.permissions import AllowAny, IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView

from . import access
from .models import Lesson, LmsSettings, OfflineLicence, PushDevice

logger = logging.getLogger(__name__)
EXPO_URL = 'https://exp.host/--/api/v2/push/send'


# ---------------------------------------------------------------- push

def _post_expo(messages):
    """Sends up to 100 messages to Expo; returns the tickets (or [] on failure)."""
    request = urllib.request.Request(EXPO_URL, data=json.dumps(messages).encode(), method='POST',
                                     headers={'Content-Type': 'application/json', 'Accept': 'application/json'})
    with urllib.request.urlopen(request, timeout=10) as response:  # noqa: S310 (a fixed https URL)
        return json.loads(response.read().decode()).get('data', [])


def deliver(tokens, title, body, link):
    """Pushes one message to Expo tokens, and forgets tokens Expo says are no longer registered."""
    for start in range(0, len(tokens), 100):
        batch = tokens[start:start + 100]
        messages = [{'to': t, 'title': title[:100], 'body': (body or '')[:240], 'sound': 'default', 'data': {'link': link}} for t in batch]
        try:
            tickets = _post_expo(messages)
        except Exception:
            logger.warning('Push to %s devices failed', len(batch), exc_info=True)
            continue
        gone = [t for t, ticket in zip(batch, tickets)
                if ticket.get('status') == 'error' and (ticket.get('details') or {}).get('error') == 'DeviceNotRegistered']
        if gone:
            PushDevice.objects.filter(token__in=gone).delete()


def push(user_ids, title, body='', link=''):
    """Pushes a notification to the users' phones, in the background. Never raises."""
    try:
        if not user_ids or not LmsSettings.load().push_enabled:
            return
        tokens = list(PushDevice.objects.filter(user_id__in=user_ids, kind=PushDevice.EXPO).values_list('token', flat=True))
        if not tokens:
            return
        if getattr(settings, 'PUSH_SYNC', False):  # tests
            deliver(tokens, title, body, link)
            return

        def run():
            try:
                deliver(tokens, title, body, link)
            finally:
                close_old_connections()
        threading.Thread(target=run, daemon=True).start()
    except Exception:
        logger.exception('Could not push "%s"', title)


class DevicesView(APIView):
    permission_classes = [IsAuthenticated]

    def post(self, request):
        token = str(request.data.get('token', '')).strip()[:300]
        kind = request.data.get('kind') or PushDevice.EXPO
        if not token or kind not in (PushDevice.EXPO, PushDevice.FCM):
            return Response({'token': 'Send the push token and its kind (expo or fcm).'}, status=status.HTTP_400_BAD_REQUEST)
        device, _ = PushDevice.objects.update_or_create(token=token, defaults={  # a phone that changed hands moves to its new owner
            'user': request.user, 'kind': kind, 'platform': str(request.data.get('platform', ''))[:10],
            'app_version': str(request.data.get('app_version', ''))[:20]})
        return Response({'id': device.id, 'registered': True}, status=status.HTTP_201_CREATED)

    def delete(self, request):
        PushDevice.objects.filter(user=request.user, token=str(request.data.get('token', '')).strip()).delete()
        return Response(status=status.HTTP_204_NO_CONTENT)


# ---------------------------------------------------------------- app configuration

class AppConfigView(APIView):
    permission_classes = [AllowAny]
    authentication_classes = []

    def get(self, request):
        s = LmsSettings.load()
        return Response({
            'api_version': 'v1', 'min_app_version': s.app_min_version or None,
            'features': {'premium': s.premium_enabled, 'instalments': s.instalments_enabled, 'referrals': s.referrals_enabled,
                         'affiliates': s.affiliates_enabled, 'push': s.push_enabled, 'offline': True},
            'offline': {'days': s.offline_days, 'devices': s.offline_devices},
            'currency': 'NLe', 'site': settings.FRONTEND_URL,
        })


# ---------------------------------------------------------------- offline lessons

def offline_files(lesson, user_id):
    """The files a lesson can be saved with (YouTube and Vimeo videos can't be saved)."""
    from .views import media_link
    files = []
    if lesson.kind == Lesson.VIDEO and lesson.video_source == Lesson.UPLOAD and lesson.video_file:
        files.append({'kind': 'video', 'name': lesson.video_name or 'video.mp4', 'url': media_link('video', lesson.id, user_id)})
    if lesson.kind == Lesson.DOCUMENT and lesson.document_file:
        files.append({'kind': 'document', 'name': lesson.document_name or 'document', 'url': media_link('document', lesson.id, user_id) + '&download=1'})
    for r in lesson.resources.all():
        files.append({'kind': 'resource', 'name': r.filename or r.title, 'url': media_link('resource', r.id, user_id)})
    return files


def licence_data(licence, files=None):
    data = {'id': licence.id, 'lesson': {'id': licence.lesson_id, 'title': licence.lesson.title, 'course_slug': licence.lesson.section.course.slug},
            'device_id': licence.device_id, 'issued_at': licence.issued_at, 'expires_at': licence.expires_at}
    if files is not None:
        data['files'] = files
    return data


def _device_id(request):
    return str(request.data.get('device_id') or request.query_params.get('device_id') or '').strip()[:100]


class OfflineLessonView(APIView):
    permission_classes = [IsAuthenticated]

    def post(self, request, pk):
        lesson = get_object_or_404(Lesson.objects.select_related('section__course'), pk=pk)
        device = _device_id(request)
        if not device:
            return Response({'device_id': 'Send this device’s id.'}, status=status.HTTP_400_BAD_REQUEST)
        enrollment = access.enrollment_for(request.user, lesson.section.course)
        if not enrollment or not access.can_open(request.user, lesson, enrollment):
            return Response({'detail': 'Enrol on this course to save its lessons.'}, status=status.HTTP_403_FORBIDDEN)
        files = offline_files(lesson, request.user.id)
        if not files:
            return Response({'detail': 'This lesson can’t be saved for offline use (online videos have to be streamed).', 'code': 'not_saveable'},
                            status=status.HTTP_400_BAD_REQUEST)
        s = LmsSettings.load()
        now = timezone.now()
        live = OfflineLicence.objects.filter(user=request.user, revoked_at__isnull=True, expires_at__gt=now)
        devices = set(live.values_list('device_id', flat=True))
        if device not in devices and len(devices) >= s.offline_devices:
            return Response({'detail': f'You can keep saved lessons on {s.offline_devices} devices. Remove them from another device first.',
                             'code': 'device_limit', 'devices': sorted(devices)}, status=status.HTTP_400_BAD_REQUEST)
        licence, _ = OfflineLicence.objects.update_or_create(user=request.user, lesson=lesson, device_id=device,
                                                             defaults={'expires_at': now + timedelta(days=s.offline_days), 'revoked_at': None})
        return Response(licence_data(licence, files), status=status.HTTP_201_CREATED)


class MyOfflineView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request):
        rows = OfflineLicence.objects.filter(user=request.user, revoked_at__isnull=True).select_related('lesson__section__course')
        if _device_id(request):
            rows = rows.filter(device_id=_device_id(request))
        return Response([licence_data(r) for r in rows])


class OfflineCheckInView(APIView):
    """The app came online: renew the lessons still allowed, and say which to delete."""
    permission_classes = [IsAuthenticated]

    def post(self, request):
        device = _device_id(request)
        s = LmsSettings.load()
        now = timezone.now()
        keep, remove = [], []
        for licence in OfflineLicence.objects.filter(user=request.user, device_id=device, revoked_at__isnull=True).select_related('lesson__section__course'):
            lesson = licence.lesson
            enrollment = access.enrollment_for(request.user, lesson.section.course)
            if enrollment and access.can_open(request.user, lesson, enrollment):
                licence.expires_at = now + timedelta(days=s.offline_days)
                licence.save(update_fields=['expires_at'])
                keep.append(licence_data(licence))
            else:
                licence.revoked_at = now
                licence.save(update_fields=['revoked_at'])
                remove.append(lesson.id)
        return Response({'keep': keep, 'remove_lessons': remove, 'checked_at': now})


class OfflineLicenceView(APIView):
    permission_classes = [IsAuthenticated]

    def delete(self, request, pk):
        OfflineLicence.objects.filter(pk=pk, user=request.user).update(revoked_at=timezone.now())
        return Response(status=status.HTTP_204_NO_CONTENT)
