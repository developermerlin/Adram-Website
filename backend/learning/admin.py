from django.contrib import admin

from .models import Field, Note, NoteProgress, Topic


@admin.register(Field)
class FieldAdmin(admin.ModelAdmin):
    list_display = ('name', 'slug', 'is_published', 'sort_order')
    list_filter = ('is_published',)
    prepopulated_fields = {'slug': ('name',)}


@admin.register(Topic)
class TopicAdmin(admin.ModelAdmin):
    list_display = ('title', 'field', 'level', 'sort_order')
    list_filter = ('field', 'level')


@admin.register(Note)
class NoteAdmin(admin.ModelAdmin):
    list_display = ('title', 'field', 'topic', 'kind', 'is_published', 'updated_at')
    list_filter = ('field', 'kind', 'is_published')
    search_fields = ('title', 'summary', 'body')


@admin.register(NoteProgress)
class NoteProgressAdmin(admin.ModelAdmin):
    list_display = ('user', 'note', 'completed_at')
