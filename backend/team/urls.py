from django.urls import path

from . import views

app_name = 'team'

urlpatterns = [
    path('members/', views.MembersView.as_view(), name='members'),
    path('members/<slug:slug>/', views.MemberView.as_view(), name='member'),
    path('members/<slug:slug>/cv/', views.MemberCVView.as_view(), name='member-cv'),
    path('manage/', views.ManageListView.as_view(), name='manage'),
    path('manage/reorder/', views.ReorderView.as_view(), name='reorder'),
    path('manage/<int:pk>/', views.ManageDetailView.as_view(), name='manage-detail'),
    path('manage/<int:pk>/cv/', views.ManageCVView.as_view(), name='manage-cv'),
    path('me/', views.MyProfileView.as_view(), name='me'),
    path('me/cv/', views.MyCVView.as_view(), name='me-cv'),
]
