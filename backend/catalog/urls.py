from django.urls import include, path
from rest_framework.routers import DefaultRouter

from . import views

router = DefaultRouter()
router.register('scholarships', views.ScholarshipManageViewSet, basename='manage-scholarship')
router.register('courses', views.CourseManageViewSet, basename='manage-course')

app_name = 'catalog'

urlpatterns = [
    # Public website
    path('scholarships/', views.PublicScholarshipList.as_view(), name='scholarships'),
    path('scholarships/<slug:slug>/', views.PublicScholarshipDetail.as_view(), name='scholarship'),
    path('courses/', views.PublicCourseList.as_view(), name='courses'),
    # Admin portal
    path('manage/', include(router.urls)),
]
