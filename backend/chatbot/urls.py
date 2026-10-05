from django.urls import path

from . import views

app_name = 'chatbot'

urlpatterns = [
    path('config/', views.ConfigView.as_view(), name='config'),
    path('chat/', views.ChatView.as_view(), name='chat'),
    path('rate/', views.RateView.as_view(), name='rate'),
    path('manage/settings/', views.ManageSettingsView.as_view(), name='manage-settings'),
    path('manage/conversations/', views.ManageConversationsView.as_view(), name='manage-conversations'),
    path('manage/conversations/<uuid:pk>/', views.ManageConversationView.as_view(), name='manage-conversation'),
    path('manage/knowledge/', views.ManageKnowledgeView.as_view(), name='manage-knowledge'),
    path('manage/test/', views.ManageTestView.as_view(), name='manage-test'),
]
