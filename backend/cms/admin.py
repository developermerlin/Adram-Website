from django.contrib import admin

from .models import PageContent, PageRevision, SiteImage


@admin.register(PageContent)
class PageContentAdmin(admin.ModelAdmin):
    list_display = ('slug', 'updated_at', 'updated_by')
    readonly_fields = ('updated_at', 'updated_by')


@admin.register(SiteImage)
class SiteImageAdmin(admin.ModelAdmin):
    list_display = ('name', 'created_at', 'uploaded_by')
    readonly_fields = ('created_at', 'uploaded_by')


@admin.register(PageRevision)
class PageRevisionAdmin(admin.ModelAdmin):
    list_display = ('slug', 'action', 'created_at', 'user')
    list_filter = ('slug', 'action')
    readonly_fields = ('slug', 'data', 'action', 'created_at', 'user')
