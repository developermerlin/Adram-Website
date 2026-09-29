"""
One-time email codes (OTP) for sign-up, sign-in and password reset.

A "challenge" is a signed token the frontend holds between steps. It names the user and purpose but
not the code, so it is safe to keep in the browser. The code itself only travels by email.
"""
import hashlib
import hmac
import secrets
from datetime import timedelta

from django.conf import settings
from django.core import signing
from django.utils import timezone

from .emails import send_otp_email
from .models import EmailOTP, User

CODE_LENGTH = 6
CODE_TTL = timedelta(minutes=10)
MAX_ATTEMPTS = 5                  # wrong guesses allowed per code
RESEND_COOLDOWN = timedelta(seconds=60)
# Optional hourly cap per user and purpose. Off by default; set OTP_MAX_CODES_PER_HOUR in .env to turn it on.
MAX_CODES_PER_HOUR = getattr(settings, 'OTP_MAX_CODES_PER_HOUR', None)
CHALLENGE_SALT = 'accounts.otp.challenge'
CHALLENGE_MAX_AGE = 60 * 30       # the whole verification step must finish within 30 minutes


class OTPError(Exception):
    """`code` is returned to the frontend; `retry_after` (seconds) is set for rate limits."""

    def __init__(self, code, detail, retry_after=None):
        super().__init__(detail)
        self.code = code
        self.detail = detail
        self.retry_after = retry_after


def _hash(code):
    return hmac.new(settings.SECRET_KEY.encode(), code.encode(), hashlib.sha256).hexdigest()


def mask_email(email):
    """ama.kamara@gmail.com -> am********@gmail.com"""
    local, _, domain = email.partition('@')
    visible = local[:2] if len(local) > 2 else local[:1]
    return f'{visible}{"*" * max(len(local) - len(visible), 3)}@{domain}'


def issue_otp(user, purpose):
    """Create a new code, invalidate older ones and email it. Raises OTPError when rate limited."""
    now = timezone.now()
    recent = EmailOTP.objects.filter(user=user, purpose=purpose, created_at__gte=now - timedelta(hours=1))

    latest = recent.first()
    if latest and now - latest.created_at < RESEND_COOLDOWN:
        wait = int((RESEND_COOLDOWN - (now - latest.created_at)).total_seconds()) + 1
        raise OTPError('resend_too_soon', f'Please wait {wait} seconds before requesting another code.', wait)
    if MAX_CODES_PER_HOUR and recent.count() >= MAX_CODES_PER_HOUR:
        raise OTPError('too_many_codes', 'Too many codes requested. Please try again in an hour.', 3600)

    EmailOTP.objects.filter(user=user, purpose=purpose, consumed_at__isnull=True).update(consumed_at=now)
    code = f'{secrets.randbelow(10 ** CODE_LENGTH):0{CODE_LENGTH}d}'
    EmailOTP.objects.create(user=user, purpose=purpose, code_hash=_hash(code), expires_at=now + CODE_TTL)
    send_otp_email(user, code, purpose, int(CODE_TTL.total_seconds() // 60))
    return code


def verify_otp(user, purpose, code):
    """Consume the current code if it matches. Raises OTPError otherwise."""
    otp = EmailOTP.objects.filter(user=user, purpose=purpose, consumed_at__isnull=True).first()
    now = timezone.now()
    if not otp or otp.expires_at <= now:
        raise OTPError('code_expired', 'This code has expired. Request a new one.')
    if otp.attempts >= MAX_ATTEMPTS:
        raise OTPError('too_many_attempts', 'Too many incorrect attempts. Request a new code.')

    if not hmac.compare_digest(otp.code_hash, _hash(str(code).strip())):
        otp.attempts += 1
        otp.save(update_fields=['attempts'])
        left = MAX_ATTEMPTS - otp.attempts
        if left <= 0:
            raise OTPError('too_many_attempts', 'Too many incorrect attempts. Request a new code.')
        raise OTPError('invalid_code', f'That code is incorrect. {left} attempt{"s" if left != 1 else ""} left.')

    otp.consumed_at = now
    otp.save(update_fields=['consumed_at'])


def make_challenge(user, purpose, remember=True):
    return signing.dumps({'u': user.pk if user else None, 'p': purpose, 'r': bool(remember)}, salt=CHALLENGE_SALT)


def read_challenge(token, purposes):
    """Return (user, purpose, remember). A challenge for an unknown email (password reset) has no user."""
    try:
        data = signing.loads(token or '', salt=CHALLENGE_SALT, max_age=CHALLENGE_MAX_AGE)
    except signing.BadSignature as exc:
        raise OTPError('challenge_expired', 'This verification session has expired. Please start again.') from exc
    if data.get('p') not in purposes:
        raise OTPError('challenge_expired', 'This verification session has expired. Please start again.')
    user = User.objects.filter(pk=data.get('u')).first() if data.get('u') else None
    return user, data['p'], data.get('r', True)
