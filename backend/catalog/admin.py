from django.contrib import admin

from .models import Course, Scholarship


@admin.register(Scholarship)
class ScholarshipAdmin(admin.ModelAdmin):
    list_display = ('name', 'country', 'funding', 'is_published', 'sort_order', 'updated_at')
    list_filter = ('is_published', 'country', 'funding')
    list_editable = ('is_published', 'sort_order')
    search_fields = ('name', 'provider', 'fields')
    readonly_fields = ('created_at', 'updated_at', 'updated_by')


@admin.register(Course)
class CourseAdmin(admin.ModelAdmin):
    list_display = ('title', 'is_published', 'sort_order', 'next_intake', 'updated_at')
    list_filter = ('is_published',)
    list_editable = ('is_published', 'sort_order')
    search_fields = ('title', 'summary')
    readonly_fields = ('created_at', 'updated_at', 'updated_by')
