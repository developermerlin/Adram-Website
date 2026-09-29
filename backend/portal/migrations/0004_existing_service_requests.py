"""Applications where the student already asked ADRAM to apply become requests waiting for review."""
from django.db import migrations


def forwards(apps, schema_editor):
    Application = apps.get_model('portal', 'Application')
    ServiceRequest = apps.get_model('portal', 'ServiceRequest')
    for application in Application.objects.filter(service_requested_at__isnull=False, service__isnull=True):
        request = ServiceRequest.objects.create(application=application, status='requested')
        # keep the original request time rather than "now"
        ServiceRequest.objects.filter(pk=request.pk).update(requested_at=application.service_requested_at)


class Migration(migrations.Migration):
    dependencies = [('portal', '0003_service_payments')]
    operations = [migrations.RunPython(forwards, migrations.RunPython.noop)]
