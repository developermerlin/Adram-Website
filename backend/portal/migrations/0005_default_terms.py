"""Gives the payment settings the standard terms and conditions if none have been written yet."""
from pathlib import Path

from django.db import migrations

TERMS_FILE = Path(__file__).resolve().parent.parent / 'default_terms.txt'


def forwards(apps, schema_editor):
    PaymentSettings = apps.get_model('portal', 'PaymentSettings')
    terms = TERMS_FILE.read_text(encoding='utf-8').strip()
    row = PaymentSettings.objects.first()
    if row is None:
        PaymentSettings.objects.create(terms=terms)
    elif not row.terms.strip():
        row.terms = terms
        row.save(update_fields=['terms'])


class Migration(migrations.Migration):
    dependencies = [('portal', '0004_existing_service_requests')]
    operations = [migrations.RunPython(forwards, migrations.RunPython.noop)]
