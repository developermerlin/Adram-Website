from django.apps import AppConfig


class TeamConfig(AppConfig):
    default_auto_field = 'django.db.models.BigAutoField'
    name = 'team'
    verbose_name = 'Team'

    def ready(self):
        from . import signals  # noqa: F401  (a team member's profile is created with their role)
