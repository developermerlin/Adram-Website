"""
Two-step sign-in with an authenticator app (time-based codes, RFC 6238), one-time recovery codes, and the list of
signed-in devices (sessions).

With an authenticator switched on, the second step of signing in (password, then a code) asks for the app's code
instead of an emailed one. Social sign-in asks for it too.
"""
import base64
import hashlib
import hmac
import secrets
import struct
import time
from urllib.parse import quote

from django.conf import settings
from django.core.cache import cache
from django.utils import timezone

from .models import AuthenticatorDevice, RecoveryCode, UserSession

PURPOSE = 'TOTP'  # the sign-in challenge's purpose when the second step is the authenticator app
ISSUER = 'ADRAM Technologies'
STEP = 30          # seconds per code
DIGITS = 6
WINDOW = 1         # accept the code before and after, for phones whose clock is slightly off
RECOVERY_COUNT = 10
MAX_FAILURES = 5   # wrong codes allowed per user in FAILURE_WINDOW
FAILURE_WINDOW = 15 * 60


# ---------------------------------------------------------------- time-based codes

def new_secret():
    return base64.b32encode(secrets.token_bytes(20)).decode().rstrip('=')


def _code(secret, step):
    key = base64.b32decode(secret + '=' * (-len(secret) % 8), casefold=True)
    digest = hmac.new(key, struct.pack('>Q', step), hashlib.sha1).digest()
    offset = digest[-1] & 0x0F
    value = struct.unpack('>I', digest[offset:offset + 4])[0] & 0x7FFFFFFF
    return str(value % 10 ** DIGITS).zfill(DIGITS)


def current_step(at=None):
    return int((at if at is not None else time.time()) // STEP)


def code_for(secret, at=None):
    """The code the app shows right now (used by tests)."""
    return _code(secret, current_step(at))


def matching_step(secret, code, at=None):
    """The 30-second step this code belongs to (within the window), or None."""
    code = ''.join(ch for ch in str(code or '') if ch.isdigit())
    if len(code) != DIGITS:
        return None
    now = current_step(at)
    for step in range(now - WINDOW, now + WINDOW + 1):
        if hmac.compare_digest(_code(secret, step), code):
            return step
    return None


def setup_uri(user, secret):
    label = quote(f'{ISSUER}:{user.email}')
    return f'otpauth://totp/{label}?secret={secret}&issuer={quote(ISSUER)}&digits={DIGITS}&period={STEP}'


def qr_svg(text):
    import segno
    return segno.make(text, error='m').svg_inline(scale=5, dark='#0b1b46', light='#ffffff', border=2)


def is_on(user):
    device = getattr(user, 'authenticator', None) if user and user.pk else None
    try:
        return bool(device and device.confirmed_at)
    except AuthenticatorDevice.DoesNotExist:
        return False


# ---------------------------------------------------------------- recovery codes

def _hash(code):
    return hmac.new(settings.SECRET_KEY.encode(), code.upper().replace('-', '').encode(), hashlib.sha256).hexdigest()


def new_recovery_codes(user):
    """Replace the user's recovery codes; returns the plain codes (shown once)."""
    RecoveryCode.objects.filter(user=user).delete()
    alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'  # no 0/O or 1/I to misread
    plain = []
    for _ in range(RECOVERY_COUNT):
        raw = ''.join(secrets.choice(alphabet) for _ in range(10))
        plain.append(f'{raw[:5]}-{raw[5:]}')
    RecoveryCode.objects.bulk_create([RecoveryCode(user=user, code_hash=_hash(c)) for c in plain])
    return plain


def recovery_left(user):
    return RecoveryCode.objects.filter(user=user, used_at__isnull=True).count()


# ---------------------------------------------------------------- checking a code at sign-in

class CodeError(Exception):
    def __init__(self, code, detail):
        super().__init__(detail)
        self.code, self.detail = code, detail


def _failures_key(user):
    return f'mfa-failures:{user.pk}'


def check(user, code):
    """
    Accept an authenticator code (each works once) or an unused recovery code. Returns 'authenticator' or
    'recovery code'. Raises CodeError after too many wrong tries or for a wrong code.
    """
    if cache.get(_failures_key(user), 0) >= MAX_FAILURES:
        raise CodeError('too_many_attempts', 'Too many wrong codes. Please wait 15 minutes and try again.')
    device = AuthenticatorDevice.objects.filter(user=user, confirmed_at__isnull=False).first()
    text = str(code or '').strip()
    if device and text.replace(' ', '').isdigit():
        step = matching_step(device.secret, text)
        if step is not None and step > device.last_step:
            AuthenticatorDevice.objects.filter(pk=device.pk).update(last_step=step)
            cache.delete(_failures_key(user))
            return 'authenticator'
    elif text:
        hit = RecoveryCode.objects.filter(user=user, used_at__isnull=True, code_hash=_hash(text)).first()
        if hit:
            hit.used_at = timezone.now()
            hit.save(update_fields=['used_at'])
            cache.delete(_failures_key(user))
            return 'recovery code'
    try:
        cache.incr(_failures_key(user))
    except ValueError:
        cache.set(_failures_key(user), 1, FAILURE_WINDOW)
    raise CodeError('invalid_code', 'That code isn’t right. Check your authenticator app and try again.')


# ---------------------------------------------------------------- signed-in devices

def client_ip(request):
    forwarded = request.META.get('HTTP_X_FORWARDED_FOR', '') if request else ''
    return (forwarded.split(',')[0].strip() or (request.META.get('REMOTE_ADDR') if request else None)) or None


def start_session(user, request=None, method=''):
    return UserSession.objects.create(
        user=user, key=secrets.token_hex(16), method=method[:30],
        user_agent=(request.META.get('HTTP_USER_AGENT', '') if request else '')[:300],
        ip_address=client_ip(request),
    )


def session_alive(key):
    """False once the session was signed out. Cached briefly: it is checked on every API request."""
    if not key:
        return True  # tokens issued before sessions existed
    cache_key = f'session-alive:{key}'
    alive = cache.get(cache_key)
    if alive is None:
        alive = UserSession.objects.filter(key=key, revoked_at__isnull=True).exists()
        cache.set(cache_key, alive, 30)
    return alive


def revoke(sessions):
    keys = list(sessions.values_list('key', flat=True))
    sessions.filter(revoked_at__isnull=True).update(revoked_at=timezone.now())
    for key in keys:
        cache.delete(f'session-alive:{key}')
    return len(keys)


def describe(user_agent):
    """'Chrome on Windows' from a browser's user agent (good enough for a device list)."""
    ua = user_agent or ''
    browser = next((name for token, name in (('Edg/', 'Edge'), ('OPR/', 'Opera'), ('Firefox/', 'Firefox'), ('Chrome/', 'Chrome'),
                                              ('Safari/', 'Safari')) if token in ua), 'Browser')
    system = next((name for token, name in (('Windows', 'Windows'), ('Android', 'Android'), ('iPhone', 'iPhone'), ('iPad', 'iPad'),
                                             ('Mac OS', 'Mac'), ('Linux', 'Linux')) if token in ua), 'unknown device')
    return f'{browser} on {system}'
