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
    # Website newsletter: footer sign-ups, confirmation, unsubscribe, and the admin's subscribers and issues
    path('newsletter/', include('newsletter.urls', namespace='newsletter')),
    # Website blog: published articles and categories, and the admin's editor
    path('blog/', include('blog.urls', namespace='blog')),
    # Partners page: partner logos and quotes, and applications to become a partner
    path('partners/', include('partners.urls', namespace='partners')),
    # Completed projects (case studies) on the Projects page, managed in Admin → Projects
    path('projects/', include('projects.urls', namespace='projects')),
    # Learning hub: free notes from zero to hero by field, managed in Admin → Learning
    path('learning/', include('learning.urls', namespace='learning')),
    path('team/', include('team.urls', namespace='team')),
    path('chatbot/', include('chatbot.urls', namespace='chatbot')),
]
