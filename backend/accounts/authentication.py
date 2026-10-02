"""Sign-in tokens that stop working as soon as their device is signed out (see mfa.UserSession)."""
from rest_framework_simplejwt.authentication import JWTAuthentication
from rest_framework_simplejwt.exceptions import InvalidToken

from . import mfa


class SessionJWTAuthentication(JWTAuthentication):
    """The usual JWT check, plus: the device (claim `sid`) must not have been signed out."""

    def authenticate(self, request):
        result = super().authenticate(request)
        if result is not None:
            from lms.insights import mark_active  # activity for the admin insights (once per user per day)
            mark_active(result[0])
        return result

    def get_validated_token(self, raw_token):
        token = super().get_validated_token(raw_token)
        if not mfa.session_alive(token.get('sid')):
            raise InvalidToken({'detail': 'This device was signed out.', 'code': 'session_revoked'})
        return token
