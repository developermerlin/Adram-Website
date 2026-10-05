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
        extra_fields.setdefault('approval_status', User.APPROVED)

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
    INSTRUCTOR = 'INSTRUCTOR'
    TEAM_MEMBER = 'TEAM_MEMBER'
    STUDENT = 'STUDENT'

    ROLE_CHOICES = [
        (ADMIN, 'Administrator'),
        (SCHOLARSHIP_MANAGER, 'Scholarship Manager'),
        (FINANCE_MANAGER, 'Finance Manager'),
        (COUNSELLOR, 'Counsellor'),
        (INSTRUCTOR, 'Instructor'),
        (TEAM_MEMBER, 'Team member'),
        (STUDENT, 'Student'),
    ]

    # Account approval: new sign-ups wait for an administrator before they can sign in.
    PENDING = 'PENDING'
    APPROVED = 'APPROVED'
    REJECTED = 'REJECTED'
    APPROVAL_CHOICES = [
        (PENDING, 'Pending approval'),
        (APPROVED, 'Approved'),
        (REJECTED, 'Rejected'),
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
    approval_status = models.CharField(
        max_length=20,
        choices=APPROVAL_CHOICES,
        default=PENDING,
        db_index=True,
        help_text='Whether an administrator has approved this account'
    )
    approved_at = models.DateTimeField(blank=True, null=True)
    approved_by = models.ForeignKey(
        'self', on_delete=models.SET_NULL, blank=True, null=True, related_name='approved_users'
    )
    rejection_reason = models.TextField(blank=True, default='')

    # What a student uses ADRAM for. Each side has its own dashboard and pages; one account can have both,
    # and doing something on the other side (enrolling on a course, applying for a scholarship) adds it.
    TRAINING, SCHOLARSHIPS = 'training', 'scholarships'
    TRACKS = [TRAINING, SCHOLARSHIPS]
    in_training = models.BooleanField(default=False, help_text='Uses the training side: courses, learning, certificates.')
    in_scholarships = models.BooleanField(default=False, help_text='Uses the scholarships side: applications, documents, services.')

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

    def is_instructor(self):
        """Check if user teaches courses."""
        return self.role == self.INSTRUCTOR

    def is_team_member(self):
        """A member of the ADRAM team with a public portfolio page (see the team app)."""
        return self.role == self.TEAM_MEMBER

    @property
    def tracks(self):
        """['training', 'scholarships'], or whichever of them this account uses."""
        return [t for t, on in ((self.TRAINING, self.in_training), (self.SCHOLARSHIPS, self.in_scholarships)) if on]

    def join_track(self, track):
        """Add a side of the portal to a student's account (no-op for staff, or if they already have it)."""
        field = {self.TRAINING: 'in_training', self.SCHOLARSHIPS: 'in_scholarships'}[track]
        if self.role != self.STUDENT or getattr(self, field):
            return False
        setattr(self, field, True)
        type(self).objects.filter(pk=self.pk).update(**{field: True})
        return True

    @property
    def is_approved(self):
        return self.approval_status == self.APPROVED


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
    ACCOUNT_APPROVED = 'ACCOUNT_APPROVED'
    ACCOUNT_REJECTED = 'ACCOUNT_REJECTED'
    TWO_STEP_ON = 'TWO_STEP_ON'
    TWO_STEP_OFF = 'TWO_STEP_OFF'
    RECOVERY_CODES = 'RECOVERY_CODES'
    DEVICE_SIGNED_OUT = 'DEVICE_SIGNED_OUT'

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
        (ACCOUNT_APPROVED, 'Account Approved'),
        (ACCOUNT_REJECTED, 'Account Rejected'),
        (TWO_STEP_ON, 'Two-step sign-in turned on'),
        (TWO_STEP_OFF, 'Two-step sign-in turned off'),
        (RECOVERY_CODES, 'New recovery codes'),
        (DEVICE_SIGNED_OUT, 'Device signed out'),
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


class SocialAccount(models.Model):
    """
    Links a user to an external sign-in provider (Google, Facebook, GitHub).
    Matching on the provider's own user id means sign-in keeps working even if the email changes.
    """

    GOOGLE = 'google'
    FACEBOOK = 'facebook'
    GITHUB = 'github'
    PROVIDER_CHOICES = [(GOOGLE, 'Google'), (FACEBOOK, 'Facebook'), (GITHUB, 'GitHub')]

    user = models.ForeignKey(User, on_delete=models.CASCADE, related_name='social_accounts')
    provider = models.CharField(max_length=20, choices=PROVIDER_CHOICES)
    uid = models.CharField(max_length=255, help_text="The provider's id for this user")
    email = models.EmailField(blank=True)
    created_at = models.DateTimeField(auto_now_add=True)
    last_login = models.DateTimeField(auto_now=True)

    class Meta:
        constraints = [models.UniqueConstraint(fields=['provider', 'uid'], name='unique_provider_uid')]

    def __str__(self):
        return f'{self.get_provider_display()} - {self.user.email}'


class EmailOTP(models.Model):
    """
    A one-time code emailed to a user. Only a hash of the code is stored.
    """

    REGISTER = 'REGISTER'
    LOGIN = 'LOGIN'
    PASSWORD_RESET = 'PASSWORD_RESET'
    PURPOSE_CHOICES = [
        (REGISTER, 'Email verification'),
        (LOGIN, 'Sign-in'),
        (PASSWORD_RESET, 'Password reset'),
    ]

    user = models.ForeignKey(User, on_delete=models.CASCADE, related_name='email_otps')
    purpose = models.CharField(max_length=20, choices=PURPOSE_CHOICES)
    code_hash = models.CharField(max_length=64)
    created_at = models.DateTimeField(auto_now_add=True)
    expires_at = models.DateTimeField()
    attempts = models.PositiveSmallIntegerField(default=0)
    consumed_at = models.DateTimeField(blank=True, null=True)

    class Meta:
        ordering = ['-created_at']
        indexes = [models.Index(fields=['user', 'purpose', '-created_at'])]

    def __str__(self):
        return f'{self.user.email} - {self.purpose} - {self.created_at:%Y-%m-%d %H:%M}'


class AuthenticatorDevice(models.Model):
    """An authenticator app (Google Authenticator, Microsoft Authenticator…) for two-step sign-in. One per user."""
    user = models.OneToOneField(User, on_delete=models.CASCADE, related_name='authenticator')
    secret = models.CharField(max_length=64, help_text='Base32 secret shared with the app.')
    confirmed_at = models.DateTimeField(null=True, blank=True, help_text='Set once the user has entered a first code.')
    last_step = models.BigIntegerField(default=0, help_text='The last 30-second step used, so a code works only once.')
    created_at = models.DateTimeField(auto_now_add=True)

    def __str__(self):
        return f'{self.user.email} ({"on" if self.confirmed_at else "being set up"})'


class RecoveryCode(models.Model):
    """A one-time backup code for when the phone with the authenticator app is lost. Only a hash is stored."""
    user = models.ForeignKey(User, on_delete=models.CASCADE, related_name='recovery_codes')
    code_hash = models.CharField(max_length=64)
    used_at = models.DateTimeField(null=True, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)


class UserSession(models.Model):
    """
    One signed-in browser or device. Its id travels inside the sign-in tokens (claim `sid`), so signing it out here
    stops both tokens straight away, not when they expire.
    """
    user = models.ForeignKey(User, on_delete=models.CASCADE, related_name='sessions')
    key = models.CharField(max_length=32, unique=True)
    user_agent = models.CharField(max_length=300, blank=True)
    ip_address = models.GenericIPAddressField(null=True, blank=True)
    method = models.CharField(max_length=30, blank=True, help_text='How they signed in: email code, authenticator, Google…')
    created_at = models.DateTimeField(auto_now_add=True)
    last_seen_at = models.DateTimeField(auto_now_add=True)
    revoked_at = models.DateTimeField(null=True, blank=True)

    class Meta:
        ordering = ['-last_seen_at']
        indexes = [models.Index(fields=['user', 'revoked_at'])]
