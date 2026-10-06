from django.urls import path

from . import views
from .models import Field, Note, Topic

app_name = 'learning'

urlpatterns = [
    path('fields/', views.FieldsView.as_view(), name='fields'),
    path('fields/<slug:slug>/', views.FieldView.as_view(), name='field'),
    path('fields/<slug:slug>/notes/<slug:note>/', views.NoteView.as_view(), name='note'),
    path('fields/<slug:slug>/pdf/', views.FieldPdfView.as_view(), name='pdf'),
    path('notes/<int:pk>/progress/', views.ProgressView.as_view(), name='progress'),
    path('search/', views.SearchView.as_view(), name='search'),
    path('me/', views.MyLearningView.as_view(), name='me'),
    path('manage/fields/', views.ManageFieldsView.as_view(), name='manage-fields'),
    path('manage/fields/reorder/', views.ReorderView.as_view(model=Field), name='reorder-fields'),
    path('manage/fields/<int:pk>/', views.ManageFieldView.as_view(), name='manage-field'),
    path('manage/fields/<int:pk>/publish-notes/', views.PublishNotesView.as_view(), name='publish-notes'),
    path('manage/topics/', views.ManageTopicsView.as_view(), name='manage-topics'),
    path('manage/topics/reorder/', views.ReorderView.as_view(model=Topic), name='reorder-topics'),
    path('manage/topics/<int:pk>/', views.ManageTopicView.as_view(), name='manage-topic'),
    path('manage/notes/', views.ManageNotesView.as_view(), name='manage-notes'),
    path('manage/notes/reorder/', views.ReorderView.as_view(model=Note), name='reorder-notes'),
    path('manage/notes/<int:pk>/', views.ManageNoteView.as_view(), name='manage-note'),
    path('manage/upload/', views.UploadView.as_view(), name='upload'),
]
