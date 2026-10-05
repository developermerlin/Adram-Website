from django.urls import path, include
from rest_framework.routers import DefaultRouter
from . import views

router = DefaultRouter()
router.register(r'messages', views.ContactMessageViewSet)

urlpatterns = [
    # Public: POST /api/contact/
    path('', views.create_contact_message, name='create-contact-message'),
    # Admin only: /api/contact/stats/ (the Overview charts) and /api/contact/messages/
    path('stats/', views.EngagementStatsView.as_view(), name='contact-stats'),
    path('', include(router.urls)),
]
