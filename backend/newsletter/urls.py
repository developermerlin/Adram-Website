from django.urls import path

from . import views

app_name = 'newsletter'

urlpatterns = [
    path('form/', views.FormView.as_view(), name='form'),
    path('subscribe/', views.SubscribeView.as_view(), name='subscribe'),
    path('confirm/<str:token>/', views.ConfirmView.as_view(), name='confirm'),
    path('unsubscribe/<str:token>/', views.UnsubscribeView.as_view(), name='unsubscribe'),
    path('resubscribe/<str:token>/', views.ResubscribeView.as_view(), name='resubscribe'),
    path('c/<str:token>/', views.ClickView.as_view(), name='click'),
    path('manage/overview/', views.OverviewView.as_view(), name='overview'),
    path('manage/subscribers/', views.SubscribersView.as_view(), name='subscribers'),
    path('manage/subscribers/import/', views.ImportView.as_view(), name='import'),
    path('manage/subscribers/export/', views.ExportView.as_view(), name='export'),
    path('manage/subscribers/<int:pk>/', views.SubscriberView.as_view(), name='subscriber'),
    path('manage/settings/', views.SettingsView.as_view(), name='settings'),
    path('manage/issues/', views.IssuesView.as_view(), name='issues'),
    path('manage/issues/preview/', views.PreviewView.as_view(), name='preview'),
    path('manage/issues/<int:pk>/', views.IssueView.as_view(), name='issue'),
    path('manage/issues/<int:pk>/test/', views.IssueTestView.as_view(), name='issue-test'),
    path('manage/issues/<int:pk>/send/', views.IssueSendView.as_view(), name='issue-send'),
]
