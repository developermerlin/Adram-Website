import django.db.models.deletion
from django.conf import settings
from django.db import migrations, models

import portal.models


def forwards(apps, schema_editor):
    """Unsigned agreements now follow the template; keep a fee that was clearly set for one student."""
    Template = apps.get_model('portal', 'AgreementTemplate')
    Agreement = apps.get_model('portal', 'StudentAgreement')
    t = Template.objects.first()
    for ag in Agreement.objects.filter(status='pending'):
        ag.own_fee = bool(ag.amount is not None and t and t.default_amount is not None and ag.amount != t.default_amount)
        ag.save(update_fields=['own_fee'])


class Migration(migrations.Migration):
    dependencies = [
        ('portal', '0023_agreement_money'),
        migrations.swappable_dependency(settings.AUTH_USER_MODEL),
    ]

    operations = [
        migrations.AddField(model_name='agreementtemplate', name='allow_online', field=models.BooleanField(default=True, help_text='Students can sign online.')),
        migrations.AddField(model_name='agreementtemplate', name='allow_upload', field=models.BooleanField(default=True, help_text='Students can download it, sign by hand and upload a scan.')),
        migrations.AddField(model_name='studentagreement', name='own_text', field=models.BooleanField(default=False, help_text='The text was changed for this student.')),
        migrations.AddField(model_name='studentagreement', name='own_fee', field=models.BooleanField(default=False, help_text='The fee was set for this student.')),
        migrations.AddField(model_name='studentagreement', name='method', field=models.CharField(default='online', max_length=10)),
        migrations.AddField(model_name='studentagreement', name='uploaded_at', field=models.DateTimeField(blank=True, null=True)),
        migrations.AddField(model_name='studentagreement', name='return_note', field=models.CharField(blank=True, max_length=500)),
        migrations.AddField(model_name='studentagreement', name='accepted_at', field=models.DateTimeField(blank=True, null=True)),
        migrations.AddField(model_name='studentagreement', name='accepted_by', field=models.ForeignKey(blank=True, null=True, on_delete=django.db.models.deletion.SET_NULL, related_name='+', to=settings.AUTH_USER_MODEL)),
        migrations.AlterField(model_name='studentagreement', name='status', field=models.CharField(choices=[('pending', 'Waiting for the student to sign'), ('uploaded', 'Signed copy to check'), ('signed', 'Signed'), ('void', 'Cancelled')], db_index=True, default='pending', max_length=10)),
        migrations.CreateModel(
            name='AgreementFile',
            fields=[
                ('id', models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
                ('file', models.FileField(storage=portal.models.private_storage, upload_to=portal.models.agreement_upload_to)),
                ('file_name', models.CharField(max_length=200)),
                ('size', models.PositiveIntegerField(default=0)),
                ('uploaded_at', models.DateTimeField(auto_now_add=True)),
                ('agreement', models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, related_name='files', to='portal.studentagreement')),
            ],
            options={'ordering': ['id']},
        ),
        migrations.RunPython(forwards, migrations.RunPython.noop),
    ]
