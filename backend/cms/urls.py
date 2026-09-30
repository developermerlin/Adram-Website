from django.urls import path

from . import views

app_name = 'cms'

urlpatterns = [
    path('media/', views.MediaListCreate.as_view(), name='media'),
    path('media/<int:pk>/', views.MediaDelete.as_view(), name='media-delete'),
    path('manage/<slug:slug>/history/', views.PageHistory.as_view(), name='history'),
    path('manage/<slug:slug>/restore/<int:pk>/', views.RestoreRevision.as_view(), name='restore'),
    path('manage/<slug:slug>/', views.ManagePageContent.as_view(), name='manage'),
    path('<slug:slug>/', views.PublicPageContent.as_view(), name='page'),
]
