from django.urls import path

from . import views

app_name = 'projects'

urlpatterns = [
    path('', views.ProjectsView.as_view(), name='list'),
    path('manage/', views.ManageProjectsView.as_view(), name='manage'),
    path('manage/reorder/', views.ReorderView.as_view(), name='reorder'),
    path('manage/<int:pk>/', views.ManageProjectView.as_view(), name='manage-one'),
    path('<slug:slug>/', views.ProjectView.as_view(), name='detail'),
]
