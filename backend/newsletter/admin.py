from django.contrib import admin

from .models import Delivery, Issue, NewsletterSettings, Subscriber


@admin.register(Subscriber)
class SubscriberAdmin(admin.ModelAdmin):
    list_display = ('email', 'name', 'status', 'source', 'created_at', 'confirmed_at')
    list_filter = ('status', 'source')
    search_fields = ('email', 'name')


@admin.register(Issue)
class IssueAdmin(admin.ModelAdmin):
    list_display = ('subject', 'status', 'created_at', 'sent_at')


admin.site.register(Delivery)
admin.site.register(NewsletterSettings)
