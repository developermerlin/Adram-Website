from django.urls import path

from . import views

app_name = 'blog'

urlpatterns = [
    path('posts/', views.PostListView.as_view(), name='posts'),
    path('posts/<slug:slug>/', views.PostDetailView.as_view(), name='post'),
    path('posts/<slug:slug>/feedback/', views.FeedbackView.as_view(), name='feedback'),
    path('categories/', views.CategoryListView.as_view(), name='categories'),
    path('manage/posts/', views.ManagePostsView.as_view(), name='manage-posts'),
    path('manage/posts/<int:pk>/', views.ManagePostView.as_view(), name='manage-post'),
    path('manage/categories/', views.ManageCategoriesView.as_view(), name='manage-categories'),
    path('manage/categories/<int:pk>/', views.ManageCategoryView.as_view(), name='manage-category'),
    path('manage/authors/', views.AuthorsView.as_view(), name='authors'),
]
