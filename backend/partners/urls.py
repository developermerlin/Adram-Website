from django.urls import path

from . import views

app_name = 'partners'

urlpatterns = [
    path('', views.PartnersView.as_view(), name='list'),
    path('apply/', views.ApplyView.as_view(), name='apply'),
    path('manage/partners/', views.ManagePartnersView.as_view(), name='manage-partners'),
    path('manage/partners/reorder/', views.ReorderView.as_view(), name='reorder'),
    path('manage/partners/<int:pk>/', views.ManagePartnerView.as_view(), name='manage-partner'),
    path('manage/groups/', views.ManageGroupsView.as_view(), name='manage-groups'),
    path('manage/groups/<int:pk>/', views.ManageGroupView.as_view(), name='manage-group'),
    path('manage/applications/', views.ApplicationsView.as_view(), name='applications'),
    path('manage/applications/<int:pk>/', views.ApplicationView.as_view(), name='application'),
]
