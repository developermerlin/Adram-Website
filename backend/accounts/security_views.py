"""
Two-step sign-in (authenticator app + recovery codes) and signed-in devices, for every account.

  GET    /auth/2fa/                    status
  POST   /auth/2fa/setup/              start (or restart) setting up: secret, otpauth link, QR code
  POST   /auth/2fa/confirm/  {code}    switch it on with a first code; returns the recovery codes (shown once)
  POST   /auth/2fa/disable/  {password, code}
  POST   /auth/2fa/recovery-codes/ {code}   new recovery codes
  GET    /auth/sessions/               signed-in devices
  DELETE /auth/sessions/<id>/          sign one out
  POST   /auth/sessions/revoke-others/ sign out everywhere else
"""
from django.utils import timezone
from rest_framework import status
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView

from . import mfa
from .models import ActivityLog, AuthenticatorDevice, UserSession
from .views import log_activity


def _status(user):
    device = AuthenticatorDevice.objects.filter(user=user).first()
    return {
        'enabled': bool(device and device.confirmed_at),
        'enabled_at': device.confirmed_at if device else None,
        'setup_pending': bool(device and not device.confirmed_at),
        'recovery_left': mfa.recovery_left(user) if device and device.confirmed_at else 0,
        'recommended': user.role == 'ADMIN' or user.is_superuser,
    }


def _bad(detail, code='invalid_code', http=status.HTTP_400_BAD_REQUEST):
    return Response({'detail': detail, 'code': code}, status=http)


class TwoStepView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request):
        return Response(_status(request.user))


class TwoStepSetupView(APIView):
    permission_classes = [IsAuthenticated]

    def post(self, request):
        device = AuthenticatorDevice.objects.filter(user=request.user).first()
        if device and device.confirmed_at:
            return _bad('Two-step sign-in is already on. Turn it off first to connect a different app.', 'already_on')
        secret = mfa.new_secret()
        AuthenticatorDevice.objects.update_or_create(user=request.user, defaults={'secret': secret, 'confirmed_at': None, 'last_step': 0})
        uri = mfa.setup_uri(request.user, secret)
        return Response({'secret': secret, 'uri': uri, 'qr_svg': mfa.qr_svg(uri)})


class TwoStepConfirmView(APIView):
    permission_classes = [IsAuthenticated]

    def post(self, request):
        device = AuthenticatorDevice.objects.filter(user=request.user, confirmed_at__isnull=True).first()
        if not device:
            return _bad('Start the setup first.', 'no_setup')
        step = mfa.matching_step(device.secret, request.data.get('code'))
        if step is None:
            return _bad('That code isn’t right. Check the time on your phone and try the newest code.')
        device.confirmed_at, device.last_step = timezone.now(), step
        device.save(update_fields=['confirmed_at', 'last_step'])
        codes = mfa.new_recovery_codes(request.user)
        log_activity(request.user, ActivityLog.TWO_STEP_ON, 'Two-step sign-in turned on (authenticator app)', request)
        return Response({**_status(request.user), 'recovery_codes': codes})


class TwoStepDisableView(APIView):
    permission_classes = [IsAuthenticated]

    def post(self, request):
        if not request.user.check_password(request.data.get('password') or ''):
            return _bad('Your password isn’t right.', 'wrong_password')
        try:
            mfa.check(request.user, request.data.get('code'))
        except mfa.CodeError as exc:
            return _bad(exc.detail, exc.code)
        AuthenticatorDevice.objects.filter(user=request.user).delete()
        request.user.recovery_codes.all().delete()
        log_activity(request.user, ActivityLog.TWO_STEP_OFF, 'Two-step sign-in turned off', request)
        return Response(_status(request.user))


class RecoveryCodesView(APIView):
    permission_classes = [IsAuthenticated]

    def post(self, request):
        if not mfa.is_on(request.user):
            return _bad('Turn on two-step sign-in first.', 'not_on')
        try:
            mfa.check(request.user, request.data.get('code'))
        except mfa.CodeError as exc:
            return _bad(exc.detail, exc.code)
        codes = mfa.new_recovery_codes(request.user)
        log_activity(request.user, ActivityLog.RECOVERY_CODES, 'New recovery codes created (the old ones stop working)', request)
        return Response({**_status(request.user), 'recovery_codes': codes})


def session_row(s, current):
    return {
        'id': s.id, 'device': mfa.describe(s.user_agent), 'ip_address': s.ip_address, 'method': s.method,
        'created_at': s.created_at, 'last_seen_at': s.last_seen_at, 'current': s.key == current,
    }


class SessionsView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request):
        current = request.auth.get('sid') if request.auth else None
        rows = UserSession.objects.filter(user=request.user, revoked_at__isnull=True)[:50]
        return Response([session_row(s, current) for s in rows])


class SessionDetailView(APIView):
    permission_classes = [IsAuthenticated]

    def delete(self, request, pk):
        sessions = UserSession.objects.filter(user=request.user, pk=pk, revoked_at__isnull=True)
        if not sessions.exists():
            return _bad('That device is already signed out.', 'not_found', status.HTTP_404_NOT_FOUND)
        label = mfa.describe(sessions.first().user_agent)
        mfa.revoke(sessions)
        log_activity(request.user, ActivityLog.DEVICE_SIGNED_OUT, f'Signed out {label}', request)
        return Response(status=status.HTTP_204_NO_CONTENT)


class SessionsRevokeOthersView(APIView):
    permission_classes = [IsAuthenticated]

    def post(self, request):
        current = request.auth.get('sid') if request.auth else None
        count = mfa.revoke(UserSession.objects.filter(user=request.user, revoked_at__isnull=True).exclude(key=current or ''))
        if count:
            log_activity(request.user, ActivityLog.DEVICE_SIGNED_OUT, f'Signed out {count} other device{"s" if count != 1 else ""}', request)
        return Response({'signed_out': count})
