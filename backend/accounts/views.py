from rest_framework import viewsets, status, generics
from rest_framework.decorators import action
from rest_framework.response import Response
from rest_framework.permissions import AllowAny, IsAuthenticated
from rest_framework_simplejwt.views import TokenObtainPairView, TokenRefreshView
from rest_framework_simplejwt.tokens import RefreshToken
from django.contrib.auth import get_user_model
from django.utils.decorators import method_decorator
from django.views.decorators.csrf import csrf_exempt
import logging

from .serializers import (
    UserSerializer, UserRegistrationSerializer, CustomTokenObtainPairSerializer,
    UserUpdateSerializer, ChangePasswordSerializer, ActivityLogSerializer, ForgotPasswordSerializer,
    UserLogoutSerializer
)
from .permissions import IsAdminOrOwner
from .models import ActivityLog

User = get_user_model()
logger = logging.getLogger(__name__)


def get_client_ip(request):
    """Extract client IP address from request."""
    x_forwarded_for = request.META.get('HTTP_X_FORWARDED_FOR')
    if x_forwarded_for:
        ip = x_forwarded_for.split(',')[0]
    else:
        ip = request.META.get('REMOTE_ADDR')
    return ip


def get_user_agent(request):
    """Extract user agent from request."""
    return request.META.get('HTTP_USER_AGENT', '')


def log_activity(user, action, description='', request=None):
    """Log user activity."""
    try:
        ActivityLog.objects.create(
            user=user,
            action=action,
            description=description,
            ip_address=get_client_ip(request) if request else None,
            user_agent=get_user_agent(request) if request else None,
        )
    except Exception as e:
        logger.error(f"Error logging activity: {str(e)}")


class UserRegistrationView(generics.CreateAPIView):
    """
    User registration endpoint.
    POST /api/auth/register/
    """
    queryset = User.objects.all()
    serializer_class = UserRegistrationSerializer
    permission_classes = [AllowAny]

    def create(self, request, *args, **kwargs):
        serializer = self.get_serializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        user = serializer.save()
        
        # Log registration activity
        log_activity(user, ActivityLog.REGISTRATION, 'User registered', request)
        
        # Generate tokens
        refresh = RefreshToken.for_user(user)
        
        response_data = {
            'message': 'User registered successfully',
            'user': UserSerializer(user).data,
            'access': str(refresh.access_token),
            'refresh': str(refresh),
        }
        
        return Response(response_data, status=status.HTTP_201_CREATED)


class CustomTokenObtainPairView(TokenObtainPairView):
    """
    Custom login endpoint with user information.
    POST /api/auth/login/
    Input: email, password
    Returns: access token, refresh token, user profile
    """
    serializer_class = CustomTokenObtainPairSerializer
    permission_classes = [AllowAny]

    def post(self, request, *args, **kwargs):
        response = super().post(request, *args, **kwargs)
        
        # Log successful login
        if response.status_code == 200:
            user = User.objects.get(email=request.data.get('email'))
            log_activity(user, ActivityLog.LOGIN, 'User logged in', request)
        else:
            # Log failed login attempt
            email = request.data.get('email')
            if email:
                try:
                    user = User.objects.get(email=email)
                    log_activity(user, ActivityLog.FAILED_LOGIN, 'Failed login attempt', request)
                except User.DoesNotExist:
                    pass
        
        return response


class UserLogoutView(generics.GenericAPIView):
    """
    User logout endpoint.
    POST /api/auth/logout/
    Blacklists the refresh token.
    """
    serializer_class = UserLogoutSerializer
    permission_classes = [IsAuthenticated]

    def post(self, request):
        try:
            refresh_token = request.data.get('refresh')
            if not refresh_token:
                return Response(
                    {'detail': 'Refresh token is required.'},
                    status=status.HTTP_400_BAD_REQUEST
                )
            
            token = RefreshToken(refresh_token)
            token.blacklist()
            
            # Log logout activity
            log_activity(request.user, ActivityLog.LOGOUT, 'User logged out', request)
            
            return Response(
                {'message': 'Logged out successfully'},
                status=status.HTTP_200_OK
            )
        except Exception as e:
            return Response(
                {'detail': str(e)},
                status=status.HTTP_400_BAD_REQUEST
            )


class UserProfileView(generics.RetrieveAPIView):
    """
    Get current user profile.
    GET /api/auth/profile/
    """
    serializer_class = UserSerializer
    permission_classes = [IsAuthenticated]

    def get_object(self):
        return self.request.user


class UserProfileUpdateView(generics.UpdateAPIView):
    """
    Update user profile.
    PUT /api/auth/profile/update/
    """
    serializer_class = UserUpdateSerializer
    permission_classes = [IsAuthenticated]

    def get_object(self):
        return self.request.user

    def perform_update(self, serializer):
        serializer.save()
        log_activity(
            self.request.user,
            ActivityLog.PROFILE_UPDATE,
            'User updated profile',
            self.request
        )


class ChangePasswordView(generics.GenericAPIView):
    """
    Change password endpoint.
    POST /api/auth/change-password/
    """
    serializer_class = ChangePasswordSerializer
    permission_classes = [IsAuthenticated]

    def post(self, request):
        serializer = self.get_serializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        
        user = request.user
        old_password = serializer.validated_data['old_password']
        new_password = serializer.validated_data['new_password']
        
        # Verify old password
        if not user.check_password(old_password):
            return Response(
                {'detail': 'Old password is incorrect.'},
                status=status.HTTP_400_BAD_REQUEST
            )
        
        # Set new password
        user.set_password(new_password)
        user.save()
        
        # Log password change
        log_activity(user, ActivityLog.PASSWORD_CHANGE, 'User changed password', request)
        
        return Response(
            {'message': 'Password changed successfully'},
            status=status.HTTP_200_OK
        )


class ForgotPasswordView(generics.GenericAPIView):
    """
    Forgot password endpoint (placeholder for email integration).
    POST /api/auth/forgot-password/
    """
    serializer_class = ForgotPasswordSerializer
    permission_classes = [AllowAny]

    def post(self, request):
        email = request.data.get('email')
        
        try:
            user = User.objects.get(email=email)
            # TODO: Send password reset email
            log_activity(user, ActivityLog.PASSWORD_RESET, 'Password reset requested', request)
            
            return Response(
                {'message': 'If email exists, password reset link will be sent.'},
                status=status.HTTP_200_OK
            )
        except User.DoesNotExist:
            # Don't reveal if email exists
            return Response(
                {'message': 'If email exists, password reset link will be sent.'},
                status=status.HTTP_200_OK
            )


class UserActivityLogView(generics.ListAPIView):
    """
    View user activity logs.
    GET /api/auth/activity-logs/
    """
    serializer_class = ActivityLogSerializer
    permission_classes = [IsAuthenticated]

    def get_queryset(self):
        """
        Return activity logs for the current user only.
        """
        return ActivityLog.objects.filter(user=self.request.user)


class UserListView(generics.ListAPIView):
    """
    Admin endpoint to list all users.
    GET /api/auth/users/
    """
    queryset = User.objects.all()
    serializer_class = UserSerializer
    permission_classes = [IsAuthenticated]
    search_fields = ['email', 'first_name', 'last_name']
    ordering_fields = ['created_at', 'email']

    def get_queryset(self):
        """Filter by role if role parameter is provided."""
        queryset = super().get_queryset()
        role = self.request.query_params.get('role')
        if role:
            queryset = queryset.filter(role=role)
        return queryset

