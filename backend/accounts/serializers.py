from rest_framework import serializers
from django.contrib.auth import get_user_model
from django.contrib.auth.password_validation import validate_password
from django.core.exceptions import ValidationError
from rest_framework_simplejwt.tokens import RefreshToken

from .validators import validate_unique_email, validate_phone_number, CustomPasswordValidator

User = get_user_model()


class UserSerializer(serializers.ModelSerializer):
    """
    Serializer for User model - used for read operations and profile display.
    """
    full_name = serializers.SerializerMethodField()
    role_display = serializers.CharField(source='get_role_display', read_only=True)
    approval_status_display = serializers.CharField(source='get_approval_status_display', read_only=True)

    class Meta:
        model = User
        fields = [
            'id', 'email', 'first_name', 'last_name', 'full_name',
            'phone_number', 'country', 'profile_picture', 'role',
            'role_display', 'is_verified', 'is_active', 'approval_status',
            'approval_status_display', 'created_at', 'last_login'
        ]
        read_only_fields = ['id', 'created_at', 'is_verified', 'is_active', 'approval_status', 'last_login']

    def get_full_name(self, obj):
        return obj.get_full_name()


class UserRegistrationSerializer(serializers.ModelSerializer):
    """
    Serializer for user registration.
    Handles validation and creation of new users.
    """
    password = serializers.CharField(
        write_only=True,
        required=True,
        style={'input_type': 'password'}
    )
    password_confirm = serializers.CharField(
        write_only=True,
        required=True,
        style={'input_type': 'password'}
    )
    email = serializers.EmailField(
        required=True,
        validators=[validate_unique_email]
    )

    class Meta:
        model = User
        fields = [
            'email', 'first_name', 'last_name', 'phone_number',
            'country', 'password', 'password_confirm'
        ]
        extra_kwargs = {
            'first_name': {'required': True},
            'last_name': {'required': True},
        }

    def validate_password(self, value):
        """Validate password strength."""
        password_validator = CustomPasswordValidator()
        try:
            password_validator.validate(value)
        except ValidationError as e:
            raise serializers.ValidationError(e.messages)
        return value

    def validate_phone_number(self, value):
        """Validate phone number format."""
        if value:
            try:
                validate_phone_number(value)
            except ValidationError as e:
                raise serializers.ValidationError(str(e))
        return value

    def validate(self, attrs):
        """Validate that passwords match."""
        if attrs.get('password') != attrs.pop('password_confirm'):
            raise serializers.ValidationError(
                {'password': 'Passwords do not match.'}
            )
        return attrs

    def create(self, validated_data):
        """Create and return a new user."""
        user = User.objects.create_user(
            email=validated_data['email'],
            first_name=validated_data['first_name'],
            last_name=validated_data['last_name'],
            phone_number=validated_data.get('phone_number'),
            country=validated_data.get('country'),
            password=validated_data['password'],
            # Self-registration always creates students; staff roles are assigned by an admin.
            role=User.STUDENT,
        )
        return user


class UserUpdateSerializer(serializers.ModelSerializer):
    """
    Serializer for updating user profile information.
    """
    phone_number = serializers.CharField(
        required=False,
        allow_blank=True,
        validators=[validate_phone_number]
    )

    class Meta:
        model = User
        fields = [
            'first_name', 'last_name', 'phone_number', 'country', 'profile_picture'
        ]


class ChangePasswordSerializer(serializers.Serializer):
    """
    Serializer for changing password.
    """
    old_password = serializers.CharField(
        write_only=True,
        required=True,
        style={'input_type': 'password'}
    )
    new_password = serializers.CharField(
        write_only=True,
        required=True,
        style={'input_type': 'password'}
    )
    new_password_confirm = serializers.CharField(
        write_only=True,
        required=True,
        style={'input_type': 'password'}
    )

    def validate_new_password(self, value):
        """Validate new password strength."""
        password_validator = CustomPasswordValidator()
        try:
            password_validator.validate(value)
        except ValidationError as e:
            raise serializers.ValidationError(e.messages)
        return value

    def validate(self, attrs):
        """Validate that new passwords match."""
        if attrs.get('new_password') != attrs.pop('new_password_confirm'):
            raise serializers.ValidationError(
                {'new_password': 'New passwords do not match.'}
            )
        return attrs


class ActivityLogSerializer(serializers.ModelSerializer):
    """
    Serializer for activity logs.
    """
    user_email = serializers.CharField(source='user.email', read_only=True)
    action_display = serializers.CharField(source='get_action_display', read_only=True)
    device = serializers.SerializerMethodField()

    class Meta:
        from .models import ActivityLog
        model = ActivityLog
        fields = [
            'id', 'user', 'user_email', 'action', 'action_display',
            'description', 'ip_address', 'device', 'timestamp'
        ]
        read_only_fields = ['id', 'timestamp']

    def get_device(self, obj):
        return device_of(obj.user_agent)


def device_of(user_agent):
    """A rough device type from a browser's user-agent string."""
    agent = (user_agent or '').lower()
    if not agent:
        return 'unknown'
    if 'ipad' in agent or 'tablet' in agent:
        return 'tablet'
    if 'mobi' in agent or 'android' in agent or 'iphone' in agent:
        return 'mobile'
    return 'desktop'


class AdminActivityLogSerializer(ActivityLogSerializer):
    """Platform-wide activity for admins: also who did it."""
    user_name = serializers.CharField(source='user.get_full_name', read_only=True)

    class Meta(ActivityLogSerializer.Meta):
        fields = ActivityLogSerializer.Meta.fields + ['user_name']


class UserLogoutSerializer(serializers.Serializer):
    """
    Serializer for user logout.
    Accepts refresh token for token blacklisting.
    """
    refresh = serializers.CharField(required=True)


# ---------------------------------------------------------------- Sign-in with email codes

class LoginSerializer(serializers.Serializer):
    email = serializers.EmailField()
    password = serializers.CharField(write_only=True, style={'input_type': 'password'})
    remember = serializers.BooleanField(required=False, default=True)


class OTPVerifySerializer(serializers.Serializer):
    challenge = serializers.CharField()
    code = serializers.RegexField(r'^\d{6}$', error_messages={'invalid': 'Enter the 6-digit code from your email.'})


class OTPResendSerializer(serializers.Serializer):
    challenge = serializers.CharField()


class PasswordResetRequestSerializer(serializers.Serializer):
    email = serializers.EmailField()


class PasswordResetConfirmSerializer(OTPVerifySerializer):
    new_password = serializers.CharField(write_only=True)
    new_password_confirm = serializers.CharField(write_only=True)

    def validate_new_password(self, value):
        try:
            CustomPasswordValidator().validate(value)
        except ValidationError as e:
            raise serializers.ValidationError(e.messages)
        return value

    def validate(self, attrs):
        if attrs['new_password'] != attrs.pop('new_password_confirm'):
            raise serializers.ValidationError({'new_password_confirm': 'Passwords do not match.'})
        return attrs


# ---------------------------------------------------------------- Admin user management

class AdminUserSerializer(UserSerializer):
    """What administrators see about a user."""
    approved_by_name = serializers.SerializerMethodField()

    class Meta(UserSerializer.Meta):
        fields = UserSerializer.Meta.fields + ['approved_at', 'approved_by_name', 'rejection_reason', 'is_staff', 'updated_at']
        read_only_fields = fields

    def get_approved_by_name(self, obj):
        return obj.approved_by.get_full_name() if obj.approved_by else None


class AdminUserActionSerializer(serializers.Serializer):
    ACTIONS = ['approve', 'reject', 'suspend', 'activate', 'set_role']

    action = serializers.ChoiceField(choices=ACTIONS)
    role = serializers.ChoiceField(choices=User.ROLE_CHOICES, required=False)
    reason = serializers.CharField(required=False, allow_blank=True, max_length=500)

    def validate(self, attrs):
        if attrs['action'] == 'set_role' and not attrs.get('role'):
            raise serializers.ValidationError({'role': 'Choose a role.'})
        return attrs


class AdminBulkActionSerializer(serializers.Serializer):
    ids = serializers.ListField(child=serializers.IntegerField(), min_length=1, max_length=200)
    action = serializers.ChoiceField(choices=['approve', 'reject', 'suspend', 'activate'])
    reason = serializers.CharField(required=False, allow_blank=True, max_length=500)
