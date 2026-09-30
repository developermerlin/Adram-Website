from django.contrib import admin
from django.urls import path, re_path, include
from django.conf import settings
from django.conf.urls.static import static
from django.views.static import serve
from rest_framework import permissions
from cms.spa import spa
from drf_yasg.views import get_schema_view
from drf_yasg import openapi


schema_view = get_schema_view(
   openapi.Info(
      title="Adram Technologies",
      default_version='v1',
      description="This is the API documentation for Adram Technologies project APIs",
      terms_of_service="https://www.google.com/policies/terms/",
      contact=openapi.Contact(email="letscodewithmerlin@gmail.com"),
      license=openapi.License(name="BSD License"),
   ),
   public=True,
   permission_classes=(permissions.AllowAny,),
)

# The website's own admin portal lives under /admin/..., so when Django serves the website its built-in
# administration site moves to /django-admin/.
urlpatterns = [
    path('django-admin/' if settings.SERVE_FRONTEND else 'admin/', admin.site.urls),
    path('swagger<format>/', schema_view.without_ui(cache_timeout=0), name='schema-json'),
    path('redoc/', schema_view.with_ui('redoc', cache_timeout=0), name='schema-redoc'),
    path('api/v1/', include('api.urls')),
    path('api/contact/', include('contact.urls')),
]

if settings.SERVE_FRONTEND:
    # One server for everything: the API, uploaded photos and the website itself. The API docs move to /swagger/.
    urlpatterns += [
        path('swagger/', schema_view.with_ui('swagger', cache_timeout=0), name='schema-swagger-ui'),
        re_path(r'^media/(?P<path>.*)$', serve, {'document_root': settings.MEDIA_ROOT}),
        re_path(r'^static/(?P<path>.*)$', serve, {'document_root': settings.STATIC_ROOT}),
        re_path(r'^(?P<path>.*)$', spa, name='website'),  # must stay last
    ]
else:
    urlpatterns += [path('', schema_view.with_ui('swagger', cache_timeout=0), name='schema-swagger-ui')]
    urlpatterns += static(settings.MEDIA_URL, document_root=settings.MEDIA_ROOT)
    urlpatterns += static(settings.STATIC_URL, document_root=settings.STATIC_ROOT)
