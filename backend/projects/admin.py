from django.contrib import admin

from .models import Project


@admin.register(Project)
class ProjectAdmin(admin.ModelAdmin):
    list_display = ('title', 'client', 'service', 'status', 'featured', 'completed_on', 'sort_order')
    list_filter = ('status', 'featured', 'service')
    search_fields = ('title', 'client', 'summary')
    prepopulated_fields = {'slug': ('title',)}
