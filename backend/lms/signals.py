from django.db.models.signals import post_delete, pre_save
from django.dispatch import receiver

from .models import Lesson, Order, Resource, Submission


def _remove(field):
    if field and field.name:
        field.storage.delete(field.name)


@receiver(post_delete, sender=Lesson)
def delete_lesson_files(sender, instance, **kwargs):
    _remove(instance.video_file)
    _remove(instance.document_file)


@receiver(post_delete, sender=Resource)
def delete_resource_file(sender, instance, **kwargs):
    _remove(instance.file)


@receiver(post_delete, sender=Order)
def delete_receipt(sender, instance, **kwargs):
    _remove(instance.receipt)


@receiver(post_delete, sender=Submission)
def delete_submission_file(sender, instance, **kwargs):
    _remove(instance.file)


@receiver(pre_save, sender=Lesson)
def delete_replaced_files(sender, instance, **kwargs):
    """Uploading a new video or document (or clearing it) removes the file it replaces."""
    if not instance.pk:
        return
    previous = Lesson.objects.filter(pk=instance.pk).values('video_file', 'document_file').first()
    if not previous:
        return
    if previous['video_file'] and previous['video_file'] != (instance.video_file.name or ''):
        instance.video_file.storage.delete(previous['video_file'])
    if previous['document_file'] and previous['document_file'] != (instance.document_file.name or ''):
        instance.document_file.storage.delete(previous['document_file'])
