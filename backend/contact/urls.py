from django.urls import path, include
from rest_framework.routers import DefaultRouter
from . import views

router = DefaultRouter()
router.register(r'messages', views.ContactMessageViewSet)

urlpatterns = [
    path('', views.create_contact_message, name='create-contact-message'),
    path('api/', include(router.urls)),
]
