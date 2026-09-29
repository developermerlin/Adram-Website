from django.urls import path
from rest_framework_simplejwt.views import TokenRefreshView
from .oauth import OAuthCallbackView, OAuthExchangeView, OAuthProvidersView, OAuthStartView
from .admin_views import ActivityOverviewView, PlatformActivityView, UserActionView, UserBulkActionView, UserDetailView, UserInsightsView, UserListView, UserOverviewView, UserStatsView
from .views import (
    ChangePasswordView,
    LoginView,
    OTPResendView,
    OTPVerifyView,
    PasswordResetConfirmView,
    PasswordResetRequestView,
    UserActivityLogView,
    MyActivityOverviewView,
    UserLogoutView,
    UserProfileUpdateView,
    UserProfileView,
    UserRegistrationView,
)

app_name = 'accounts'

urlpatterns = [
    # Authentication
    path('register/', UserRegistrationView.as_view(), name='register'),
    path('login/', LoginView.as_view(), name='login'),
    path('otp/verify/', OTPVerifyView.as_view(), name='otp_verify'),
    path('otp/resend/', OTPResendView.as_view(), name='otp_resend'),
    path('logout/', UserLogoutView.as_view(), name='logout'),
    path('token/refresh/', TokenRefreshView.as_view(), name='token_refresh'),

    # Social sign-in (Google, Facebook, GitHub)
    path('oauth/providers/', OAuthProvidersView.as_view(), name='oauth_providers'),
    path('oauth/exchange/', OAuthExchangeView.as_view(), name='oauth_exchange'),
    path('oauth/<str:provider>/start/', OAuthStartView.as_view(), name='oauth_start'),
    path('oauth/<str:provider>/callback/', OAuthCallbackView.as_view(), name='oauth_callback'),
    
    # User Profile
    path('profile/', UserProfileView.as_view(), name='profile'),
    path('profile/update/', UserProfileUpdateView.as_view(), name='profile_update'),
    
    # Password Management
    path('change-password/', ChangePasswordView.as_view(), name='change_password'),
    path('password-reset/request/', PasswordResetRequestView.as_view(), name='password_reset_request'),
    path('password-reset/confirm/', PasswordResetConfirmView.as_view(), name='password_reset_confirm'),
    
    # Activity and Admin
    path('activity-logs/', UserActivityLogView.as_view(), name='activity_logs'),
    path('activity-logs/overview/', MyActivityOverviewView.as_view(), name='my_activity_overview'),    path('users/', UserListView.as_view(), name='user_list'),
    path('users/stats/', UserStatsView.as_view(), name='user_stats'),
    path('users/insights/', UserInsightsView.as_view(), name='user_insights'),
    path('users/overview/', UserOverviewView.as_view(), name='user_overview'),
    path('activity/', PlatformActivityView.as_view(), name='platform_activity'),
    path('activity/overview/', ActivityOverviewView.as_view(), name='activity_overview'),
    path('users/bulk/', UserBulkActionView.as_view(), name='user_bulk_action'),
    path('users/<int:pk>/', UserDetailView.as_view(), name='user_detail'),
    path('users/<int:pk>/action/', UserActionView.as_view(), name='user_action'),
]
