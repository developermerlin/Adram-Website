from django.apps import AppConfig


class PortalConfig(AppConfig):
    default_auto_field = 'django.db.models.BigAutoField'
    name = 'portal'
    verbose_name = 'Student portal'

    def ready(self):
        from . import signals  # noqa: F401  (adds the training/scholarships side to a student's account)
