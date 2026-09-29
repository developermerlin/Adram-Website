"""
Sign in with Google, Facebook and GitHub (OAuth 2.0 authorization-code flow).

Flow:
  1. The frontend sends the browser to  /api/v1/auth/oauth/<provider>/start/
  2. We redirect to the provider with a signed `state`, also bound to this browser by a cookie.
  3. The provider redirects back to     /api/v1/auth/oauth/<provider>/callback/
  4. We exchange the code, read the user's verified email, then find or create the ADRAM user.
  5. We redirect to the frontend's /oauth/callback with a one-time code (never the JWTs themselves).
  6. The frontend POSTs that code to    /api/v1/auth/oauth/exchange/  and receives the usual JWT pair.

Credentials come from .env (GOOGLE_CLIENT_ID, ...). A provider without credentials is reported as
"not configured" instead of failing. Register this redirect URI with each provider:
  {BACKEND_URL}/api/v1/auth/oauth/<provider>/callback/
"""
import json
import logging
import secrets
import urllib.error
import urllib.parse
import urllib.request

from django.conf import settings
from django.contrib.auth import get_user_model
from django.core import signing
from django.core.cache import cache
from django.db import transaction
from django.http import HttpResponseRedirect
from django.utils import timezone
from django.views import View
from rest_framework import serializers, status
from rest_framework.permissions import AllowAny
from rest_framework.response import Response
from rest_framework.views import APIView

from .emails import notify_admins_new_account
from .models import ActivityLog, SocialAccount
from .serializers import UserSerializer
from .views import auto_approve_student, tokens_for

User = get_user_model()
logger = logging.getLogger(__name__)

STATE_COOKIE = 'adram_oauth_state'
STATE_SALT = 'accounts.oauth.state'
CODE_SALT = 'accounts.oauth.code'
STATE_MAX_AGE = 600   # seconds the user has to finish signing in with the provider
CODE_MAX_AGE = 120    # seconds the frontend has to exchange the one-time code
HTTP_TIMEOUT = 10


class OAuthError(Exception):
    """`code` is passed to the frontend, which shows a friendly message for it."""

    def __init__(self, code, detail=''):
        super().__init__(detail or code)
        self.code = code


# --------------------------------------------------------------------------- HTTP helpers

def _request(url, data=None, headers=None, method=None):
    body = urllib.parse.urlencode(data).encode() if data is not None else None
    req = urllib.request.Request(url, data=body, method=method or ('POST' if body else 'GET'))
    req.add_header('Accept', 'application/json')
    req.add_header('User-Agent', 'ADRAM-Technologies-Portal')
    for key, value in (headers or {}).items():
        req.add_header(key, value)
    try:
        with urllib.request.urlopen(req, timeout=HTTP_TIMEOUT) as resp:
            return json.loads(resp.read().decode())
    except (urllib.error.URLError, ValueError) as exc:
        logger.warning('OAuth provider request failed: %s %s', url, exc)
        raise OAuthError('failed', 'Could not reach the sign-in provider.') from exc


def _bearer(token):
    return {'Authorization': f'Bearer {token}'}


# --------------------------------------------------------------------------- Providers
# Each profile() returns {'uid', 'email', 'email_verified', 'first_name', 'last_name'}.

class Provider:
    name = ''
    label = ''
    authorize_url = ''
    token_url = ''
    scope = ''
    extra_authorize_params = {}

    @property
    def client_id(self):
        return getattr(settings, f'{self.name.upper()}_CLIENT_ID', '')

    @property
    def client_secret(self):
        return getattr(settings, f'{self.name.upper()}_CLIENT_SECRET', '')

    @property
    def configured(self):
        return bool(self.client_id and self.client_secret)

    @property
    def redirect_uri(self):
        # Built from settings (not the request) so it matches what is registered with the provider exactly.
        return f"{settings.BACKEND_URL.rstrip('/')}/api/v1/auth/oauth/{self.name}/callback/"

    def authorization_url(self, state):
        params = {
            'client_id': self.client_id,
            'redirect_uri': self.redirect_uri,
            'response_type': 'code',
            'scope': self.scope,
            'state': state,
            **self.extra_authorize_params,
        }
        return f'{self.authorize_url}?{urllib.parse.urlencode(params)}'

    def exchange_code(self, code):
        data = _request(self.token_url, {
            'client_id': self.client_id,
            'client_secret': self.client_secret,
            'code': code,
            'redirect_uri': self.redirect_uri,
            'grant_type': 'authorization_code',
        })
        token = data.get('access_token')
        if not token:
            raise OAuthError('failed', f'No access token from {self.label}.')
        return token

    def profile(self, token):
        raise NotImplementedError


class GoogleProvider(Provider):
    name, label = 'google', 'Google'
    authorize_url = 'https://accounts.google.com/o/oauth2/v2/auth'
    token_url = 'https://oauth2.googleapis.com/token'
    scope = 'openid email profile'
    extra_authorize_params = {'prompt': 'select_account'}

    def profile(self, token):
        info = _request('https://openidconnect.googleapis.com/v1/userinfo', headers=_bearer(token))
        return {
            'uid': str(info.get('sub', '')),
            'email': info.get('email', ''),
            'email_verified': bool(info.get('email_verified')),
            'first_name': info.get('given_name', ''),
            'last_name': info.get('family_name', ''),
        }


class FacebookProvider(Provider):
    name, label = 'facebook', 'Facebook'
    authorize_url = 'https://www.facebook.com/v19.0/dialog/oauth'
    token_url = 'https://graph.facebook.com/v19.0/oauth/access_token'
    scope = 'email,public_profile'

    def profile(self, token):
        info = _request(
            'https://graph.facebook.com/v19.0/me?fields=id,email,first_name,last_name', headers=_bearer(token),
        )
        # Facebook only returns an email address the person has confirmed with Facebook.
        return {
            'uid': str(info.get('id', '')),
            'email': info.get('email', ''),
            'email_verified': bool(info.get('email')),
            'first_name': info.get('first_name', ''),
            'last_name': info.get('last_name', ''),
        }


class GitHubProvider(Provider):
    name, label = 'github', 'GitHub'
    authorize_url = 'https://github.com/login/oauth/authorize'
    token_url = 'https://github.com/login/oauth/access_token'
    scope = 'read:user user:email'

    def profile(self, token):
        headers = {**_bearer(token), 'X-GitHub-Api-Version': '2022-11-28'}
        info = _request('https://api.github.com/user', headers=headers)
        # The public profile email may be hidden or unverified; use the primary verified address instead.
        emails = _request('https://api.github.com/user/emails', headers=headers)
        primary = next((e for e in emails if e.get('primary') and e.get('verified')), None)
        first, _, last = (info.get('name') or info.get('login') or '').partition(' ')
        return {
            'uid': str(info.get('id', '')),
            'email': primary['email'] if primary else '',
            'email_verified': bool(primary),
            'first_name': first,
            'last_name': last,
        }


PROVIDERS = {p.name: p for p in (GoogleProvider(), FacebookProvider(), GitHubProvider())}


# --------------------------------------------------------------------------- Helpers

def _frontend_redirect(path, **params):
    url = f"{settings.FRONTEND_URL.rstrip('/')}{path}"
    if params:
        url += '?' + urllib.parse.urlencode(params)
    return HttpResponseRedirect(url)


def _safe_next(value):
    # Only same-site paths, so the flow can't be used to bounce users to another website.
    return value if isinstance(value, str) and value.startswith('/') and not value.startswith('//') else ''


def _client_ip(request):
    forwarded = request.META.get('HTTP_X_FORWARDED_FOR')
    return forwarded.split(',')[0].strip() if forwarded else request.META.get('REMOTE_ADDR')


def _log(user, action, description, request):
    try:
        ActivityLog.objects.create(
            user=user, action=action, description=description,
            ip_address=_client_ip(request), user_agent=request.META.get('HTTP_USER_AGENT', ''),
        )
    except Exception:  # logging must never break sign-in
        logger.exception('Could not write activity log')


@transaction.atomic
def _get_or_create_user(provider, data):
    """Return (user, created). Links by provider id first, then by verified email."""
    link = SocialAccount.objects.select_related('user').filter(provider=provider.name, uid=data['uid']).first()
    if link:
        if data['email'] and link.email != data['email']:
            link.email = data['email']
            link.save(update_fields=['email', 'last_login'])
        return link.user, False

    # Never attach to an existing account on an unverified email: that would allow account takeover.
    if not data['email'] or not data['email_verified']:
        raise OAuthError('no_email', f'{provider.label} did not share a verified email address.')

    created = False
    user = User.objects.filter(email__iexact=data['email']).first()
    if not user:
        user = User(
            email=User.objects.normalize_email(data['email']),
            first_name=(data['first_name'] or data['email'].split('@')[0])[:150],
            last_name=(data['last_name'] or '')[:150],
            role=User.STUDENT,          # self-registration is always a student, as with the normal form
            is_verified=True,           # the provider has verified this email address
        )
        user.set_unusable_password()   # they can set one later with "Forgot password"
        user.save()
        created = True

    SocialAccount.objects.create(user=user, provider=provider.name, uid=data['uid'], email=data['email'])
    return user, created


# --------------------------------------------------------------------------- Views

class OAuthStartView(View):
    """GET /oauth/<provider>/start/?next=/path  ->  redirect to the provider."""

    def get(self, request, provider):
        p = PROVIDERS.get(provider)
        if not p:
            return _frontend_redirect('/login', oauth_error='unknown_provider')
        if not p.configured:
            return _frontend_redirect('/login', oauth_error='not_configured', provider=provider)

        nonce = secrets.token_urlsafe(24)
        state = signing.dumps({'p': provider, 'n': nonce, 'next': _safe_next(request.GET.get('next'))}, salt=STATE_SALT)
        response = HttpResponseRedirect(p.authorization_url(state))
        # Lax lets the cookie come back on the provider's top-level redirect, but not on cross-site POSTs.
        response.set_cookie(
            STATE_COOKIE, nonce, max_age=STATE_MAX_AGE, httponly=True,
            secure=not settings.DEBUG, samesite='Lax',
        )
        return response


class OAuthCallbackView(View):
    """GET /oauth/<provider>/callback/?code=...&state=...  ->  redirect to the frontend with a one-time code."""

    def get(self, request, provider):
        p = PROVIDERS.get(provider)
        try:
            if not p or not p.configured:
                raise OAuthError('not_configured')
            if request.GET.get('error'):
                # e.g. the person pressed "Cancel" on the provider's screen
                raise OAuthError('access_denied')

            try:
                state = signing.loads(request.GET.get('state', ''), salt=STATE_SALT, max_age=STATE_MAX_AGE)
            except signing.BadSignature as exc:
                raise OAuthError('state') from exc
            cookie_nonce = request.COOKIES.get(STATE_COOKIE)
            if state.get('p') != provider or not cookie_nonce or not secrets.compare_digest(cookie_nonce, state.get('n', '')):
                raise OAuthError('state')

            code = request.GET.get('code')
            if not code:
                raise OAuthError('failed')

            data = p.profile(p.exchange_code(code))
            if not data['uid']:
                raise OAuthError('failed')
            user, created = _get_or_create_user(p, data)
            # The provider has verified the email, so students are approved like email sign-ups.
            if not auto_approve_student(user, request, f'signed up with {p.label}') and created:
                notify_admins_new_account(user)
            if not user.is_active:
                raise OAuthError('inactive')
            # Accounts that still need approval wait for an administrator.
            if user.approval_status == User.REJECTED:
                raise OAuthError('rejected')
            if user.approval_status == User.PENDING:
                _log(user, ActivityLog.REGISTRATION if created else ActivityLog.LOGIN,
                     f'{"Registered" if created else "Tried to sign in"} with {p.label} (awaiting approval)', request)
                raise OAuthError('pending_approval')
        except OAuthError as exc:
            logger.info('OAuth %s sign-in failed: %s', provider, exc)
            response = _frontend_redirect('/login', oauth_error=exc.code, provider=provider)
            response.delete_cookie(STATE_COOKIE)
            return response

        _log(user, ActivityLog.REGISTRATION if created else ActivityLog.LOGIN,
             f"{'Registered' if created else 'Signed in'} with {p.label}", request)

        one_time = signing.dumps({'u': user.pk, 'j': secrets.token_urlsafe(8)}, salt=CODE_SALT)
        params = {'code': one_time}
        if state.get('next'):
            params['next'] = state['next']
        if created:
            params['new'] = '1'
        response = _frontend_redirect('/oauth/callback', **params)
        response.delete_cookie(STATE_COOKIE)
        return response


class OAuthExchangeSerializer(serializers.Serializer):
    code = serializers.CharField()


class OAuthExchangeView(APIView):
    """POST {code}  ->  {access, refresh, user}. Each code works once, within two minutes."""

    permission_classes = [AllowAny]
    authentication_classes = []
    serializer_class = OAuthExchangeSerializer

    def post(self, request):
        serializer = OAuthExchangeSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        code = serializer.validated_data['code']
        invalid = Response({'detail': 'This sign-in link has expired. Please try again.'}, status=status.HTTP_400_BAD_REQUEST)

        try:
            payload = signing.loads(code, salt=CODE_SALT, max_age=CODE_MAX_AGE)
        except signing.BadSignature:
            return invalid
        # Single use: cache.add only succeeds the first time this code is seen.
        if not cache.add(f'oauth-code:{payload["j"]}:{payload["u"]}', True, CODE_MAX_AGE):
            return invalid

        user = User.objects.filter(pk=payload['u'], is_active=True, approval_status=User.APPROVED).first()
        if not user:
            return invalid

        user.last_login = timezone.now()
        user.save(update_fields=['last_login'])
        return Response({**tokens_for(user), 'user': UserSerializer(user).data})


class OAuthProvidersView(APIView):
    """GET -> which providers are configured, so the frontend can show setup hints."""

    permission_classes = [AllowAny]
    authentication_classes = []

    def get(self, request):
        return Response({name: p.configured for name, p in PROVIDERS.items()})
