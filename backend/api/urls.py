"""
API URL Configuration
All API v1 endpoints are defined here
"""
from django.urls import path, include

app_name = 'api'

urlpatterns = [
    # Authentication & User Management
    path('auth/', include('accounts.urls', namespace='auth')),
]
