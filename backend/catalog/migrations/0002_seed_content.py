"""
Loads the scholarships and training programmes the website showed before they moved into the database
(previously hard-coded in the frontend). Everything starts published so the public site doesn't change.
"""
import json
from pathlib import Path

from django.db import migrations

SEED_FILE = Path(__file__).with_name('seed_data.json')


def load(apps, schema_editor):
    Scholarship = apps.get_model('catalog', 'Scholarship')
    Course = apps.get_model('catalog', 'Course')
    data = json.loads(SEED_FILE.read_text(encoding='utf-8'))
    for row in data['scholarships']:
        Scholarship.objects.get_or_create(slug=row['slug'], defaults={**row, 'is_published': True})
    for row in data['courses']:
        Course.objects.get_or_create(slug=row['slug'], defaults={**row, 'is_published': True})


def unload(apps, schema_editor):
    data = json.loads(SEED_FILE.read_text(encoding='utf-8'))
    apps.get_model('catalog', 'Scholarship').objects.filter(slug__in=[r['slug'] for r in data['scholarships']]).delete()
    apps.get_model('catalog', 'Course').objects.filter(slug__in=[r['slug'] for r in data['courses']]).delete()


class Migration(migrations.Migration):
    dependencies = [('catalog', '0001_initial')]
    operations = [migrations.RunPython(load, unload)]
