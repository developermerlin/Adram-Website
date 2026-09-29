"""Applications already paid before progress timelines existed get the standard milestones."""
from django.db import migrations

MILESTONES = [
    ('Payment confirmed', 'done'),
    ('Documents reviewed', 'in_progress'),
    ('Essays and personal statements prepared', 'todo'),
    ('Application reviewed with you', 'todo'),
    ('Application submitted to the provider', 'todo'),
    ('Waiting for the provider’s decision', 'todo'),
]


def forwards(apps, schema_editor):
    ServiceRequest = apps.get_model('portal', 'ServiceRequest')
    Milestone = apps.get_model('portal', 'Milestone')
    for service in ServiceRequest.objects.filter(status='paid', application__milestones__isnull=True):
        Milestone.objects.bulk_create(
            Milestone(application_id=service.application_id, title=title, status=state, order=i,
                      completed_at=service.verified_at if state == 'done' else None)
            for i, (title, state) in enumerate(MILESTONES))


class Migration(migrations.Migration):
    dependencies = [('portal', '0006_document_review_and_milestones')]
    operations = [migrations.RunPython(forwards, migrations.RunPython.noop)]
