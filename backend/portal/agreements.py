"""
The Scholarship Application and Success-Based Service Agreement.

The student is sent this agreement to read and sign together with the application form, as soon as ADRAM confirms
their payment for "ADRAM applies for you" (the fee itself only becomes due if the scholarship is won). When the result
is marked Accepted: a signed agreement turns into a "your service fee is now due" notice; an unsigned one is sent again
with congratulations; and an application that never had one gets it then.

The admin controls everything about it in Admin → Service agreements: the text, the company details, signature and
stamp, the student information fields, what the student fills in beside their signature (e.g. the date), and the
wording of the signing page and invitation card. They can also send an agreement by hand, change a student's fee before they sign, remind, cancel or re-send it.

Until the student signs, an agreement follows the template: edits to the text, company details, signature, stamp and
the default fee reach it straight away (sync_pending), except what ADRAM set for that student only (own_text / own_fee).
Once signed, or uploaded signed on paper, it keeps a frozen copy of exactly what was signed.

The student signs online, or (paper route) downloads it, signs by hand and uploads a scan; ADRAM then accepts the
upload (it counts as signed) or returns it with a note.

Each agreement keeps a frozen copy of the text once signed. Signing records the student's details and signature, the
time, network address and browser, and a SHA-256 fingerprint of exactly what was signed.

Student
  GET  /portal/me/applications/<id>/agreement/    the agreement (once sent)
  POST /portal/me/applications/<id>/agreement/    {details: {...}, signature_details: {...}, signature, agree: true}
  POST /portal/me/applications/<id>/agreement/upload/    multipart: files[], declared  (the paper route)
Staff
  GET/PUT/DELETE /portal/staff/agreement-template/        the agreement text (DELETE restores the original)
  GET  /portal/staff/agreements/                           every agreement (?status=, ?q=); POST {application_id, fee} sends one
  GET  /portal/staff/applications/<id>/agreement/         one agreement
  POST /portal/staff/applications/<id>/agreement/         {action: fill, currency, amount, first_percent, effective_date, values}
                                                           | content {clauses} | refresh | remind | void {reason} | reissue
                                                           | add_payment {amount, paid_on, method, reference, note} | delete_payment {payment_id}
                                                           | accept_upload | return_upload {note}

Money: the admin fills in the total fee for each student; the first instalment is `first_percent` of it and the second
the rest. Payments ADRAM receives are recorded against the agreement, which gives what's paid and the balance, per
instalment. The student can read the agreement straight away but can only sign once the fee (and any required details
ADRAM fills in) is complete.
"""
import base64
import hashlib
import json
import re
from decimal import ROUND_HALF_UP, Decimal, InvalidOperation

from django.shortcuts import get_object_or_404
from django.utils import timezone
from django.utils.html import escape
from rest_framework import status
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView

from accounts.permissions import IsAdmin

from .models import AgreementFile, AgreementPayment, AgreementTemplate, Application, IntakeSubmission, StudentAgreement


def _c(cid, title, body):
    return {'id': cid, 'title': title, 'body': body.strip()}


DEFAULT_AGREEMENT = {
    'title': 'Scholarship Application and Success-Based Service Agreement',
    'subtitle': 'International Scholarship Consultancy & Student Placement Services',
    'company_name': 'ADRAM TECHNOLOGIES',
    'company_description': 'A legally registered technology and educational consultancy company providing international scholarship '
                           'application assistance, student advisory services, and overseas education support.',
    'company_address': '70N Main Motor Road, Calaba Town, Freetown, Sierra Leone',
    'representative_name': '',
    'representative_position': 'Director of Scholarships',
    'currency': 'NLe',
    'default_amount': None,
    'first_percent': 60,
    'admin_fields': [],
    'auto_issue': True,
    'student_fields': [],
    'signature_fields': [],
    'wording': {},
    'require_read': True,
    'allow_online': True,
    'allow_upload': True,
    'clauses': [
        _c('purpose', 'Purpose of the Agreement', '''
This Agreement establishes the terms and conditions under which ADRAM TECHNOLOGIES will provide scholarship application support services to the Student for admission and scholarship opportunities in universities and educational institutions outside the Student’s home country.
The purpose of this Agreement is to define the responsibilities of both Parties, payment obligations, service conditions, and procedures relating to successful scholarship placement.'''),
        _c('services', 'Services Provided by ADRAM Technologies', '''
The Company agrees to provide professional support services including, but not limited to:
(a) Identifying suitable scholarship opportunities based on the Student’s academic profile and objectives.
(b) Providing guidance on university and scholarship selection.
(c) Reviewing and advising on academic documents, certificates, transcripts, CVs, and other required materials.
(d) Assisting with preparation and improvement of application documents, including:
    i. Statement of Purpose (SOP)
    ii. Motivation Letter
    iii. Research Proposal (where applicable)
    iv. Scholarship Application Forms
    v. Personal Statements
    vi. Curriculum Vitae
(e) Providing guidance throughout the scholarship application process.
(f) Communicating application updates and relevant information received from universities or scholarship bodies.
(g) Providing pre-departure guidance after successful scholarship approval.'''),
        _c('success_payment', 'Success-Based Payment Agreement', '''
The Student acknowledges and agrees that ADRAM TECHNOLOGIES operates under a success-based service model.
The Student shall not be required to make any service payment before receiving a successful scholarship outcome.
Payment obligation shall only become effective after:
    i. The Student receives official confirmation of scholarship award, admission approval, or equivalent successful placement from the relevant institution or scholarship authority.'''),
        _c('fee', 'Service Fee and Payment Structure', '''
Upon successful scholarship achievement, the Student agrees to pay ADRAM TECHNOLOGIES the agreed service fee:
Total Service Fee: {fee}
The payment shall be divided into two installments:
First Payment: {first_percent}% ({first_amount})
The Student shall pay {first_percent_words} percent ({first_percent}%) of the total service fee, amounting to {first_amount}:
    i. Before departure to the scholarship destination country; and
    ii. Before commencing travel arrangements or leaving the Student’s home country.
Second Payment: {second_percent}% ({second_amount})
The remaining {second_percent_words} percent ({second_percent}%), amounting to {second_amount}, shall be paid:
    i. Within two (2) months after the Student’s arrival in the scholarship destination country.
Failure to complete payment according to this agreement shall constitute a breach of contract.'''),
        _c('student_duties', 'Student Responsibilities', '''
The Student agrees to:
(a) Provide accurate, complete, and truthful information during the application process.
(b) Submit genuine academic documents and personal information.
(c) Cooperate with ADRAM TECHNOLOGIES throughout the application process.
(d) Respond promptly to requests for documents, information, and application requirements.
(e) Attend interviews, examinations, or university requirements when necessary.
(f) Inform ADRAM TECHNOLOGIES immediately regarding any communication received from universities or scholarship organizations.'''),
        _c('company_duties', 'Company Responsibilities', '''
ADRAM TECHNOLOGIES agrees to:
(a) Provide professional scholarship application assistance.
(b) Maintain confidentiality regarding the Student’s personal information and documents.
(c) Provide honest guidance based on available scholarship opportunities.
(d) Make reasonable efforts to support the Student’s successful application.
(e) Keep the Student informed about important application developments.'''),
        _c('guarantee', 'Limitation of Guarantee', '''
The Student understands and acknowledges that:
(a) ADRAM TECHNOLOGIES does not guarantee scholarship approval because final decisions are made exclusively by universities, governments, scholarship committees, and other authorized institutions.
(b) Scholarship decisions depend on factors including but not limited to:
    i. Academic qualifications
    ii. Competition level
    iii. University requirements
    iv. Scholarship availability
    v. Government policies
    vi. Admission committee decisions
(c) The Company’s responsibility is to provide professional guidance and application support.'''),
        _c('confidentiality', 'Non-Disclosure and Confidentiality', '''
Both Parties agree to maintain confidentiality regarding:
    i. Personal information
    ii. Academic records
    iii. Application materials
    iv. Business processes
    v. Financial agreements
Neither Party shall disclose confidential information to any unauthorized third party without written consent, except where required by law.'''),
        _c('termination', 'Termination of Agreement', '''
This Agreement may be terminated if:
(a) The Student provides false or fraudulent documents.
(b) The Student refuses to cooperate with necessary application procedures.
(c) The Student independently completes an application using substantially the Company’s prepared materials and avoids payment obligations after successful scholarship approval.
(d) Either Party violates the terms and conditions of this Agreement.'''),
        _c('ip', 'Intellectual Property and Application Materials', '''
Documents, strategies, templates, guidance materials, and professional resources prepared by ADRAM TECHNOLOGIES remain the intellectual property of the Company.
The Student shall not sell, distribute, or provide these materials to third parties without written permission from ADRAM TECHNOLOGIES.'''),
        _c('default', 'Payment Default', '''
If the Student receives scholarship notice and fails to comply with the payment agreement of the Company, the Company reserves the right to deny further scholarship processing for the Student.
If the Student receives scholarship approval and fails to complete payment according to the agreed schedule, ADRAM TECHNOLOGIES reserves the right to pursue recovery of unpaid fees through appropriate legal procedures.
The Student acknowledges that successful scholarship placement represents completion of the Company’s service obligation.'''),
        _c('entire', 'Entire Agreement', '''
This Agreement represents the complete understanding between ADRAM TECHNOLOGIES and the Student regarding scholarship application services.
Any modification must be made in writing and signed by both Parties.
Any dispute arising from this Agreement shall first be resolved through good-faith negotiation between the Parties.'''),
    ],
}

TEXT_FIELDS = {'title': 200, 'subtitle': 200, 'company_name': 150, 'company_description': 600, 'company_address': 300,
               'representative_name': 120, 'representative_position': 120, 'currency': 12}
# What "Original wording" restores (money, fields, company details, signature and stamp are kept)
WORDING_RESET = ('title', 'subtitle', 'company_description', 'clauses', 'wording')
def _f(fid, label, ftype='text', prefill='auto', required=True):
    return {'id': fid, 'label': label, 'type': ftype, 'required': required, 'prefill': prefill}


DEFAULT_STUDENT_FIELDS = [_f('full_name', 'Full name'), _f('date_of_birth', 'Date of birth', 'date'), _f('passport_number', 'Passport number'),
                          _f('address', 'Residential address'), _f('phone', 'Telephone / WhatsApp', 'tel'), _f('email', 'Email address', 'email')]
DEFAULT_SIGNATURE_FIELDS = [_f('signed_name', 'Full name', prefill='field:full_name'), _f('signed_date', 'Date', 'date', prefill='today')]
FIELD_TYPES = ('text', 'long', 'date', 'email', 'tel', 'number')

# Wording around the agreement. DOC_WORDING is part of the document, so each agreement keeps the version it was sent
# with; the rest (the signing page and the invitation card) always follows the current template.
# Placeholders: {title} {company_name} {student_name} {fee} {reference} {scholarship} {day} {month} {year}
DEFAULT_WORDING = {
    # the document
    'between_label': 'Agreement between',
    'made_on': 'This {title} (“Agreement”) is made and entered into on day {day}, month {month}, year {year}.',
    'company_ref': 'Hereinafter referred to as “{company_name}” or the “Company”.',
    'student_heading': 'Student information',
    'student_ref': 'Hereinafter referred to as “the Student.” The Company and the Student shall collectively be referred to as “the Parties.”',
    'signatures_heading': 'Signatures',
    'student_signer': 'Student',
    'agree_statement': 'I, {student_name}, have read and understood this {title}, and I agree to be legally bound by its terms.',
    # the signing page
    'hero_title': 'Your service agreement: no win, no fee',
    'hero_title_awarded': 'Congratulations on your {scholarship}!',
    'intro': 'ADRAM is only paid if your scholarship is awarded. Please read the agreement carefully: it sets out the service fee, '
             'the payment schedule and the responsibilities of both parties. When you are ready, confirm your details and sign below.',
    'intro_awarded': 'Please read your service agreement carefully. It sets out the service fee, the payment schedule and the '
                     'responsibilities of both parties. When you are ready, confirm your details and sign below.',
    'details_heading': 'Confirm your details',
    'sign_heading': 'Sign the agreement',
    'signature_fields_heading': 'Complete the details beside your signature',
    'esign_note': 'By signing electronically you confirm this is your signature. ADRAM records the date, time and device used.',
    'sign_button': 'Sign the agreement',
    # the invitation card (progress page and application form)
    'card_badge': 'No win, no fee',
    'card_title': 'Sign your service agreement',
    'card_title_awarded': 'Congratulations! Please sign your service agreement',
    'card_title_form': 'Also waiting for you: your service agreement',
    'card_lead': 'Our promise to you in writing. ADRAM is only paid if your scholarship is awarded, so we win only when you win.',
    'card_lead_awarded': 'Your scholarship has been awarded. Read your agreement, confirm your details and sign it online.',
    'fact1_title': '{fee}', 'fact1_text': 'only if you win',
    'fact2_title': '{first_percent}% / {second_percent}%', 'fact2_text': 'before travel / after arrival',
    'fact3_title': 'About 3 minutes', 'fact3_text': 'to read and sign online',
    'card_button': 'Read and sign',
    # the service fee and payments
    'not_ready': 'ADRAM is still filling in the details of your agreement, such as your service fee. We’ll let you know as soon '
                 'as it is ready to sign.',
    'payments_heading': 'Your service fee and payments',
    'first_label': 'First payment',
    'first_due': 'Before you travel to your scholarship destination',
    'second_label': 'Second payment',
    'second_due': 'Within two months of arriving',
    # the paper route
    'choose_heading': 'How would you like to sign?',
    'online_option': 'Sign online',
    'online_hint': 'About 3 minutes. Nothing to print or scan.',
    'paper_option': 'Sign on paper',
    'paper_hint': 'Download the agreement, sign it by hand, then upload a scan or photos.',
    'paper_steps': 'Download and print the agreement.\nFill in your details and sign and date it where shown.\nScan it or take clear photos of every page, then upload them below.',
    'uploaded_note': 'Thank you. ADRAM is checking your signed copy and will let you know once it has been accepted.',
}
# Placeholders filled in from the money and dates (an admin field can't use these names)
RESERVED = {'fee', 'total_fee', 'currency', 'first_percent', 'second_percent', 'first_percent_words', 'second_percent_words',
            'first_amount', 'second_amount', 'paid', 'balance', 'effective_date', 'title', 'company_name', 'student_name',
            'reference', 'scholarship', 'day', 'month', 'year'}
DOC_WORDING = ('between_label', 'made_on', 'company_ref', 'student_heading', 'student_ref', 'signatures_heading', 'student_signer', 'agree_statement')
PAGE_WORDING = tuple(k for k in DEFAULT_WORDING if k not in DOC_WORDING)
MAX_IMAGE = 700_000


def clean_fields(raw, what, errors, allow_empty=False):
    """An admin-edited list of fields: [{id, label, type, required, prefill}]."""
    fields, seen = [], set()
    for i, f in enumerate((raw if isinstance(raw, list) else [])[:25]):
        f = f if isinstance(f, dict) else {}
        label = str(f.get('label') or '').strip()[:80]
        if not label:
            errors.append(f'{what}: field {i + 1} needs a label.')
            continue
        fid = re.sub(r'[^a-z0-9_]+', '_', str(f.get('id') or label).lower()).strip('_')[:40] or f'field_{i + 1}'
        if fid in RESERVED:
            fid += '_value'
        while fid in seen:
            fid += '_2'
        seen.add(fid)
        ftype = f.get('type') if f.get('type') in FIELD_TYPES else 'text'
        fields.append({'id': fid, 'label': label, 'type': ftype, 'required': bool(f.get('required', True)),
                       'prefill': str(f.get('prefill') or '')[:80]})
    if not fields and not allow_empty:
        errors.append(f'{what}: keep at least one field.')
    return fields


def student_fields_of(content):
    return content.get('student_fields') or DEFAULT_STUDENT_FIELDS


def signature_fields_of(content):
    return content.get('signature_fields') or DEFAULT_SIGNATURE_FIELDS


def admin_fields_of(content):
    return content.get('admin_fields') or []


# ---------------------------------------------------------------- money

def parse_amount(value):
    """'25,000' / 25000 / '25000.50' -> Decimal (None when empty). Raises ValueError for anything else."""
    if value is None or str(value).strip() == '':
        return None
    try:
        amount = Decimal(str(value).replace(',', '').strip())
    except (InvalidOperation, ValueError):
        raise ValueError('Enter the amount as a number, e.g. 25000.')
    if not amount.is_finite() or amount <= 0 or amount >= Decimal('1e10'):
        raise ValueError('Enter an amount greater than 0.')
    return amount.quantize(Decimal('0.01'))


def parse_fee_text(text):
    """A fee typed as text, e.g. 'NLe 15,000', '$1500' or '1,200 USD' -> (currency, amount)."""
    m = re.match(r'^\s*([^\d\s.,]*)\s*([\d.,]+)\s*([^\d\s.,]*)\s*$', str(text or ''))
    if not m:
        return '', None
    try:
        return (m.group(1) or m.group(3)).strip()[:12], parse_amount(m.group(2))
    except ValueError:
        return '', None


def fmt_money(currency, amount):
    """NLe 25,000 / $1,500 / NLe 12,500.50"""
    if amount is None:
        return ''
    number = f'{amount:,.2f}'
    number = number[:-3] if number.endswith('.00') else number
    currency = (currency or '').strip()
    if not currency:
        return number
    return f'{currency} {number}' if re.search(r'[A-Za-z]', currency) else f'{currency}{number}'


_ONES = ('zero one two three four five six seven eight nine ten eleven twelve thirteen fourteen fifteen sixteen seventeen '
         'eighteen nineteen').split()
_TENS = ('', '', 'twenty', 'thirty', 'forty', 'fifty', 'sixty', 'seventy', 'eighty', 'ninety')


def percent_words(n):
    """60 -> 'sixty', 45 -> 'forty-five'."""
    n = int(n)
    if n >= 100:
        return 'one hundred'
    if n < 20:
        return _ONES[n]
    return _TENS[n // 10] + ('' if n % 10 == 0 else '-' + _ONES[n % 10])


def clean_percent(value):
    try:
        n = int(str(value).strip())
    except (TypeError, ValueError):
        raise ValueError('The first payment must be a whole percentage, e.g. 60.')
    if not 1 <= n <= 100:
        raise ValueError('The first payment must be between 1% and 100%.')
    return n


def set_money(ag, currency=None, amount=None, first_percent=None):
    """Updates the fee and keeps the shown total (`fee`) in step."""
    if currency is not None:
        ag.currency = currency
    if amount is not None:
        ag.amount = amount
    if first_percent is not None:
        ag.first_percent = first_percent
    ag.fee = fmt_money(ag.currency, ag.amount)


def money(ag, words=None):
    """The fee, both instalments, what's been paid and the balance (payments go to the first instalment first)."""
    words = words or wording_of(AgreementTemplate.load())
    amount, pct = ag.amount, ag.first_percent or 60
    cur = ag.currency
    paid = sum((p.amount for p in ag.payments.all()), Decimal('0')) if ag.pk else Decimal('0')
    first = (amount * pct / 100).quantize(Decimal('0.01'), ROUND_HALF_UP) if amount is not None else None
    second = amount - first if amount is not None else None
    left, parts = paid, []
    for key, part, percent in (('first', first, pct), ('second', second, 100 - pct)):
        if percent <= 0:
            continue
        got = min(left, part) if part is not None else Decimal('0')
        left -= got
        parts.append({'key': key, 'label': words[f'{key}_label'], 'due': words[f'{key}_due'], 'percent': percent,
                      'amount': fmt_money(cur, part), 'paid': fmt_money(cur, got), 'remaining': fmt_money(cur, part - got) if part is not None else '',
                      'status': 'paid' if part is not None and got >= part else 'part' if got > 0 else 'unpaid'})
    return {
        'currency': cur, 'amount': str(amount) if amount is not None else '', 'first_percent': pct, 'second_percent': 100 - pct,
        'total': fmt_money(cur, amount), 'first_amount': fmt_money(cur, first), 'second_amount': fmt_money(cur, second),
        'paid': fmt_money(cur, paid) if amount is not None else '', 'paid_number': str(paid),
        'balance': fmt_money(cur, max(amount - paid, Decimal('0'))) if amount is not None else '',
        'paid_percent': int((paid / amount * 100).quantize(Decimal('1'), ROUND_HALF_UP)) if amount else 0,
        'fully_paid': amount is not None and paid >= amount, 'installments': parts,
    }


def effective_date(ag):
    if ag.effective_date:
        return ag.effective_date
    when = ag.signed_at if ag.status == StudentAgreement.SIGNED and ag.signed_at else ag.issued_at
    return timezone.localtime(when).date() if when else timezone.localdate()


def show_value(field, value):
    value = str(value or '').strip()
    if value and field.get('type') == 'date' and re.match(r'^\d{4}-\d{2}-\d{2}$', value):
        from datetime import date
        d = date.fromisoformat(value)
        return f'{d.day} {d.strftime("%B %Y")}'
    return value


def fill_values(ag, m):
    """Everything a {placeholder} in the agreement can be filled with."""
    values = {
        'fee': m['total'], 'total_fee': m['total'], 'currency': ag.currency,
        'first_percent': str(m['first_percent']) if m['total'] else '', 'second_percent': str(m['second_percent']) if m['total'] else '',
        'first_percent_words': percent_words(m['first_percent']) if m['total'] else '',
        'second_percent_words': percent_words(m['second_percent']) if m['total'] else '',
        'first_amount': m['first_amount'], 'second_amount': m['second_amount'], 'paid': m['paid'], 'balance': m['balance'],
        'effective_date': show_value({'type': 'date'}, effective_date(ag).isoformat()),
    }
    for f in admin_fields_of(ag.content):
        values[f['id']] = show_value(f, (ag.values or {}).get(f['id']))
    return values


def missing(ag):
    """What ADRAM still has to fill in before the student can sign."""
    out = [] if ag.amount is not None else ['The service fee']
    for f in admin_fields_of(ag.content):
        if f.get('required', True) and not str((ag.values or {}).get(f['id']) or '').strip():
            out.append(f['label'])
    return out


COMPANY_BLANKS = (('company_address', 'Company address'), ('representative_name', 'Represented by: name'),
                  ('representative_position', 'Represented by: position'), ('company_signature', 'Company signature'),
                  ('company_stamp', 'Company stamp'))


def company_blanks(source):
    """Blanks in the company's part of the agreement (template, or an agreement's frozen copy)."""
    get = source.get if isinstance(source, dict) else (lambda k, d=None: getattr(source, k, d))
    return [label for key, label in COMPANY_BLANKS if not str(get(key, '') or '').strip()]


def payment_data(p):
    return {'id': p.id, 'amount': fmt_money(p.agreement.currency, p.amount), 'amount_number': str(p.amount), 'paid_on': p.paid_on,
            'method': p.method, 'reference': p.reference, 'note': p.note, 'created_at': p.created_at}


def wording_of(t, content=None):
    """The wording to show: defaults, then the template, then (for the document) what the agreement was sent with."""
    words = {**DEFAULT_WORDING, **{k: v for k, v in (t.wording or {}).items() if k in DEFAULT_WORDING and v}}
    if content is not None:
        frozen = content.get('wording') or {}
        for k in DOC_WORDING:
            words[k] = frozen.get(k) or DEFAULT_WORDING[k]  # older agreements: the original wording
    return words


def intake_questions():
    from .intake import form_data
    from .models import IntakeForm
    return [{'id': f['id'], 'label': f['label']} for s in form_data(IntakeForm.load()).get('sections', []) for f in s.get('fields', [])]


def clean_image(value, kinds=('png', 'jpeg')):
    """A small image sent as a data: URL (signature or stamp). Returns (value, problem)."""
    value = str(value or '').strip()
    if not value:
        return '', ''
    m = re.match(r'^data:image/(png|jpeg|jpg);base64,', value)
    if not m or m.group(1).replace('jpg', 'jpeg') not in kinds or len(value) > MAX_IMAGE:
        return '', 'Use a PNG or JPG image smaller than 500 KB.'
    try:
        raw = base64.b64decode(value[m.end():], validate=True)
    except (ValueError, TypeError):
        return '', 'That image could not be read.'
    if not (raw.startswith(b'\x89PNG') or raw.startswith(b'\xff\xd8')):
        return '', 'That image could not be read.'
    return value, ''


def template_data(t):
    return {**{f: getattr(t, f) for f in TEXT_FIELDS}, 'clauses': t.clauses,
            'default_amount': str(t.default_amount) if t.default_amount is not None else '', 'first_percent': t.first_percent,
            'admin_fields': t.admin_fields or [], 'blanks': company_blanks(t), 'reserved': sorted(RESERVED), 'company_signature': t.company_signature,
            'company_stamp': t.company_stamp, 'auto_issue': t.auto_issue, 'require_read': t.require_read,
            'allow_online': t.allow_online, 'allow_upload': t.allow_upload,
            'student_fields': t.student_fields or DEFAULT_STUDENT_FIELDS, 'signature_fields': t.signature_fields or DEFAULT_SIGNATURE_FIELDS,
            'wording': wording_of(t), 'default_wording': DEFAULT_WORDING, 'doc_wording': DOC_WORDING,
            'field_types': FIELD_TYPES, 'intake_questions': intake_questions(), 'updated_at': t.updated_at}


def snapshot(t):
    """What gets frozen into each student's agreement."""
    words = wording_of(t)
    return {**{f: getattr(t, f) for f in TEXT_FIELDS if f != 'currency'}, 'clauses': t.clauses, 'admin_fields': t.admin_fields or [],
            'company_signature': t.company_signature, 'company_stamp': t.company_stamp,
            'student_fields': t.student_fields or DEFAULT_STUDENT_FIELDS, 'signature_fields': t.signature_fields or DEFAULT_SIGNATURE_FIELDS,
            'wording': {k: words[k] for k in DOC_WORDING}}


def follow_template(ag, t):
    """Brings an unsigned agreement up to date with the template (keeping what was set for this student only)."""
    if not ag.own_text:
        ag.content = snapshot(t)
    if not ag.own_fee:
        ag.amount, ag.first_percent, ag.currency = t.default_amount, t.first_percent, t.currency
        set_money(ag)


def sync_pending(t):
    """After the template changes: every agreement still waiting for a signature shows the new version."""
    from .views import after_commit
    for ag in StudentAgreement.objects.filter(status=StudentAgreement.PENDING).select_related('application__student'):
        was_ready = not missing(ag)
        follow_template(ag, t)
        ag.save()
        if not was_ready and not missing(ag):  # e.g. a default fee was just set: the student can sign now
            after_commit(send_agreement_issued, ag, False)


def file_data(f):
    return {'id': f.id, 'name': f.file_name, 'size': f.size, 'uploaded_at': f.uploaded_at}


def agreement_file(request, pk):
    """For PrivateFileView: (owner id, file field, name) of an uploaded signed page."""
    f = get_object_or_404(AgreementFile.objects.select_related('agreement__application'), pk=pk)
    return f.agreement.application.student_id, f.file, f.file_name


def clean_clauses(raw, errors):
    raw = raw if isinstance(raw, list) else []
    clauses, seen = [], set()
    for i, c in enumerate(raw[:40]):
        c = c if isinstance(c, dict) else {}
        title, body = str(c.get('title') or '').strip()[:150], str(c.get('body') or '').strip()[:6000]
        if not title or not body:
            errors.append(f'Clause {i + 1} needs a title and text.')
        cid = re.sub(r'[^a-z0-9_]+', '_', str(c.get('id') or title).lower()).strip('_')[:40] or f'clause_{i + 1}'
        while cid in seen:
            cid += '_2'
        seen.add(cid)
        clauses.append({'id': cid, 'title': title, 'body': body})
    if not clauses:
        errors.append('The agreement needs at least one clause.')
    return clauses


class AgreementTemplateAdminView(APIView):
    permission_classes = [IsAdmin]

    def get(self, request):
        t = AgreementTemplate.load()
        return Response({**template_data(t), 'counts': counts()})

    def put(self, request):
        t = AgreementTemplate.load()
        errors = []
        for field, limit in TEXT_FIELDS.items():
            if field in request.data:
                setattr(t, field, str(request.data[field] or '').strip()[:limit])
        if not t.title:
            errors.append('Give the agreement a title.')
        if not t.currency:
            t.currency = 'NLe'
        if 'clauses' in request.data:
            t.clauses = clean_clauses(request.data['clauses'], errors)
        if 'default_amount' in request.data:
            try:
                t.default_amount = parse_amount(request.data['default_amount'])
            except ValueError as e:
                errors.append(f'Default service fee: {e}')
        if 'first_percent' in request.data:
            try:
                t.first_percent = clean_percent(request.data['first_percent'])
            except ValueError as e:
                errors.append(str(e))
        if 'admin_fields' in request.data:
            t.admin_fields = clean_fields(request.data['admin_fields'], 'Details ADRAM fills in', errors, allow_empty=True)
        for field in ('company_signature', 'company_stamp'):
            if field in request.data:
                value, problem = clean_image(request.data[field])
                if problem:
                    errors.append(f'{"Signature" if field == "company_signature" else "Stamp"}: {problem}')
                setattr(t, field, value)
        if 'auto_issue' in request.data:
            t.auto_issue = bool(request.data['auto_issue'])
        if 'require_read' in request.data:
            t.require_read = bool(request.data['require_read'])
        for key in ('allow_online', 'allow_upload'):
            if key in request.data:
                setattr(t, key, bool(request.data[key]))
        if not t.allow_online and not t.allow_upload:
            errors.append('Let students sign online, on paper, or both.')
        if 'student_fields' in request.data:
            t.student_fields = clean_fields(request.data['student_fields'], 'Student information', errors)
        if 'signature_fields' in request.data:
            t.signature_fields = clean_fields(request.data['signature_fields'], 'Beside the signature', errors)
        if 'wording' in request.data:
            raw = request.data['wording'] if isinstance(request.data['wording'], dict) else {}
            # only what differs from the default is stored, so improved defaults still reach untouched lines
            t.wording = {k: str(raw[k]).strip()[:800] for k in DEFAULT_WORDING
                         if k in raw and str(raw[k] or '').strip() and str(raw[k]).strip() != DEFAULT_WORDING[k]}
        if errors:
            return Response({'detail': errors[0], 'errors': errors}, status=status.HTTP_400_BAD_REQUEST)
        t.updated_by = request.user
        t.save()
        sync_pending(t)
        return Response({**template_data(t), 'counts': counts()})

    def delete(self, request):
        """Restore the original wording (the fee, fields, company details, signature and stamp are kept)."""
        t = AgreementTemplate.load()
        for key in WORDING_RESET:
            setattr(t, key, DEFAULT_AGREEMENT[key])
        t.updated_by = request.user
        t.save()
        sync_pending(t)
        return Response({**template_data(t), 'counts': counts()})


# ---------------------------------------------------------------- one student's agreement

def counts():
    from django.db.models import Count
    c = dict(StudentAgreement.objects.values_list('status').annotate(n=Count('id')))
    return {k: c.get(k, 0) for k, _ in StudentAgreement.STATUS_CHOICES}


def prefill_details(app, fields):
    """Starting values for the student's fields, from their application form and account (see each field's `prefill`)."""
    student = app.student
    sub = IntakeSubmission.objects.filter(application=app).first()
    answers = (sub.answers if sub else None) or {}
    account = {'name': student.get_full_name(), 'email': student.email, 'phone': getattr(student, 'phone_number', '') or ''}
    auto_account = {'full_name': 'name', 'name': 'name', 'email': 'email', 'phone': 'phone'}
    values = {}
    for f in fields:
        source, value = f.get('prefill') or '', ''
        if source == 'auto':
            value = answers.get(f['id']) or account.get(auto_account.get(f['id'], ''), '')
        elif source.startswith('intake:'):
            value = answers.get(source[7:]) or ''
        elif source.startswith('account:'):
            value = account.get(source[8:], '')
        elif source == 'today':
            value = timezone.localdate().isoformat()
        values[f['id']] = value if isinstance(value, str) else ', '.join(map(str, value)) if isinstance(value, list) else str(value)
    return values


def agreement_data(ag, staff=False):
    app = ag.application
    t = AgreementTemplate.load()
    pending = ag.status == StudentAgreement.PENDING
    sfields, gfields = student_fields_of(ag.content), signature_fields_of(ag.content)
    m = money(ag, wording_of(t))
    data = {
        'application_id': app.id, 'reference': ag.reference, 'status': ag.status, 'status_display': ag.get_status_display(),
        'scholarship_name': app.scholarship_name, 'student': {'id': app.student_id, 'name': app.student.get_full_name(), 'email': app.student.email},
        'content': ag.content, 'fee': ag.fee, 'issued_at': ag.issued_at, 'reminded_at': ag.reminded_at,
        'money': m, 'values': fill_values(ag, m), 'admin_fields': admin_fields_of(ag.content), 'effective_date': effective_date(ag),
        'missing': missing(ag) if pending else [], 'ready': not missing(ag),
        'method': ag.method, 'files': [file_data(f) for f in ag.files.all()], 'uploaded_at': ag.uploaded_at,
        'return_note': ag.return_note if pending else '', 'accepted_at': ag.accepted_at,
        'allow_online': t.allow_online, 'allow_upload': t.allow_upload,
        'payments': [payment_data(p) for p in ag.payments.all()],
        'student_fields': sfields, 'signature_fields': gfields, 'wording': wording_of(t, ag.content), 'require_read': t.require_read,
        'student_details': ag.student_details if ag.status == StudentAgreement.SIGNED else {},
        'signature_details': ag.signature_details if ag.status == StudentAgreement.SIGNED else {},
        'paper_signed': ag.method == StudentAgreement.UPLOAD and ag.status in (StudentAgreement.UPLOADED, StudentAgreement.SIGNED),
        'prefill': prefill_details(app, sfields) if pending else {},
        'signature_prefill': prefill_details(app, gfields) if pending else {},
        'student_signature': ag.student_signature, 'signed_at': ag.signed_at, 'fingerprint': ag.fingerprint,
        'awarded': app.stage == Application.ACCEPTED,
        'void_reason': ag.void_reason if staff else '',
    }
    if staff:
        data.update({'signed_ip': ag.signed_ip, 'signed_user_agent': ag.signed_user_agent, 'admin_values': ag.values or {},
                     'effective_date_set': ag.effective_date, 'first_percent': ag.first_percent, 'currency': ag.currency,
                     'amount': str(ag.amount) if ag.amount is not None else '', 'blanks': company_blanks(ag.content),
                     'template_blanks': company_blanks(t), 'template_updated_at': t.updated_at,
                     'own_text': ag.own_text, 'own_fee': ag.own_fee,
                     'accepted_by': ag.accepted_by.get_full_name() if ag.accepted_by_id else ''})
    return data


def summary(app):
    """For the application card."""
    ag = StudentAgreement.objects.filter(application=app).first()
    if not ag:
        return None
    data = {'status': ag.status, 'status_display': ag.get_status_display(), 'reference': ag.reference, 'fee': ag.fee,
            'issued_at': ag.issued_at, 'signed_at': ag.signed_at, 'awarded': app.stage == Application.ACCEPTED}
    words = wording_of(AgreementTemplate.load())
    m = money(ag, words)
    data['money'] = {k: m[k] for k in ('total', 'paid', 'balance', 'paid_percent', 'fully_paid', 'first_percent', 'second_percent',
                                       'first_amount', 'second_amount')}
    data['ready'] = not missing(ag)
    data['method'] = ag.method
    data['return_note'] = ag.return_note if ag.status == StudentAgreement.PENDING else ''
    if ag.status == StudentAgreement.PENDING:  # the invitation card's wording
        data['card'] = {k: words[k] for k in PAGE_WORDING if k.startswith(('card_', 'fact'))}
    return data


def issue(app, by=None, amount=None, currency=None, notify=True, email=True):
    """Sends (or re-sends) the agreement to the student. Returns (agreement, problem).
    The fee is the one given, else what this student's agreement already had, else the template's default."""
    from .views import after_commit
    t = AgreementTemplate.load()
    ag = StudentAgreement.objects.filter(application=app).first()
    if ag and ag.status == StudentAgreement.SIGNED:
        return ag, 'The student has already signed this agreement.'
    if ag is None:
        ag = StudentAgreement(application=app, currency=t.currency, amount=t.default_amount, first_percent=t.first_percent)
    elif ag.amount is None and t.default_amount is not None:
        ag.amount, ag.currency = t.default_amount, ag.currency or t.currency
    if amount is not None:
        ag.own_fee = True
    set_money(ag, currency=currency or ag.currency or t.currency, amount=amount)
    if not ag.own_fee:
        follow_template(ag, t)
    ag.own_text = False
    ag.status, ag.content, ag.issued_by, ag.void_reason = StudentAgreement.PENDING, snapshot(t), by, ''
    ag.method, ag.return_note, ag.uploaded_at, ag.accepted_at, ag.accepted_by = StudentAgreement.ONLINE, '', None, None, None
    ag.issued_at = timezone.now()
    ag.save()
    if missing(ag):  # ADRAM must fill in the fee (or other details) before the student can sign
        from lms.notify import notify_admins
        notify_admins('system', f'Fill in the service agreement for {app.student.get_full_name()}',
                      f'{ag.reference}: still needed: {", ".join(missing(ag))}.', f'/admin/agreements/{app.pk}')
    if notify:
        if email:
            after_commit(send_agreement_issued, ag, False)
        from lms.notify import notify as bell
        awarded = app.stage == Application.ACCEPTED
        bell(app.student, 'system', 'Please sign your service agreement',
             (f'Congratulations on your scholarship! Read and sign your service agreement for {app.scholarship_name}.' if awarded
              else f'Your service agreement for {app.scholarship_name} is ready. No win, no fee: read it and sign in a few minutes.'),
             f'/student/applications/{app.pk}/agreement')
    return ag, ''


def without_agreement():
    """Paid or awarded applications that have no agreement yet (e.g. paid before agreements were sent with the form)."""
    from django.db.models import Q
    from .models import ServiceRequest
    return (Application.objects.filter(Q(service__status=ServiceRequest.PAID) | Q(stage=Application.ACCEPTED))
            .exclude(agreement__isnull=False).distinct())


def on_paid(app, by):
    """Called when ADRAM confirms the payment: the agreement opens together with the application form.
    The payment-confirmed email already announces it, so no separate email is sent."""
    if not AgreementTemplate.load().auto_issue:
        return
    ag = StudentAgreement.objects.filter(application=app).first()
    if ag and ag.status in (StudentAgreement.PENDING, StudentAgreement.SIGNED):
        return
    issue(app, by=by, email=False)


def on_accepted(app, by):
    """Called when staff mark an application's result as Accepted (scholarship awarded)."""
    from .views import after_commit
    ag = StudentAgreement.objects.filter(application=app).first()
    if ag and ag.status == StudentAgreement.SIGNED:
        after_commit(send_fee_due, ag)  # the success-based fee is now due
        return
    if ag and ag.status == StudentAgreement.PENDING:
        ag.reminded_at = timezone.now()
        ag.save(update_fields=['reminded_at', 'updated_at'])
        after_commit(send_agreement_issued, ag, False)  # sent again, now with congratulations
        return
    if AgreementTemplate.load().auto_issue:
        issue(app, by=by)


def fingerprint(ag, details, signed_with=None):
    body = {'reference': ag.reference, 'content': ag.content, 'fee': ag.fee, 'details': details, 'student': ag.application.student.email}
    if signed_with:
        body['signature_details'] = signed_with
    if ag.values:
        body['values'] = ag.values
    if ag.effective_date:
        body['effective_date'] = ag.effective_date.isoformat()
    if ag.amount is not None:
        body['amount'], body['first_percent'] = str(ag.amount), ag.first_percent
    payload = json.dumps(body, sort_keys=True, ensure_ascii=False)
    return hashlib.sha256(payload.encode('utf-8')).hexdigest()


def read_fields(raw, fields, errors, prefix):
    """The student's answers for `fields`; problems go into errors as {prefix + field id: message}."""
    raw = raw if isinstance(raw, dict) else {}
    values = {}
    for f in fields:
        value = str(raw.get(f['id']) or '').strip()[:1000 if f.get('type') == 'long' else 300]
        if not value and f.get('required', True):
            errors[prefix + f['id']] = f'Enter {f["label"].lower()}.'
        elif value and f.get('type') == 'date' and not re.match(r'^\d{4}-\d{2}-\d{2}$', value):
            errors[prefix + f['id']] = 'Choose a date.'
        elif value and f.get('type') == 'email' and not re.match(r'^[^@\s]+@[^@\s]+\.[^@\s]+$', value):
            errors[prefix + f['id']] = 'Enter a valid email address.'
        values[f['id']] = value
    return values


class MyAgreementView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request, pk):
        app = get_object_or_404(Application, pk=pk, student=request.user)
        ag = StudentAgreement.objects.filter(application=app).exclude(status=StudentAgreement.VOID).first()
        if not ag:
            return Response({'detail': 'There is no agreement to sign for this application yet.'}, status=status.HTTP_404_NOT_FOUND)
        return Response(agreement_data(ag))

    def post(self, request, pk):
        from .services import track
        from .models import PortalEvent
        from .views import after_commit
        app = get_object_or_404(Application, pk=pk, student=request.user)
        ag = StudentAgreement.objects.filter(application=app, status=StudentAgreement.PENDING).first()
        if not ag:
            return Response({'detail': 'This agreement isn’t waiting for your signature.'}, status=status.HTTP_400_BAD_REQUEST)
        if missing(ag):
            return Response({'detail': 'ADRAM is still filling in this agreement. You’ll be notified when it’s ready to sign.'},
                            status=status.HTTP_400_BAD_REQUEST)
        if not AgreementTemplate.load().allow_online:
            return Response({'detail': 'Please download the agreement, sign it and upload it.'}, status=status.HTTP_400_BAD_REQUEST)
        errors = {}
        details = read_fields(request.data.get('details'), student_fields_of(ag.content), errors, '')
        signed_with = read_fields(request.data.get('signature_details'), signature_fields_of(ag.content), errors, 'sig_')
        if not request.data.get('agree'):
            errors['agree'] = 'Please confirm that you have read and agree to the agreement.'
        signature, problem = clean_image(request.data.get('signature'), kinds=('png',))
        if problem or not signature:
            errors['signature'] = 'Please sign in the box.'
        if errors:
            return Response({'detail': 'Please complete every part before signing.', 'errors': errors}, status=status.HTTP_400_BAD_REQUEST)
        forwarded = request.META.get('HTTP_X_FORWARDED_FOR', '').split(',')[0].strip()
        ag.student_details, ag.signature_details, ag.student_signature = details, signed_with, signature
        ag.status, ag.signed_at = StudentAgreement.SIGNED, timezone.now()
        ag.signed_ip = forwarded or request.META.get('REMOTE_ADDR') or None
        ag.signed_user_agent = request.META.get('HTTP_USER_AGENT', '')[:300]
        ag.fingerprint = fingerprint(ag, details, signed_with)
        ag.method, ag.return_note = StudentAgreement.ONLINE, ''
        ag.save()
        track(request.user, PortalEvent.DOCUMENT, app.scholarship, label=app.scholarship_name, detail=f'Service agreement {ag.reference} signed')
        from lms.notify import notify_admins
        notify_admins('system', f'Service agreement signed by {app.student.get_full_name()}', f'{ag.reference} · {app.scholarship_name}',
                      f'/admin/agreements/{app.pk}')
        after_commit(send_agreement_signed, ag)
        return Response(agreement_data(ag))


def read_amount(data):
    """{amount, currency} or the older {fee: 'NLe 15,000'} -> (amount, currency)."""
    if str(data.get('amount') or '').strip():
        return parse_amount(data['amount']), str(data.get('currency') or '').strip()[:12] or None
    if str(data.get('fee') or '').strip():
        currency, amount = parse_fee_text(data['fee'])
        if amount is None:
            raise ValueError('Enter the fee as an amount, e.g. 25000.')
        return amount, currency or None
    return None, None


class MyAgreementUploadView(APIView):
    """The paper route: the agreement the student printed, signed by hand and scanned (or photographed)."""
    permission_classes = [IsAuthenticated]

    def post(self, request, pk):
        import os
        from rest_framework.parsers import FormParser, MultiPartParser  # noqa: F401  (multipart is in the default parsers)
        from .intake import MAX_FILE_BYTES, MAX_FILES, UPLOAD_TYPES, _looks_like
        from .views import after_commit
        app = get_object_or_404(Application, pk=pk, student=request.user)
        ag = StudentAgreement.objects.filter(application=app, status=StudentAgreement.PENDING).first()
        if not ag:
            return Response({'detail': 'This agreement isn’t waiting for your signature.'}, status=status.HTTP_400_BAD_REQUEST)
        if missing(ag):
            return Response({'detail': 'ADRAM is still filling in this agreement. You’ll be notified when it’s ready to sign.'},
                            status=status.HTTP_400_BAD_REQUEST)
        if not AgreementTemplate.load().allow_upload:
            return Response({'detail': 'Please sign the agreement online.'}, status=status.HTTP_400_BAD_REQUEST)
        files = request.FILES.getlist('files')
        if not files:
            return Response({'files': 'Upload the scan or photos of your signed agreement.'}, status=status.HTTP_400_BAD_REQUEST)
        if len(files) > MAX_FILES * 2:
            return Response({'files': f'Upload at most {MAX_FILES * 2} files. Tip: combine the pages into one PDF.'}, status=status.HTTP_400_BAD_REQUEST)
        for f in files:
            ext = os.path.splitext(f.name)[1].lower()
            if ext not in UPLOAD_TYPES or not _looks_like(f, ext):
                return Response({'files': f'“{f.name}” isn’t a PDF or photo. Use PDF, JPG, PNG, WEBP or HEIC.'}, status=status.HTTP_400_BAD_REQUEST)
            if f.size > MAX_FILE_BYTES:
                return Response({'files': f'“{f.name}” is larger than 10 MB. Scan at a lower resolution or take a photo instead.'}, status=status.HTTP_400_BAD_REQUEST)
        if request.data.get('declared') not in ('true', 'True', '1', 'on', True):
            return Response({'declared': 'Please confirm that you signed the agreement yourself.'}, status=status.HTTP_400_BAD_REQUEST)
        for old in ag.files.all():  # a new upload replaces the pages sent before
            old.file.delete(save=False)
            old.delete()
        digest = hashlib.sha256()
        for f in files:
            for chunk in f.chunks():
                digest.update(chunk)
            f.seek(0)
            AgreementFile.objects.create(agreement=ag, file=f, file_name=f.name[:200], size=f.size)
        forwarded = request.META.get('HTTP_X_FORWARDED_FOR', '').split(',')[0].strip()
        ag.status, ag.method, ag.uploaded_at, ag.return_note = StudentAgreement.UPLOADED, StudentAgreement.UPLOAD, timezone.now(), ''
        ag.signed_ip = forwarded or request.META.get('REMOTE_ADDR') or None
        ag.signed_user_agent = request.META.get('HTTP_USER_AGENT', '')[:300]
        ag.fingerprint = hashlib.sha256((fingerprint(ag, {}) + digest.hexdigest()).encode()).hexdigest()
        ag.save()
        from lms.notify import notify_admins
        notify_admins('system', f'Signed agreement uploaded by {app.student.get_full_name()}', f'{ag.reference}: check it and accept it.',
                      f'/admin/agreements/{app.pk}')
        after_commit(send_upload_to_team, ag)
        return Response(agreement_data(ag), status=status.HTTP_201_CREATED)


class StaffAgreementListView(APIView):
    permission_classes = [IsAdmin]

    def get(self, request):
        ags = StudentAgreement.objects.select_related('application__student').order_by('-issued_at')
        if request.query_params.get('status') in dict(StudentAgreement.STATUS_CHOICES):
            ags = ags.filter(status=request.query_params['status'])
        q = str(request.query_params.get('q', '')).strip().lower()
        words = wording_of(AgreementTemplate.load())
        rows = []
        for ag in ags.prefetch_related('payments')[:500]:
            app = ag.application
            row = {'application_id': app.id, 'reference': ag.reference, 'status': ag.status, 'status_display': ag.get_status_display(),
                   'student': {'id': app.student_id, 'name': app.student.get_full_name(), 'email': app.student.email},
                   'scholarship_name': app.scholarship_name, 'fee': ag.fee, 'issued_at': ag.issued_at, 'signed_at': ag.signed_at,
                   'reminded_at': ag.reminded_at, 'ready': not missing(ag)}
            if ag.status == StudentAgreement.SIGNED:
                m = money(ag, words)
                row.update({'paid': m['paid'], 'balance': m['balance'], 'paid_percent': m['paid_percent'], 'fully_paid': m['fully_paid']})
            if q and q not in f"{row['student']['name']} {row['student']['email']} {row['scholarship_name']} {row['reference']}".lower():
                continue
            rows.append(row)
        # Awarded applications that don't have an agreement yet, so the admin can send one
        waiting = without_agreement().select_related('student').order_by('-updated_at')[:100]
        return Response({'results': rows, 'counts': counts(),
                         'awaiting': [{'application_id': a.id, 'student': a.student.get_full_name(), 'email': a.student.email,
                                       'scholarship_name': a.scholarship_name, 'awarded': a.stage == Application.ACCEPTED}
                                      for a in waiting]})

    def post(self, request):
        app = get_object_or_404(Application.objects.select_related('student'), pk=request.data.get('application_id'))
        try:
            amount, currency = read_amount(request.data)
        except ValueError as e:
            return Response({'detail': str(e)}, status=status.HTTP_400_BAD_REQUEST)
        ag, problem = issue(app, by=request.user, amount=amount, currency=currency)
        if problem:
            return Response({'detail': problem}, status=status.HTTP_400_BAD_REQUEST)
        return Response(agreement_data(ag, staff=True), status=status.HTTP_201_CREATED)


class StaffAgreementView(APIView):
    permission_classes = [IsAdmin]

    def get(self, request, pk):
        ag = get_object_or_404(StudentAgreement.objects.select_related('application__student'), application_id=pk)
        return Response(agreement_data(ag, staff=True))

    def post(self, request, pk):
        from .views import after_commit
        ag = get_object_or_404(StudentAgreement.objects.select_related('application__student'), application_id=pk)
        action = request.data.get('action')
        bad = lambda message: Response({'detail': message}, status=status.HTTP_400_BAD_REQUEST)  # noqa: E731
        if action in ('fill', 'fee', 'content', 'refresh') and ag.status != StudentAgreement.PENDING:
            return bad('A signed or cancelled agreement can’t be changed. Cancel it and send a new one if it must change.')
        if action in ('fill', 'fee'):
            return self.fill(request, ag, after_commit)
        if action == 'content':  # this student's text only
            errors = []
            clauses = clean_clauses(request.data.get('clauses'), errors)
            if errors:
                return Response({'detail': errors[0], 'errors': errors}, status=status.HTTP_400_BAD_REQUEST)
            ag.content, ag.own_text = {**ag.content, 'clauses': clauses}, True
            ag.save(update_fields=['content', 'own_text', 'updated_at'])
        elif action == 'refresh':  # back to the template text (and it follows the template again), keep this student's fee
            ag.content, ag.own_text = snapshot(AgreementTemplate.load()), False
            ag.save(update_fields=['content', 'own_text', 'updated_at'])
        elif action == 'add_payment':
            return self.add_payment(request, ag, after_commit)
        elif action in ('accept_upload', 'return_upload'):
            if ag.status != StudentAgreement.UPLOADED:
                return bad('There is no uploaded copy waiting to be checked.')
            from lms.notify import notify as bell
            student, link = ag.application.student, f'/student/applications/{ag.application_id}/agreement'
            if action == 'accept_upload':
                ag.status, ag.signed_at = StudentAgreement.SIGNED, ag.uploaded_at
                ag.accepted_at, ag.accepted_by = timezone.now(), request.user
                ag.save()
                after_commit(send_agreement_signed, ag)
                bell(student, 'system', 'Your signed agreement was accepted', f'ADRAM accepted your signed agreement {ag.reference}.', link)
            else:
                note = str(request.data.get('note') or '').strip()[:500]
                if not note:
                    return bad('Tell the student what to fix.')
                ag.status, ag.return_note = StudentAgreement.PENDING, note
                ag.save()
                after_commit(send_upload_returned, ag)
                bell(student, 'system', 'Please upload your signed agreement again', note, link)
        elif action == 'delete_payment':
            AgreementPayment.objects.filter(agreement=ag, pk=request.data.get('payment_id')).delete()
        elif action == 'remind':
            if ag.status != StudentAgreement.PENDING:
                return Response({'detail': 'Only agreements waiting for a signature can be reminded.'}, status=status.HTTP_400_BAD_REQUEST)
            if missing(ag):
                return bad(f'Fill in {", ".join(missing(ag)).lower()} first: the student can’t sign until then.')
            ag.reminded_at = timezone.now()
            ag.save(update_fields=['reminded_at', 'updated_at'])
            after_commit(send_agreement_issued, ag, True)
        elif action == 'void':
            ag.status, ag.void_reason = StudentAgreement.VOID, str(request.data.get('reason') or '').strip()[:300]
            ag.save(update_fields=['status', 'void_reason', 'updated_at'])
        elif action == 'reissue':
            if ag.status == StudentAgreement.SIGNED and not request.data.get('confirm_signed'):
                return Response({'detail': 'This agreement is signed. Cancel it first if it must be replaced.'}, status=status.HTTP_400_BAD_REQUEST)
            try:
                amount, currency = read_amount(request.data)
            except ValueError as e:
                return bad(str(e))
            ag, problem = issue(ag.application, by=request.user, amount=amount, currency=currency)
            if problem:
                return Response({'detail': problem}, status=status.HTTP_400_BAD_REQUEST)
        else:
            return Response({'detail': 'Unknown action.'}, status=status.HTTP_400_BAD_REQUEST)
        return Response(agreement_data(ag, staff=True))

    def fill(self, request, ag, after_commit):
        """ADRAM fills in this student's agreement: the fee and its split, the effective date and its own details."""
        d, errors = request.data, {}
        was_ready = not missing(ag)
        if d.get('use_template_fee'):  # follow the template's fee again
            t = AgreementTemplate.load()
            ag.own_fee, ag.amount, ag.first_percent, ag.currency = False, t.default_amount, t.first_percent, t.currency
            set_money(ag)
            d = {k: v for k, v in d.items() if k not in ('amount', 'currency', 'first_percent', 'fee')}
        elif any(k in d for k in ('amount', 'currency', 'first_percent', 'fee')):
            ag.own_fee = True
        try:
            amount, currency = read_amount(d)
            if 'amount' in d and not str(d.get('amount') or '').strip():
                ag.amount = None
            set_money(ag, currency=currency or (str(d['currency']).strip()[:12] if str(d.get('currency') or '').strip() else None), amount=amount)
        except ValueError as e:
            errors['amount'] = str(e)
        if 'first_percent' in d:
            try:
                set_money(ag, first_percent=clean_percent(d['first_percent']))
            except ValueError as e:
                errors['first_percent'] = str(e)
        if 'effective_date' in d:
            value = str(d.get('effective_date') or '').strip()
            if value and not re.match(r'^\d{4}-\d{2}-\d{2}$', value):
                errors['effective_date'] = 'Choose a date.'
            else:
                from datetime import date
                ag.effective_date = date.fromisoformat(value) if value else None
        if isinstance(d.get('values'), dict):
            ag.values = {f['id']: str(d['values'].get(f['id']) or '').strip()[:1000] for f in admin_fields_of(ag.content)}
        if errors:
            return Response({'detail': next(iter(errors.values())), 'errors': errors}, status=status.HTTP_400_BAD_REQUEST)
        ag.save()
        if not was_ready and not missing(ag):  # complete now: the student can sign
            after_commit(send_agreement_issued, ag, False)
            from lms.notify import notify as bell
            bell(ag.application.student, 'system', 'Your service agreement is ready to sign',
                 f'ADRAM has completed your agreement {ag.reference}. Read it and sign in a few minutes.',
                 f'/student/applications/{ag.application_id}/agreement')
        return Response(agreement_data(ag, staff=True))

    def add_payment(self, request, ag, after_commit):
        from datetime import date
        d = request.data
        if ag.status != StudentAgreement.SIGNED:
            return Response({'detail': 'Payments can be recorded once the student has signed the agreement.'}, status=status.HTTP_400_BAD_REQUEST)
        if ag.amount is None:
            return Response({'detail': 'This agreement has no service fee.'}, status=status.HTTP_400_BAD_REQUEST)
        errors = {}
        try:
            amount = parse_amount(d.get('amount'))
            if amount is None:
                raise ValueError('Enter the amount received.')
            balance = ag.amount - sum((p.amount for p in ag.payments.all()), Decimal('0'))
            if amount > balance:
                raise ValueError(f'That is more than the balance of {fmt_money(ag.currency, balance)}.')
        except ValueError as e:
            errors['amount'] = str(e)
        paid_on = str(d.get('paid_on') or '').strip()
        if not re.match(r'^\d{4}-\d{2}-\d{2}$', paid_on):
            errors['paid_on'] = 'Choose the date it was paid.'
        if errors:
            return Response({'detail': next(iter(errors.values())), 'errors': errors}, status=status.HTTP_400_BAD_REQUEST)
        payment = AgreementPayment.objects.create(
            agreement=ag, amount=amount, paid_on=date.fromisoformat(paid_on), method=str(d.get('method') or '').strip()[:60],
            reference=str(d.get('reference') or '').strip()[:80], note=str(d.get('note') or '').strip()[:300], recorded_by=request.user)
        if d.get('notify', True):
            after_commit(send_payment_received, payment)
            m = money(ag)
            from lms.notify import notify as bell
            bell(ag.application.student, 'system', 'Payment received, thank you',
                 f'{fmt_money(ag.currency, amount)} received. Paid {m["paid"]} of {m["total"]}; balance {m["balance"]}.',
                 f'/student/applications/{ag.application_id}/agreement')
        return Response(agreement_data(ag, staff=True))


# ---------------------------------------------------------------- emails

def send_agreement_issued(ag, reminder=False):
    from accounts.emails import _frontend, _notify, notice
    app = ag.application
    awarded = app.stage == Application.ACCEPTED
    if awarded and not reminder:
        subject, title = f'Congratulations! Please sign your service agreement: {app.scholarship_name}', 'Congratulations on your scholarship!'
        lead = f'We’re delighted that your application for {app.scholarship_name} was successful.'
    elif reminder:
        subject, title = f'Reminder: please sign your service agreement ({ag.reference})', 'Please sign your service agreement'
        lead = 'This is a reminder that your service agreement is still waiting for your signature.'
    else:
        subject, title = f'Your service agreement is ready: {app.scholarship_name}', 'Your service agreement is ready'
        lead = ('ADRAM works on a success-based model: no win, no fee. Our service fee only becomes due if your scholarship '
                'is awarded, and it is paid in two parts, the second only after you arrive.')
    _notify(
        app.student, subject=subject, label='Service agreement', tone='success' if not reminder else 'info', title=title,
        paragraphs=[
            lead,
            'Please read your Scholarship Application and Success-Based Service Agreement carefully and sign it in your portal. '
            'It sets out the service fee, the payment schedule and the responsibilities of both parties.',
        ],
        extra_html=notice(f'Agreement reference: <strong>{escape(ag.reference)}</strong>'
                          + (f' · Service fee: <strong>{escape(ag.fee)}</strong>' if ag.fee else ''), 'info'),
        extra_text=f'Agreement reference: {ag.reference}' + (f' · Service fee: {ag.fee}' if ag.fee else ''),
        cta=('Read and sign the agreement', _frontend(f'/student/applications/{app.pk}/agreement')),
    )


def send_fee_due(ag):
    """The scholarship was won: under the signed agreement, the success-based fee is now due."""
    from accounts.emails import _frontend, _notify, details
    app = ag.application
    m = money(ag)
    rows = [('Agreement', ag.reference), ('Scholarship', app.scholarship_name), ('Total service fee', m['total'] or 'As agreed')]
    rows += [(f'{i["label"]} ({i["percent"]}%)', f'{i["amount"]} · {i["due"]}' if i['amount'] else i['due']) for i in m['installments']]
    if m['paid_number'] != '0':
        rows += [('Paid so far', m['paid']), ('Balance', m['balance'])]
    _notify(
        app.student, subject=f'Congratulations! Your scholarship is confirmed: {app.scholarship_name}', label='Scholarship awarded', tone='success',
        title='Congratulations on your scholarship!',
        paragraphs=[f'We’re delighted that your application for {app.scholarship_name} was successful.',
                    'Under the service agreement you signed, ADRAM’s success-based service fee is now due, in two parts as below. '
                    'Our team will contact you about the payment details and your next steps before departure.'],
        extra_html=details(rows), extra_text='\n'.join(f'{k}: {v}' for k, v in rows),
        cta=('View my signed agreement', _frontend(f'/student/applications/{app.pk}/agreement')),
    )


def send_payment_received(payment):
    """A receipt for a payment of the service fee, with what's left to pay."""
    from accounts.emails import _frontend, _notify, details
    ag = payment.agreement
    app = ag.application
    m = money(ag)
    rows = [('Amount received', fmt_money(ag.currency, payment.amount)), ('Date', payment.paid_on.strftime('%d %B %Y'))]
    rows += [(k, v) for k, v in (('Method', payment.method), ('Reference', payment.reference)) if v]
    rows += [('Total service fee', m['total']), ('Paid so far', f'{m["paid"]} ({m["paid_percent"]}%)'), ('Balance', m['balance'])]
    _notify(
        app.student, subject=f'Payment received: {fmt_money(ag.currency, payment.amount)} ({ag.reference})', label='Payment received', tone='success',
        title='Thank you, we’ve received your payment',
        paragraphs=['Fully paid: thank you. Your service fee is now settled in full.' if m['fully_paid']
                    else f'This payment has been recorded against your service agreement {ag.reference}. Your balance is {m["balance"]}.'],
        extra_html=details(rows), extra_text='\n'.join(f'{k}: {v}' for k, v in rows),
        cta=('View my agreement and payments', _frontend(f'/student/applications/{app.pk}/agreement')),
    )


def send_upload_to_team(ag):
    from django.conf import settings
    from accounts.emails import _frontend, _plain, _send, button, details, layout, paragraph
    app = ag.application
    title = 'Signed agreement uploaded'
    lead = f'{app.student.get_full_name()} uploaded their signed service agreement {ag.reference} ({ag.files.count()} file(s)). Check it and accept it.'
    rows = [('Agreement', ag.reference), ('Scholarship', app.scholarship_name), ('Service fee', ag.fee or '—')]
    reason = 'You received this email because you are an ADRAM portal administrator.'
    html = layout(preheader=lead, label='Agreements', tone='info', title=title, reason=reason,
                  body=paragraph(escape(lead)) + details(rows) + button('Check the signed copy', _frontend(f'/admin/agreements/{app.pk}')))
    _send(settings.CONTACT_NOTIFY_EMAIL, f'Signed agreement to check: {app.student.get_full_name()} ({ag.reference})',
          _plain(title, [lead], reason), html)


def send_upload_returned(ag):
    from accounts.emails import _frontend, _notify, quote
    app = ag.application
    _notify(
        app.student, subject=f'Please upload your signed agreement again ({ag.reference})', label='Service agreement', tone='warning',
        title='Please upload your signed agreement again',
        paragraphs=['ADRAM checked the signed agreement you uploaded and needs you to send it again. Here is what to fix:'],
        extra_html=quote(escape(ag.return_note)), extra_text=ag.return_note,
        cta=('Open my agreement', _frontend(f'/student/applications/{app.pk}/agreement')),
    )


def send_agreement_signed(ag):
    from django.conf import settings
    from accounts.emails import _frontend, _notify, _plain, _send, button, details, layout, paragraph
    app = ag.application
    rows = [('Agreement', ag.reference), ('Scholarship', app.scholarship_name), ('Service fee', ag.fee or '—'),
            ('Signed', timezone.localtime(ag.signed_at).strftime('%d %B %Y, %H:%M'))]
    _notify(
        app.student, subject=f'Your signed service agreement: {ag.reference}', label='Agreement signed', tone='success',
        title='Your signed agreement was accepted' if ag.method == StudentAgreement.UPLOAD else 'Thank you, your agreement is signed',
        paragraphs=[('ADRAM has checked and accepted the signed copy of your Scholarship Application and Success-Based Service Agreement. '
                     if ag.method == StudentAgreement.UPLOAD else
                     'You have signed your Scholarship Application and Success-Based Service Agreement with ADRAM Technologies. ')
                    + 'Please keep a copy for your records; you can download it at any time.'],
        extra_html=details(rows), extra_text='\n'.join(f'{k}: {v}' for k, v in rows),
        cta=('Download my signed agreement', _frontend(f'/student/applications/{app.pk}/agreement/print')),
    )
    title = 'Service agreement signed'
    lead = f'{app.student.get_full_name()} signed service agreement {ag.reference} for {app.scholarship_name}.'
    reason = 'You received this email because you are an ADRAM portal administrator.'
    html = layout(preheader=lead, label='Agreements', tone='success', title=title, reason=reason,
                  body=paragraph(escape(lead)) + details(rows) + button('Open the agreement', _frontend(f'/admin/agreements/{app.pk}')))
    _send(settings.CONTACT_NOTIFY_EMAIL, f'Agreement signed: {app.student.get_full_name()} ({ag.reference})',
          _plain(title, [lead, '\n'.join(f'{k}: {v}' for k, v in rows)], reason), html)
