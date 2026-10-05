import re
from decimal import Decimal, InvalidOperation

import django.db.models.deletion
from django.conf import settings
from django.db import migrations, models

OLD_FEE = """Upon successful scholarship achievement, the Student agrees to pay ADRAM TECHNOLOGIES the agreed service fee:
Total Service Fee: {fee}
The payment shall be divided into two installments:
First Payment: 60%
The Student shall pay sixty percent (60%) of the total service fee:"""
NEW_FEE = """Upon successful scholarship achievement, the Student agrees to pay ADRAM TECHNOLOGIES the agreed service fee:
Total Service Fee: {fee}
The payment shall be divided into two installments:
First Payment: {first_percent}% ({first_amount})
The Student shall pay {first_percent_words} percent ({first_percent}%) of the total service fee, amounting to {first_amount}:"""
OLD_FEE_2 = """Second Payment: 40%
The remaining forty percent (40%) shall be paid:"""
NEW_FEE_2 = """Second Payment: {second_percent}% ({second_amount})
The remaining {second_percent_words} percent ({second_percent}%), amounting to {second_amount}, shall be paid:"""


def parse(text):
    m = re.match(r'^\s*([^\d\s.,]*)\s*([\d.,]+)\s*([^\d\s.,]*)\s*$', str(text or ''))
    if not m:
        return '', None
    try:
        amount = Decimal(m.group(2).replace(',', '')).quantize(Decimal('0.01'))
    except InvalidOperation:
        return '', None
    return (m.group(1) or m.group(3)).strip()[:12], (amount if amount > 0 else None)


def new_clauses(clauses):
    out = []
    for c in clauses or []:
        body = c.get('body', '')
        if OLD_FEE in body and OLD_FEE_2 in body:
            body = body.replace(OLD_FEE, NEW_FEE).replace(OLD_FEE_2, NEW_FEE_2)
        out.append({**c, 'body': body})
    return out


def forwards(apps, schema_editor):
    Template = apps.get_model('portal', 'AgreementTemplate')
    Agreement = apps.get_model('portal', 'StudentAgreement')
    for t in Template.objects.all():
        currency, amount = parse(t.default_fee)
        t.currency, t.default_amount = currency or 'NLe', amount
        t.clauses = new_clauses(t.clauses)  # the fee clause now shows the calculated instalments
        t.save()
    currency_default = (Template.objects.first().currency if Template.objects.exists() else 'NLe')
    for ag in Agreement.objects.all():
        currency, amount = parse(ag.fee)
        ag.currency, ag.amount = currency or currency_default, amount
        if ag.status == 'pending':  # not signed yet, so the clearer fee clause can be used
            ag.content = {**ag.content, 'clauses': new_clauses(ag.content.get('clauses'))}
        ag.save()


class Migration(migrations.Migration):
    dependencies = [
        ('portal', '0022_agreement_fields_wording'),
        migrations.swappable_dependency(settings.AUTH_USER_MODEL),
    ]

    operations = [
        migrations.AddField(model_name='agreementtemplate', name='currency', field=models.CharField(default='NLe', max_length=12)),
        migrations.AddField(model_name='agreementtemplate', name='default_amount', field=models.DecimalField(blank=True, decimal_places=2, max_digits=12, null=True)),
        migrations.AddField(model_name='agreementtemplate', name='first_percent', field=models.PositiveSmallIntegerField(default=60)),
        migrations.AddField(model_name='agreementtemplate', name='admin_fields', field=models.JSONField(blank=True, default=list)),
        migrations.AddField(model_name='studentagreement', name='currency', field=models.CharField(blank=True, max_length=12)),
        migrations.AddField(model_name='studentagreement', name='amount', field=models.DecimalField(blank=True, decimal_places=2, max_digits=12, null=True)),
        migrations.AddField(model_name='studentagreement', name='first_percent', field=models.PositiveSmallIntegerField(default=60)),
        migrations.AddField(model_name='studentagreement', name='values', field=models.JSONField(blank=True, default=dict)),
        migrations.AddField(model_name='studentagreement', name='effective_date', field=models.DateField(blank=True, help_text='Empty = the date the student signs.', null=True)),
        migrations.CreateModel(
            name='AgreementPayment',
            fields=[
                ('id', models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
                ('amount', models.DecimalField(decimal_places=2, max_digits=12)),
                ('paid_on', models.DateField()),
                ('method', models.CharField(blank=True, max_length=60)),
                ('reference', models.CharField(blank=True, max_length=80)),
                ('note', models.CharField(blank=True, max_length=300)),
                ('created_at', models.DateTimeField(auto_now_add=True)),
                ('agreement', models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, related_name='payments', to='portal.studentagreement')),
                ('recorded_by', models.ForeignKey(blank=True, null=True, on_delete=django.db.models.deletion.SET_NULL, related_name='+', to=settings.AUTH_USER_MODEL)),
            ],
            options={'ordering': ['paid_on', 'id']},
        ),
        migrations.RunPython(forwards, migrations.RunPython.noop),
        migrations.RemoveField(model_name='agreementtemplate', name='default_fee'),
    ]
