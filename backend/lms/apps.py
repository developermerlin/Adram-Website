from django.apps import AppConfig


class LmsConfig(AppConfig):
    default_auto_field = 'django.db.models.BigAutoField'
    name = 'lms'
    verbose_name = 'Course portal (LMS)'

    def ready(self):
        from . import signals  # noqa: F401  (removes uploaded files when their lesson is deleted)
