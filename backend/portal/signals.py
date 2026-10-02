from django.db.models.signals import post_save
from django.dispatch import receiver

from .models import Application, SavedScholarship, TrainingEnrollment


# Doing something on one side of the portal adds that side to the student's account (see User.join_track).
@receiver(post_save, sender=TrainingEnrollment)
def enrolled_on_training(sender, instance, created, **kwargs):
    if created:
        instance.student.join_track('training')


@receiver(post_save, sender=Application)
def started_an_application(sender, instance, created, **kwargs):
    if created:
        instance.student.join_track('scholarships')


@receiver(post_save, sender=SavedScholarship)
def saved_a_scholarship(sender, instance, created, **kwargs):
    if created:
        instance.user.join_track('scholarships')
