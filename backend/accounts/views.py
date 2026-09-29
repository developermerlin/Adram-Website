import logging

from django.contrib.auth import get_user_model
from django.db import transaction
from django.utils import timezone
from rest_framework import generics, status
from rest_framework.permissions import AllowAny, IsAuthenticated
from rest_framework.response import Response
from rest_framework_simplejwt.token_blacklist.models import BlacklistedToken, OutstandingToken
from rest_framework_simplejwt.tokens import RefreshToken

from .emails import notify_admins_new_account
from .models import ActivityLog, EmailOTP
from .otp import OTPError, issue_otp, make_challenge, mask_email, read_challenge, verify_otp
from .serializers import (
    ActivityLogSerializer, ChangePasswordSerializer, LoginSerializer, OTPResendSerializer, OTPVerifySerializer,
    PasswordResetConfirmSerializer, PasswordResetRequestSerializer, UserLogoutSerializer, UserRegistrationSerializer,
    UserSerializer, UserUpdateSerializer,
)

User = get_user_model()
logger = logging.getLogger(__name__)


def get_client_ip(request):
    """Extract client IP address from request."""
    x_forwarded_for = request.META.get('HTTP_X_FORWARDED_FOR')
    if x_forwarded_for:
        return x_forwarded_for.split(',')[0]
    return request.META.get('REMOTE_ADDR')


def get_user_agent(request):
    """Extract user agent from request."""
    return request.META.get('HTTP_USER_AGENT', '')


def log_activity(user, action, description='', request=None):
    """Log user activity."""
    try:
        ActivityLog.objects.create(
            user=user,
            action=action,
            description=description,
            ip_address=get_client_ip(request) if request else None,
            user_agent=get_user_agent(request) if request else None,
        )
    except Exception as e:
        logger.error(f"Error logging activity: {str(e)}")


def tokens_for(user):
    """JWT pair with the same custom claims the frontend has always received."""
    refresh = RefreshToken.for_user(user)
    for claim in ('email', 'role', 'first_name', 'last_name', 'is_verified'):
        refresh[claim] = getattr(user, claim)
    return {'access': str(refresh.access_token), 'refresh': str(refresh)}


def sign_out_everywhere(user):
    """Blacklist every refresh token the user holds (used when an account is disabled)."""
    for token in OutstandingToken.objects.filter(user=user):
        BlacklistedToken.objects.get_or_create(token=token)


def otp_error_response(exc):
    body = {'detail': exc.detail, 'code': exc.code}
    if exc.retry_after:
        body['retry_after'] = exc.retry_after
    status_code = status.HTTP_429_TOO_MANY_REQUESTS if exc.retry_after else status.HTTP_400_BAD_REQUEST
    return Response(body, status=status_code)


def otp_challenge_response(user, purpose, remember=True, message='', http_status=status.HTTP_200_OK):
    """Send a code and tell the frontend to show the code screen."""
    try:
        issue_otp(user, purpose)
    except OTPError as exc:
        if exc.code != 'resend_too_soon':
            return otp_error_response(exc)
        # A code was sent moments ago: let the user use that one.
    except Exception:
        logger.exception('Could not send %s code to %s', purpose, user.email)
        return Response(
            {'detail': 'We couldn’t send your verification code. Please try again shortly.', 'code': 'email_failed'},
            status=status.HTTP_503_SERVICE_UNAVAILABLE,
        )
    return Response({
        'otp_required': True,
        'purpose': purpose,
        'challenge': make_challenge(user, purpose, remember),
        'email': mask_email(user.email),
        'detail': message or f'We sent a 6-digit code to {mask_email(user.email)}.',
    }, status=http_status)


ACCOUNT_BLOCKED = {
    'pending_approval': 'Your email is verified and your account is waiting for approval. We’ll email you as soon as an administrator approves it.',
    'rejected': 'Your account request was not approved. Please contact us if you think this is a mistake.',
    'suspended': 'This account has been disabled. Please contact support.',
}


def auto_approve_student(user, request=None, how='email verified'):
    """
    Students are approved as soon as their email is verified, so they can use the portal (and see
    scholarship links) straight away. Staff roles are only ever assigned by an administrator.
    Returns True if the account was approved just now.
    """
    if user.role != User.STUDENT or user.approval_status != User.PENDING or not user.is_verified:
        return False
    user.approval_status, user.approved_at, user.approved_by = User.APPROVED, timezone.now(), None
    user.save(update_fields=['approval_status', 'approved_at', 'approved_by', 'updated_at'])
    log_activity(user, ActivityLog.ACCOUNT_APPROVED, f'Approved automatically (student account, {how})', request)
    return True


def blocked_reason(user):
    if not user.is_active:
        return 'suspended'
    if user.approval_status == User.REJECTED:
        return 'rejected'
    if user.approval_status == User.PENDING:
        return 'pending_approval'
    return None


def blocked_response(reason):
    return Response({'detail': ACCOUNT_BLOCKED[reason], 'code': reason}, status=status.HTTP_403_FORBIDDEN)


# ---------------------------------------------------------------- Registration and sign-in

class UserRegistrationView(generics.CreateAPIView):
    """
    POST /api/v1/auth/register/
    Creates the account and emails a verification code. No tokens yet; verifying the code
    approves a student account and signs them in.
    """
    queryset = User.objects.all()
    serializer_class = UserRegistrationSerializer
    permission_classes = [AllowAny]

    def create(self, request, *args, **kwargs):
        serializer = self.get_serializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        user = serializer.save()
        log_activity(user, ActivityLog.REGISTRATION, 'User registered', request)
        return otp_challenge_response(
            user, EmailOTP.REGISTER,
            message=f'Account created. Enter the 6-digit code we sent to {mask_email(user.email)} to verify your email.',
            http_status=status.HTTP_201_CREATED,
        )


class LoginView(generics.GenericAPIView):
    """
    POST /api/v1/auth/login/  {email, password, remember}
    Checks the password, then emails a sign-in code. Tokens are issued by /otp/verify/.
    """
    serializer_class = LoginSerializer
    permission_classes = [AllowAny]
    authentication_classes = []

    def post(self, request):
        serializer = self.get_serializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        email, password = serializer.validated_data['email'], serializer.validated_data['password']
        remember = serializer.validated_data['remember']

        user = User.objects.filter(email__iexact=email).first()
        if not user or not user.check_password(password):
            if user:
                log_activity(user, ActivityLog.FAILED_LOGIN, 'Failed login attempt', request)
            return Response({'detail': 'No active account found with the given credentials'}, status=status.HTTP_401_UNAUTHORIZED)

        if not user.is_active:
            return blocked_response('suspended')
        if user.approval_status == User.REJECTED:
            return blocked_response('rejected')
        if not user.is_verified:
            # Registered but never confirmed their email: finish that first.
            return otp_challenge_response(
                user, EmailOTP.REGISTER, remember,
                f'Please verify your email first. We sent a code to {mask_email(user.email)}.',
            )
        auto_approve_student(user, request, 'signed in')  # students who registered before auto-approval
        if user.approval_status == User.PENDING:
            return blocked_response('pending_approval')
        return otp_challenge_response(user, EmailOTP.LOGIN, remember)


class OTPVerifyView(generics.GenericAPIView):
    """
    POST /api/v1/auth/otp/verify/  {challenge, code}
    REGISTER: marks the email verified, approves students, and signs in if approved.
    LOGIN: returns the JWT pair and user.
    """
    serializer_class = OTPVerifySerializer
    permission_classes = [AllowAny]
    authentication_classes = []

    def post(self, request):
        serializer = self.get_serializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        try:
            user, purpose, remember = read_challenge(serializer.validated_data['challenge'], [EmailOTP.REGISTER, EmailOTP.LOGIN])
            if not user:
                raise OTPError('challenge_expired', 'This verification session has expired. Please start again.')
            verify_otp(user, purpose, serializer.validated_data['code'])
        except OTPError as exc:
            return otp_error_response(exc)

        if purpose == EmailOTP.REGISTER and not user.is_verified:
            user.is_verified = True
            user.save(update_fields=['is_verified', 'updated_at'])
            log_activity(user, ActivityLog.EMAIL_VERIFICATION, 'Email verified with a one-time code', request)
            if not auto_approve_student(user, request) and user.approval_status == User.PENDING:
                notify_admins_new_account(user)

        reason = blocked_reason(user)
        if reason:
            return Response({'status': reason, 'detail': ACCOUNT_BLOCKED[reason], 'email_verified': True})

        user.last_login = timezone.now()
        user.save(update_fields=['last_login'])
        log_activity(user, ActivityLog.LOGIN, 'Signed in with an email code', request)
        return Response({**tokens_for(user), 'user': UserSerializer(user).data, 'remember': remember, 'status': 'signed_in'})


class OTPResendView(generics.GenericAPIView):
    """POST /api/v1/auth/otp/resend/  {challenge} -> a new code (rate limited)."""
    serializer_class = OTPResendSerializer
    permission_classes = [AllowAny]
    authentication_classes = []

    def post(self, request):
        serializer = self.get_serializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        try:
            user, purpose, _ = read_challenge(
                serializer.validated_data['challenge'], [EmailOTP.REGISTER, EmailOTP.LOGIN, EmailOTP.PASSWORD_RESET],
            )
            if user:
                issue_otp(user, purpose)
        except OTPError as exc:
            return otp_error_response(exc)
        except Exception:
            logger.exception('Could not resend code')
            return Response({'detail': 'We couldn’t send a new code. Please try again shortly.', 'code': 'email_failed'},
                            status=status.HTTP_503_SERVICE_UNAVAILABLE)
        # Same answer whether or not the (password reset) email exists.
        return Response({'detail': 'A new code is on its way. Check your inbox.'})


# ---------------------------------------------------------------- Password reset with an email code

class PasswordResetRequestView(generics.GenericAPIView):
    """
    POST /api/v1/auth/password-reset/request/  {email}
    Always answers the same way, so it can't be used to find out which emails have accounts.
    """
    serializer_class = PasswordResetRequestSerializer
    permission_classes = [AllowAny]
    authentication_classes = []

    def post(self, request):
        serializer = self.get_serializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        email = serializer.validated_data['email']
        user = User.objects.filter(email__iexact=email, is_active=True).first()
        if user:
            try:
                issue_otp(user, EmailOTP.PASSWORD_RESET)
                log_activity(user, ActivityLog.PASSWORD_RESET, 'Password reset code requested', request)
            except OTPError:
                pass  # rate limited: the earlier code still works
            except Exception:
                logger.exception('Could not send password reset code to %s', email)
        return Response({
            'challenge': make_challenge(user, EmailOTP.PASSWORD_RESET),
            'email': mask_email(email),
            'detail': 'If an account exists for this email, we’ve sent a 6-digit code to it.',
        })


class PasswordResetConfirmView(generics.GenericAPIView):
    """POST /api/v1/auth/password-reset/confirm/  {challenge, code, new_password, new_password_confirm}"""
    serializer_class = PasswordResetConfirmSerializer
    permission_classes = [AllowAny]
    authentication_classes = []

    def post(self, request):
        serializer = self.get_serializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        data = serializer.validated_data
        try:
            user, purpose, _ = read_challenge(data['challenge'], [EmailOTP.PASSWORD_RESET])
            if not user:
                raise OTPError('invalid_code', 'That code is incorrect.')
            verify_otp(user, purpose, data['code'])
        except OTPError as exc:
            return otp_error_response(exc)

        with transaction.atomic():
            user.set_password(data['new_password'])
            # Proving access to the inbox also verifies the email address.
            user.is_verified = True
            user.save()
            sign_out_everywhere(user)
        log_activity(user, ActivityLog.PASSWORD_RESET, 'Password reset with an email code', request)
        return Response({'detail': 'Your password has been reset. You can now sign in with your new password.'})


# ---------------------------------------------------------------- Signed-in user

class UserLogoutView(generics.GenericAPIView):
    """
    User logout endpoint.
    POST /api/auth/logout/
    Blacklists the refresh token.
    """
    serializer_class = UserLogoutSerializer
    permission_classes = [IsAuthenticated]

    def post(self, request):
        try:
            refresh_token = request.data.get('refresh')
            if not refresh_token:
                return Response({'detail': 'Refresh token is required.'}, status=status.HTTP_400_BAD_REQUEST)
            RefreshToken(refresh_token).blacklist()
            log_activity(request.user, ActivityLog.LOGOUT, 'User logged out', request)
            return Response({'message': 'Logged out successfully'}, status=status.HTTP_200_OK)
        except Exception as e:
            return Response({'detail': str(e)}, status=status.HTTP_400_BAD_REQUEST)


class UserProfileView(generics.RetrieveAPIView):
    """
    Get current user profile.
    GET /api/auth/profile/
    """
    serializer_class = UserSerializer
    permission_classes = [IsAuthenticated]

    def get_object(self):
        return self.request.user


class UserProfileUpdateView(generics.UpdateAPIView):
    """
    Update user profile.
    PUT /api/auth/profile/update/
    """
    serializer_class = UserUpdateSerializer
    permission_classes = [IsAuthenticated]

    def get_object(self):
        return self.request.user

    def perform_update(self, serializer):
        serializer.save()
        log_activity(self.request.user, ActivityLog.PROFILE_UPDATE, 'User updated profile', self.request)


class ChangePasswordView(generics.GenericAPIView):
    """
    Change password endpoint.
    POST /api/auth/change-password/
    """
    serializer_class = ChangePasswordSerializer
    permission_classes = [IsAuthenticated]

    def post(self, request):
        serializer = self.get_serializer(data=request.data)
        serializer.is_valid(raise_exception=True)

        user = request.user
        if not user.check_password(serializer.validated_data['old_password']):
            return Response({'detail': 'Old password is incorrect.'}, status=status.HTTP_400_BAD_REQUEST)

        user.set_password(serializer.validated_data['new_password'])
        user.save()
        log_activity(user, ActivityLog.PASSWORD_CHANGE, 'User changed password', request)
        return Response({'message': 'Password changed successfully'}, status=status.HTTP_200_OK)


class UserActivityLogView(generics.ListAPIView):
    """
    View user activity logs.
    GET /api/auth/activity-logs/
    """
    serializer_class = ActivityLogSerializer
    permission_classes = [IsAuthenticated]

    def get_queryset(self):
        """Return activity logs for the current user only."""
        return ActivityLog.objects.filter(user=self.request.user)


class MyActivityOverviewView(generics.GenericAPIView):
    """
    GET /api/v1/auth/activity-logs/overview/?days=30 -> the signed-in person's own account activity:
    sign-ins per day, failed attempts, last sign-in, devices and addresses used, and password changes.
    """
    permission_classes = [IsAuthenticated]

    def get(self, request):
        from datetime import datetime, time, timedelta
        from django.db.models import Count, Max, Q
        from django.db.models.functions import TruncDate
        from .serializers import device_of

        try:
            days = int(request.query_params.get('days', 30))
        except ValueError:
            days = 30
        days = days if days in (7, 30, 90) else 30
        today = timezone.localdate()
        start = today - timedelta(days=days - 1)
        since = timezone.make_aware(datetime.combine(start, time.min))
        before = since - timedelta(days=days)

        mine = ActivityLog.objects.filter(user=request.user)
        logs = mine.filter(timestamp__gte=since)
        prev = mine.filter(timestamp__gte=before, timestamp__lt=since)

        def per_day(queryset):
            return dict(queryset.annotate(day=TruncDate('timestamp')).values('day').annotate(n=Count('id')).values_list('day', 'n'))

        all_day = per_day(logs)
        login_day = per_day(logs.filter(action=ActivityLog.LOGIN))
        failed_day = per_day(logs.filter(action=ActivityLog.FAILED_LOGIN))
        series = [{'date': (start + timedelta(days=i)).isoformat(),
                   'events': all_day.get(start + timedelta(days=i), 0),
                   'logins': login_day.get(start + timedelta(days=i), 0),
                   'failed': failed_day.get(start + timedelta(days=i), 0)} for i in range(days)]

        by_action = dict(logs.values_list('action').annotate(n=Count('id')))
        devices = {'desktop': 0, 'mobile': 0, 'tablet': 0, 'unknown': 0}
        for agent in logs.filter(action=ActivityLog.LOGIN).values_list('user_agent', flat=True)[:2000]:
            devices[device_of(agent)] += 1

        # Where the account was used from (sign-ins and failed attempts), most recent first.
        addresses = [{'ip': row['ip_address'], 'logins': row['logins'], 'failed': row['failed'], 'last': row['last']}
                     for row in logs.exclude(ip_address__isnull=True)
                     .filter(action__in=[ActivityLog.LOGIN, ActivityLog.FAILED_LOGIN])
                     .values('ip_address')
                     .annotate(logins=Count('id', filter=Q(action=ActivityLog.LOGIN)),
                               failed=Count('id', filter=Q(action=ActivityLog.FAILED_LOGIN)),
                               last=Max('timestamp'))
                     .order_by('-last')[:5]]

        # The latest sign-in is usually this session; the one before it is the useful "last time".
        last_logins = list(mine.filter(action=ActivityLog.LOGIN).order_by('-timestamp')[:2])

        def login_info(log):
            return {'at': log.timestamp, 'ip': log.ip_address, 'device': device_of(log.user_agent)} if log else None

        password = mine.filter(action__in=[ActivityLog.PASSWORD_CHANGE, ActivityLog.PASSWORD_RESET]).order_by('-timestamp').first()
        last_failed = mine.filter(action=ActivityLog.FAILED_LOGIN).order_by('-timestamp').first()

        return Response({
            'days': days,
            'series': series,
            'events': logs.count(),
            'events_prev': prev.count(),
            'logins': by_action.get(ActivityLog.LOGIN, 0),
            'logins_prev': prev.filter(action=ActivityLog.LOGIN).count(),
            'failed': by_action.get(ActivityLog.FAILED_LOGIN, 0),
            'failed_prev': prev.filter(action=ActivityLog.FAILED_LOGIN).count(),
            'last_failed_at': last_failed.timestamp if last_failed else None,
            'current_login': login_info(last_logins[0] if last_logins else None),
            'previous_login': login_info(last_logins[1] if len(last_logins) > 1 else None),
            'password_changed_at': password.timestamp if password else None,
            'member_since': request.user.created_at,
            'active_days': sum(1 for p in series if p['events']),
            'by_action': [{'action': a, 'label': label, 'count': by_action.get(a, 0)} for a, label in ActivityLog.ACTION_CHOICES],
            'devices': [{'key': k, 'count': v} for k, v in devices.items()],
            'addresses': addresses,
        })
