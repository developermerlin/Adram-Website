"""When an account gets the "Team member" role (created that way, or changed to it), its team profile is created."""
from django.contrib.auth import get_user_model
from django.db.models.signals import post_save
from django.dispatch import receiver


@receiver(post_save, sender=get_user_model())
def create_team_profile(sender, instance, created, raw=False, **kwargs):
    if raw or instance.role != sender.TEAM_MEMBER:
        return
    from .models import TeamProfile
    TeamProfile.for_user(instance)
