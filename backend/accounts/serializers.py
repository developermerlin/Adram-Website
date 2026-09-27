from rest_framework import serializers
from django.contrib.auth import get_user_model
from django.contrib.auth.password_validation import validate_password
from django.core.exceptions import ValidationError
from rest_framework_simplejwt.serializers import TokenObtainPairSerializer
from rest_framework_simplejwt.tokens import RefreshToken

from .validators import validate_unique_email, validate_phone_number, CustomPasswordValidator

User = get_user_model()


class UserSerializer(serializers.ModelSerializer):
    """
    Serializer for User model - used for read operations and profile display.
    """
    full_name = serializers.SerializerMethodField()
    role_display = serializers.CharField(source='get_role_display', read_only=True)

    class Meta:
        model = User
        fields = [
            'id', 'email', 'first_name', 'last_name', 'full_name',
            'phone_number', 'country', 'profile_picture', 'role',
            'role_display', 'is_verified', 'is_active', 'created_at'
        ]
        read_only_fields = ['id', 'created_at', 'is_verified', 'is_active']

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


class CustomTokenObtainPairSerializer(TokenObtainPairSerializer):
    """
    Custom serializer for token pair generation with user information.
    """

    def get_token(self, user):
        token = super().get_token(user)
        
        # Add custom claims
        token['email'] = user.email
        token['role'] = user.role
        token['first_name'] = user.first_name
        token['last_name'] = user.last_name
        token['is_verified'] = user.is_verified
        
        return token

    def validate(self, attrs):
        data = super().validate(attrs)
        
        # Add user information
        user = self.user
        data['user'] = UserSerializer(user).data
        
        return data


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


class ForgotPasswordSerializer(serializers.Serializer):
    """
    Serializer for forgot password (password reset request).
    """
    email = serializers.EmailField(required=True)

    def validate_email(self, value):
        """Check if email exists in database."""
        if not User.objects.filter(email=value).exists():
            raise serializers.ValidationError(
                'No user found with this email address.'
            )
        return value


class ResetPasswordSerializer(serializers.Serializer):
    """
    Serializer for resetting password with token.
    """
    token = serializers.CharField(required=True)
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

    class Meta:
        from .models import ActivityLog
        model = ActivityLog
        fields = [
            'id', 'user', 'user_email', 'action', 'action_display',
            'description', 'ip_address', 'timestamp'
        ]
        read_only_fields = ['id', 'timestamp']


class UserLogoutSerializer(serializers.Serializer):
    """
    Serializer for user logout.
    Accepts refresh token for token blacklisting.
    """
    refresh = serializers.CharField(required=True)
