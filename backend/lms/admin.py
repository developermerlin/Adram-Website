from django.contrib import admin

from .models import (
    AuditLog, Certificate, Coupon, Lesson, LmsSettings, Order, OrderItem, Payout, Progress, QuizAttempt, Report, Section, Submission,
    Transaction,
)


class LessonInline(admin.TabularInline):
    model = Lesson
    extra = 0
    fields = ('title', 'kind', 'sort_order', 'is_published', 'is_preview')
    show_change_link = True


@admin.register(Section)
class SectionAdmin(admin.ModelAdmin):
    list_display = ('title', 'course', 'sort_order')
    list_filter = ('course',)
    inlines = [LessonInline]


@admin.register(Certificate)
class CertificateAdmin(admin.ModelAdmin):
    list_display = ('code', 'enrollment', 'issued_at')
    readonly_fields = ('code', 'enrollment', 'issued_at')


admin.site.register(Progress)
admin.site.register(QuizAttempt)


class OrderItemInline(admin.TabularInline):
    model = OrderItem
    extra = 0


class TransactionInline(admin.TabularInline):
    model = Transaction
    extra = 0


@admin.register(Order)
class OrderAdmin(admin.ModelAdmin):
    list_display = ('number', 'student', 'status', 'total', 'provider', 'created_at')
    list_filter = ('status', 'provider')
    search_fields = ('number', 'student__email', 'transaction_id')
    inlines = [OrderItemInline, TransactionInline]


@admin.register(AuditLog)
class AuditLogAdmin(admin.ModelAdmin):
    list_display = ('created_at', 'actor', 'action', 'target_label')
    list_filter = ('action',)
    search_fields = ('target_label', 'actor__email')

    def has_change_permission(self, request, obj=None):
        return False  # the audit trail is read-only


admin.site.register(Coupon)
admin.site.register(LmsSettings)
admin.site.register(Payout)
admin.site.register(Report)
admin.site.register(Submission)
