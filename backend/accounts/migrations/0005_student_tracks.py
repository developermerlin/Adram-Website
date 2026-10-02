from django.db import migrations, models


def sort_existing_students(apps, schema_editor):
    """Give existing students the side(s) they already use: courses → training; scholarships → scholarships."""
    User = apps.get_model('accounts', 'User')
    ids = lambda app, model, field: set(apps.get_model(app, model).objects.values_list(field, flat=True))  # noqa: E731
    training = (ids('portal', 'TrainingEnrollment', 'student_id') | ids('lms', 'CartItem', 'student_id')
                | ids('lms', 'Wishlist', 'student_id') | ids('lms', 'Order', 'student_id'))
    scholarships = ids('portal', 'Application', 'student_id') | ids('portal', 'SavedScholarship', 'user_id')
    goals = apps.get_model('portal', 'StudyGoals').objects.all()
    scholarships |= {g.user_id for g in goals if g.levels or g.destinations or g.field_of_study}
    students = User.objects.filter(role='STUDENT')
    students.filter(pk__in=training).update(in_training=True)
    students.filter(pk__in=scholarships).update(in_scholarships=True)


class Migration(migrations.Migration):

    dependencies = [
        ('accounts', '0004_alter_user_role'),
        ('portal', '0014_calls'),
        ('lms', '0007_resource_order'),
    ]

    operations = [
        migrations.AddField(
            model_name='user',
            name='in_scholarships',
            field=models.BooleanField(default=False, help_text='Uses the scholarships side: applications, documents, services.'),
        ),
        migrations.AddField(
            model_name='user',
            name='in_training',
            field=models.BooleanField(default=False, help_text='Uses the training side: courses, learning, certificates.'),
        ),
        migrations.RunPython(sort_existing_students, migrations.RunPython.noop),
    ]
