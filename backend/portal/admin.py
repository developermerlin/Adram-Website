from django.contrib import admin

from .models import (
    Application, ApplicationDocument, PaymentSettings, PortalEvent, SavedScholarship, ServiceRequest, StaffNote, StudyGoals,
)


class DocumentInline(admin.TabularInline):
    model = ApplicationDocument
    extra = 0


@admin.register(Application)
class ApplicationAdmin(admin.ModelAdmin):
    list_display = ('scholarship_name', 'student', 'stage', 'deadline', 'updated_at')
    list_filter = ('stage',)
    search_fields = ('scholarship_name', 'student__email', 'student__first_name', 'student__last_name')
    inlines = [DocumentInline]


@admin.register(PortalEvent)
class PortalEventAdmin(admin.ModelAdmin):
    list_display = ('user', 'kind', 'label', 'created_at')
    list_filter = ('kind',)
    search_fields = ('user__email', 'label')


@admin.register(ServiceRequest)
class ServiceRequestAdmin(admin.ModelAdmin):
    list_display = ('__str__', 'application', 'status', 'amount', 'payment_method', 'transaction_id', 'updated_at')
    list_filter = ('status', 'payment_method')
    search_fields = ('application__scholarship_name', 'application__student__email', 'transaction_id')


admin.site.register([StudyGoals, SavedScholarship, StaffNote, PaymentSettings])


from .models import Conversation, Message  # noqa: E402


class MessageInline(admin.TabularInline):
    model = Message
    extra = 0
    fields = ('created_at', 'from_staff', 'sender', 'body', 'read_at')
    readonly_fields = ('created_at',)


@admin.register(Conversation)
class ConversationAdmin(admin.ModelAdmin):
    list_display = ('user', 'last_message_at', 'created_at')
    search_fields = ('user__email', 'user__first_name', 'user__last_name')
    inlines = [MessageInline]
