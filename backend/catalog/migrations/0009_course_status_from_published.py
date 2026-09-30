from django.db import migrations


def forwards(apps, schema_editor):
    """Courses already on the website are published; the rest start as drafts."""
    Course = apps.get_model('catalog', 'Course')
    Course.objects.filter(is_published=True).update(status='published')
    for course in Course.objects.filter(is_published=True, published_at__isnull=True):
        course.published_at = course.updated_at
        course.save(update_fields=['published_at'])
    Course.objects.filter(is_published=False).update(status='draft')


class Migration(migrations.Migration):
    dependencies = [('catalog', '0008_course_currency_course_discount_price_course_faqs_and_more')]
    operations = [migrations.RunPython(forwards, migrations.RunPython.noop)]
