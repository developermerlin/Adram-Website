from django.contrib import admin

from .models import Partner, PartnerApplication, PartnerGroup


@admin.register(PartnerGroup)
class PartnerGroupAdmin(admin.ModelAdmin):
    list_display = ('name', 'sort_order')


@admin.register(Partner)
class PartnerAdmin(admin.ModelAdmin):
    list_display = ('name', 'group', 'featured', 'visible', 'sort_order')
    list_filter = ('group', 'featured', 'visible')
    search_fields = ('name',)


@admin.register(PartnerApplication)
class PartnerApplicationAdmin(admin.ModelAdmin):
    list_display = ('organisation', 'contact_name', 'email', 'partnership_type', 'status', 'created_at')
    list_filter = ('status',)
    search_fields = ('organisation', 'contact_name', 'email')
