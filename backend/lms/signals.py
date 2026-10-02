from django.db import transaction
from django.db.models import F
from django.db.models.signals import post_delete, post_save, pre_save
from django.dispatch import receiver
from django.utils import timezone

from catalog.models import Course

from .models import CartItem, CourseViewDay, Lesson, LessonCaption, Order, OrderItem, Resource, Submission, SubmissionFile, Wishlist


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


@receiver(post_delete, sender=LessonCaption)
def delete_caption_file(sender, instance, **kwargs):
    _remove(instance.file)


@receiver(post_delete, sender=SubmissionFile)
def delete_handed_in_file(sender, instance, **kwargs):
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


@receiver(post_save, sender=CartItem)
@receiver(post_save, sender=Wishlist)
@receiver(post_save, sender=Order)
def joined_training(sender, instance, created, **kwargs):
    """Adding a course to the cart or wishlist, or ordering one, adds the training side to the student's account."""
    if created:
        instance.student.join_track('training')


# ---------------------------------------------------------------- the sales funnel (counted per course per day)

def count(course_id, field):
    row, _ = CourseViewDay.objects.get_or_create(course_id=course_id, date=timezone.localdate())
    CourseViewDay.objects.filter(pk=row.pk).update(**{field: F(field) + 1})


@receiver(post_save, sender=Wishlist)
def counted_wishlist(sender, instance, created, **kwargs):
    if created:
        count(instance.course_id, 'wishlist_adds')


@receiver(post_save, sender=CartItem)
def counted_cart(sender, instance, created, **kwargs):
    if created:
        count(instance.course_id, 'cart_adds')


@receiver(post_save, sender=OrderItem)
def counted_checkout(sender, instance, created, **kwargs):
    if created and instance.course_id:
        count(instance.course_id, 'checkouts')


# ---------------------------------------------------------------- telling followers about a new course

@receiver(pre_save, sender=Course)
def remember_published(sender, instance, **kwargs):
    instance._was_published = bool(instance.pk) and Course.objects.filter(pk=instance.pk, is_published=True).exists()


@receiver(post_save, sender=Course)
def announce_new_course(sender, instance, **kwargs):
    if instance.is_published and not getattr(instance, '_was_published', True) and instance.instructor_id:
        from .followers import tell_followers
        transaction.on_commit(lambda: tell_followers(instance))
