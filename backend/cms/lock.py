"""
Website lockdown, switched on from Admin → Lock website.

While locked, visitors can still open and read the website, but nothing they do goes through: every request that
would change something (POST/PUT/PATCH/DELETE to the API: sign-ups, payments, enrolments, messages, course progress...)
is refused with 423 and code `site_locked`. Administrators are never locked out. Signing in stays open, so an
administrator can always get back in to unlock (other users who sign in are still locked).

Public: GET /api/v1/content/lock/           {locked, message}
Admin:  GET/PUT /api/v1/content/lock/manage/ {locked, message, updated_at, updated_by_name}
"""
from django.core.cache import cache
from django.db.models.signals import post_delete, post_save
from django.dispatch import receiver
from django.http import JsonResponse
from rest_framework import serializers
from rest_framework.permissions import AllowAny
from rest_framework.response import Response
from rest_framework.views import APIView

from accounts.models import User
from accounts.permissions import IsAdmin

from .models import SiteLock

CACHE_KEY = 'cms:site-lock'
DEFAULT_MESSAGE = 'The website is temporarily locked while we make some changes. Please check back soon.'
SAFE_METHODS = ('GET', 'HEAD', 'OPTIONS')
# Requests that stay open while locked: signing in and out (so an administrator can always get back in) and the lock itself
OPEN_PATHS = (
    '/api/v1/auth/login/',
    '/api/v1/auth/otp/',
    '/api/v1/auth/token/refresh/',
    '/api/v1/auth/logout/',
    '/api/v1/auth/oauth/',
    '/api/v1/content/lock/',
    '/api/v1/newsletter/unsubscribe/',  # leaving a mailing list must always work
)


def current():
    """{'locked': bool, 'message': str}, cached for a few seconds (checked on every change request)."""
    state = cache.get(CACHE_KEY)
    if state is None:
        lock = SiteLock.objects.first()
        state = {'locked': bool(lock and lock.locked), 'message': (lock.message if lock else '') or DEFAULT_MESSAGE}
        cache.set(CACHE_KEY, state, 10)
    return state


@receiver([post_save, post_delete], sender=SiteLock)
def _forget_cached_lock(**kwargs):
    """Any change (this API, or the Django admin) applies at once instead of after the cache expires."""
    cache.delete(CACHE_KEY)


def _is_admin(request):
    user = getattr(request, 'user', None)
    if user is not None and user.is_authenticated:  # Django session (e.g. the Django admin)
        return user.role == User.ADMIN
    # API requests carry a JWT, which DRF only reads inside the view: check it here.
    from accounts.authentication import SessionJWTAuthentication
    try:
        result = SessionJWTAuthentication().authenticate(request)
    except Exception:
        return False
    return bool(result and result[0].role == User.ADMIN)


class SiteLockMiddleware:
    def __init__(self, get_response):
        self.get_response = get_response

    def __call__(self, request):
        path = request.path
        if (request.method not in SAFE_METHODS and path.startswith('/api/') and not path.startswith(OPEN_PATHS)
                and current()['locked'] and not _is_admin(request)):
            return JsonResponse({'detail': current()['message'], 'code': 'site_locked'}, status=423)
        return self.get_response(request)


class SiteLockSerializer(serializers.ModelSerializer):
    updated_by_name = serializers.SerializerMethodField()

    class Meta:
        model = SiteLock
        fields = ('locked', 'message', 'updated_at', 'updated_by_name')
        read_only_fields = ('updated_at', 'updated_by_name')

    def get_updated_by_name(self, obj):
        user = obj.updated_by
        return (user.get_full_name() or user.email) if user else ''

    def validate_message(self, value):
        return value.strip()


class SiteLockView(APIView):
    permission_classes = [AllowAny]

    def get(self, request):
        return Response(current())


class ManageSiteLockView(APIView):
    permission_classes = [IsAdmin]

    def get(self, request):
        return Response(SiteLockSerializer(SiteLock.load()).data)

    def put(self, request):
        lock = SiteLock.load()
        serializer = SiteLockSerializer(lock, data=request.data, partial=True)
        serializer.is_valid(raise_exception=True)
        serializer.save(updated_by=request.user)
        cache.delete(CACHE_KEY)
        return Response(serializer.data)
