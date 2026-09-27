from django.db import models
from django.contrib.auth.models import AbstractBaseUser, PermissionsMixin, BaseUserManager
from django.core.validators import EmailValidator
from django.utils import timezone


class UserManager(BaseUserManager):
    """
    Custom user manager for ADRAM User model.
    Email is the primary authentication field.
    """

    def create_user(self, email, password=None, **extra_fields):
        """Create and save a regular user."""
        if not email:
            raise ValueError('Email field is required')
        
        email = self.normalize_email(email)
        user = self.model(email=email, **extra_fields)
        user.set_password(password)
        user.save(using=self._db)
        return user

    def create_superuser(self, email, password=None, **extra_fields):
        """Create and save a superuser."""
        extra_fields.setdefault('is_staff', True)
        extra_fields.setdefault('is_superuser', True)
        extra_fields.setdefault('is_active', True)
        extra_fields.setdefault('is_verified', True)
        extra_fields.setdefault('role', User.ADMIN)

        if extra_fields.get('is_staff') is not True:
            raise ValueError('Superuser must have is_staff=True.')
        if extra_fields.get('is_superuser') is not True:
            raise ValueError('Superuser must have is_superuser=True.')

        return self.create_user(email, password, **extra_fields)


class User(AbstractBaseUser, PermissionsMixin):
    """
    Custom User model for ADRAM Technologies.
    Email-based authentication instead of username.
    """

    # Role choices
    ADMIN = 'ADMIN'
    SCHOLARSHIP_MANAGER = 'SCHOLARSHIP_MANAGER'
    FINANCE_MANAGER = 'FINANCE_MANAGER'
    COUNSELLOR = 'COUNSELLOR'
    STUDENT = 'STUDENT'

    ROLE_CHOICES = [
        (ADMIN, 'Administrator'),
        (SCHOLARSHIP_MANAGER, 'Scholarship Manager'),
        (FINANCE_MANAGER, 'Finance Manager'),
        (COUNSELLOR, 'Counsellor'),
        (STUDENT, 'Student'),
    ]

    # Basic Information
    email = models.EmailField(
        unique=True,
        validators=[EmailValidator()],
        help_text='Email address for authentication'
    )
    first_name = models.CharField(max_length=150)
    last_name = models.CharField(max_length=150)
    phone_number = models.CharField(max_length=20, blank=True, null=True)
    country = models.CharField(max_length=100, blank=True, null=True)
    profile_picture = models.ImageField(
        upload_to='profile_pictures/',
        blank=True,
        null=True,
        help_text='User profile picture'
    )

    # Role and Status
    role = models.CharField(
        max_length=50,
        choices=ROLE_CHOICES,
        default=STUDENT,
        help_text='User role in the system'
    )
    is_verified = models.BooleanField(
        default=False,
        help_text='Email verification status'
    )
    is_active = models.BooleanField(
        default=True,
        help_text='Account active status'
    )
    is_staff = models.BooleanField(
        default=False,
        help_text='Staff access status'
    )

    # Timestamps
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)
    last_login = models.DateTimeField(blank=True, null=True)

    objects = UserManager()

    USERNAME_FIELD = 'email'
    REQUIRED_FIELDS = ['first_name', 'last_name']

    class Meta:
        ordering = ['-created_at']
        indexes = [
            models.Index(fields=['email']),
            models.Index(fields=['role']),
            models.Index(fields=['is_active']),
        ]

    def __str__(self):
        return f"{self.get_full_name()} ({self.email})"

    def get_full_name(self):
        """Return the user's full name."""
        return f"{self.first_name} {self.last_name}".strip()

    def get_short_name(self):
        """Return the user's short name."""
        return self.first_name

    def is_admin(self):
        """Check if user is an admin."""
        return self.role == self.ADMIN

    def is_scholarship_manager(self):
        """Check if user is a scholarship manager."""
        return self.role == self.SCHOLARSHIP_MANAGER

    def is_finance_manager(self):
        """Check if user is a finance manager."""
        return self.role == self.FINANCE_MANAGER

    def is_counsellor(self):
        """Check if user is a counsellor."""
        return self.role == self.COUNSELLOR

    def is_student(self):
        """Check if user is a student."""
        return self.role == self.STUDENT


class ActivityLog(models.Model):
    """
    Track user activities for security and audit purposes.
    """

    # Action constants (referenced by views, e.g. ActivityLog.LOGIN)
    LOGIN = 'LOGIN'
    LOGOUT = 'LOGOUT'
    REGISTRATION = 'REGISTRATION'
    PROFILE_UPDATE = 'PROFILE_UPDATE'
    PASSWORD_CHANGE = 'PASSWORD_CHANGE'
    PASSWORD_RESET = 'PASSWORD_RESET'
    EMAIL_VERIFICATION = 'EMAIL_VERIFICATION'
    ROLE_CHANGE = 'ROLE_CHANGE'
    ACCOUNT_DEACTIVATION = 'ACCOUNT_DEACTIVATION'
    ACCOUNT_ACTIVATION = 'ACCOUNT_ACTIVATION'
    FAILED_LOGIN = 'FAILED_LOGIN'

    ACTION_CHOICES = [
        (LOGIN, 'Login'),
        (LOGOUT, 'Logout'),
        (REGISTRATION, 'Registration'),
        (PROFILE_UPDATE, 'Profile Update'),
        (PASSWORD_CHANGE, 'Password Change'),
        (PASSWORD_RESET, 'Password Reset'),
        (EMAIL_VERIFICATION, 'Email Verification'),
        (ROLE_CHANGE, 'Role Change'),
        (ACCOUNT_DEACTIVATION, 'Account Deactivation'),
        (ACCOUNT_ACTIVATION, 'Account Activation'),
        (FAILED_LOGIN, 'Failed Login Attempt'),
    ]

    user = models.ForeignKey(
        User,
        on_delete=models.CASCADE,
        related_name='activity_logs'
    )
    action = models.CharField(max_length=50, choices=ACTION_CHOICES)
    description = models.TextField(blank=True, null=True)
    ip_address = models.GenericIPAddressField(blank=True, null=True)
    user_agent = models.TextField(blank=True, null=True)
    timestamp = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ['-timestamp']
        indexes = [
            models.Index(fields=['user', '-timestamp']),
            models.Index(fields=['action', '-timestamp']),
        ]

    def __str__(self):
        return f"{self.user.email} - {self.action} - {self.timestamp}"
