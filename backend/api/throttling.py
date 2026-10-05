"""
Request limits for the public parts of the API, counted per network address.

Each limit has a name (its scope) and a rate in settings.API_RATES, e.g. 'auth': '30/min'. Many people in
Sierra Leone share one mobile-network address, so the rates are generous: they stop scripts and floods, not people.
API_THROTTLING = False switches them all off (the test suite does this; see settings.py).
"""
from django.conf import settings
from rest_framework.throttling import SimpleRateThrottle


class RateLimit(SimpleRateThrottle):
    scope = None

    def get_rate(self):
        # read at request time, so a settings change (or a test override) applies at once
        if not getattr(settings, 'API_THROTTLING', True):
            return None
        return getattr(settings, 'API_RATES', {}).get(self.scope)

    def allow_request(self, request, view):
        self.rate = self.get_rate()
        if self.rate is None:
            return True
        self.num_requests, self.duration = self.parse_rate(self.rate)
        return super().allow_request(request, view)

    def get_cache_key(self, request, view):
        return self.cache_format % {'scope': self.scope, 'ident': self.get_ident(request)}


class AuthRate(RateLimit):
    """Signing in and checking codes."""
    scope = 'auth'


class SignupRate(RateLimit):
    """Creating accounts."""
    scope = 'signup'


class EmailRate(RateLimit):
    """Anything that sends an email to an address typed into a form (codes, password resets)."""
    scope = 'email'


class FormRate(RateLimit):
    """Public forms: contact, newsletter, partner applications."""
    scope = 'forms'


class CodeRate(RateLimit):
    """Looking things up by a code: gifts, certificates, study-group invitations."""
    scope = 'codes'


class AnonRate(RateLimit):
    """Every request from a visitor who isn't signed in: a ceiling against scraping and floods."""
    scope = 'anon'

    def allow_request(self, request, view):
        if request.user and request.user.is_authenticated:
            return True
        return super().allow_request(request, view)


def exception_handler(exc, context):
    """DRF's usual error answers, with a plain-English message when a request limit is reached."""
    from rest_framework.exceptions import Throttled
    from rest_framework.views import exception_handler as default_handler
    response = default_handler(exc, context)
    if isinstance(exc, Throttled) and response is not None:
        wait = int(exc.wait or 60)
        when = f'{max(1, round(wait / 60))} minute{"s" if wait > 90 else ""}' if wait >= 60 else f'{wait} seconds'
        response.data = {'detail': f'Too many requests. Please wait {when} and try again.', 'code': 'rate_limited', 'retry_after': wait}
    return response
