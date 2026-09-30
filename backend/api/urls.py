"""
API URL Configuration
All API v1 endpoints are defined here
"""
from django.urls import path, include

app_name = 'api'

urlpatterns = [
    # Authentication & User Management
    path('auth/', include('accounts.urls', namespace='auth')),
    # Scholarships and training programmes shown on the website
    path('catalog/', include('catalog.urls', namespace='catalog')),
    # Editable website wording and images (home, about, team, site-wide details)
    path('content/', include('cms.urls', namespace='cms')),
    # Course portal: video lessons, quizzes, progress and certificates for every training programme
    path('lms/', include('lms.urls', namespace='lms')),
    # Student portal (saved scholarships, applications) and the admin's view of it
    path('portal/', include('portal.urls', namespace='portal')),
]
