from django.core.exceptions import ValidationError
from django.contrib.auth import get_user_model
import re

User = get_user_model()


class CustomPasswordValidator:
    """
    Validate password strength.
    Requirements:
    - Minimum 8 characters
    - At least one uppercase letter
    - At least one lowercase letter
    - At least one digit
    - At least one special character
    """

    def validate(self, password, user=None):
        if len(password) < 8:
            raise ValidationError(
                'Password must be at least 8 characters long.',
                code='password_too_short',
            )

        if not re.search(r'[A-Z]', password):
            raise ValidationError(
                'Password must contain at least one uppercase letter.',
                code='password_no_upper',
            )

        if not re.search(r'[a-z]', password):
            raise ValidationError(
                'Password must contain at least one lowercase letter.',
                code='password_no_lower',
            )

        if not re.search(r'\d', password):
            raise ValidationError(
                'Password must contain at least one digit.',
                code='password_no_digit',
            )

        if not re.search(r'[!@#$%^&*(),.?":{}|<>]', password):
            raise ValidationError(
                'Password must contain at least one special character.',
                code='password_no_special',
            )

    def get_help_text(self):
        return (
            'Password must be at least 8 characters with uppercase, lowercase, '
            'digit, and special character.'
        )


def validate_unique_email(email):
    """
    Validate that email is unique in the system.
    """
    if User.objects.filter(email=email).exists():
        raise ValidationError(
            'An account with this email already exists.',
            code='email_exists',
        )


def validate_phone_number(phone_number):
    """
    Validate phone number format.
    """
    if phone_number and not re.match(r'^\+?1?\d{9,15}$', phone_number.replace(' ', '')):
        raise ValidationError(
            'Invalid phone number format.',
            code='invalid_phone',
        )
