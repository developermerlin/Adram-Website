"""
The scholarship application form: once ADRAM has confirmed a student's payment, the student fills in this form
so ADRAM has everything it needs to apply for them. The admin designs the form (Admin → Application form); each
student's answers are kept with a copy of the form as it was when they answered it.

Students choose how to complete it (the admin can allow either or both):
  - online: answer the questions in the portal and submit;
  - on paper: download the blank form, fill it in by hand, then upload a scan or photos of every page.

Student
  GET  /portal/me/applications/<id>/form/         the form, saved answers, status (only once the payment is confirmed)
  PUT  /portal/me/applications/<id>/form/         {answers, declared, submit}: save a draft, or submit (checked)
  POST /portal/me/applications/<id>/form/upload/  multipart files (1-10 PDF/JPG/PNG/WEBP/HEIC, 10 MB each) + declared
Staff
  GET  /portal/staff/application-forms/            every paid application and where its form is (?status=, ?method=)
  GET  /portal/staff/applications/<id>/form/       one student's form, answers and uploaded pages
  POST /portal/staff/applications/<id>/form/       {action: return, note, fields?} | {action: approve, signature?, name?, title?, save_signature?}
                                                   | reopen | remind
  GET/PUT/DELETE /portal/staff/my-signature/       the administrator's saved signature and job title
  GET/PUT/DELETE /portal/staff/intake-form/        the form itself (DELETE puts the original form back)
Files: GET /portal/files/forms/<file id>/ (the student and administrators)
"""
import base64
import os
import re
from datetime import date

from django.core.exceptions import ValidationError
from django.core.validators import validate_email
from django.shortcuts import get_object_or_404
from django.utils import timezone
from django.utils.html import escape
from rest_framework import status
from rest_framework.parsers import FormParser, MultiPartParser
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView

from accounts.permissions import IsAdmin

from .models import Application, IntakeFile, IntakeForm, IntakeSubmission, PortalEvent, ServiceRequest, StaffSignature

TYPES = {'text', 'textarea', 'email', 'phone', 'date', 'number', 'select', 'radio', 'checkboxes', 'yes_no', 'country'}
CHOICE_TYPES = {'select', 'radio', 'checkboxes'}
PREFILL = {'', 'full_name', 'first_name', 'last_name', 'email', 'phone', 'country'}
MAX_SECTIONS, MAX_FIELDS, MAX_OPTIONS = 20, 40, 40
TEXT_LIMIT, LONG_LIMIT = 300, 5000


def _f(fid, ftype, label, required=False, help='', options=None, width='half', prefill=''):
    return {'id': fid, 'type': ftype, 'label': label, 'help': help, 'required': required, 'options': options or [], 'width': width, 'prefill': prefill}


DEFAULT_FORM = {
    'title': 'Scholarship application form',
    'intro': 'Please answer every question carefully: we use these details to prepare and submit your scholarship application. '
             'Your answers are saved as you go, so you can come back and finish later.',
    'declaration': 'I confirm that the information I have given is true and complete. I authorise ADRAM Technologies to use it to '
                   'prepare and submit my scholarship application, and to contact the scholarship provider on my behalf.',
    'sections': [
        {'id': 'personal', 'title': 'Personal details', 'description': 'As they appear on your passport.', 'fields': [
            _f('full_name', 'text', 'Full name', True, 'First, middle and last names', prefill='full_name', width='full'),
            _f('date_of_birth', 'date', 'Date of birth', True),
            _f('gender', 'select', 'Gender', True, options=['Female', 'Male', 'Prefer not to say']),
            _f('nationality', 'country', 'Nationality', True, prefill='country'),
            _f('place_of_birth', 'text', 'Place of birth'),
            _f('passport_number', 'text', 'Passport number', True, 'Leave empty if you don’t have one yet and tell us below.'),
            _f('passport_expiry', 'date', 'Passport expiry date'),
            _f('email', 'email', 'Email address', True, prefill='email'),
            _f('phone', 'phone', 'Phone / WhatsApp', True, prefill='phone'),
            _f('address', 'textarea', 'Home address', True, width='full'),
        ]},
        {'id': 'education', 'title': 'Education', 'description': 'Your most recent studies.', 'fields': [
            _f('highest_qualification', 'select', 'Highest qualification', True,
               options=['WASSCE / Secondary school', 'Certificate / Diploma', 'Higher National Diploma (HND)', 'Bachelor’s degree', 'Master’s degree', 'PhD']),
            _f('institution', 'text', 'School or university', True),
            _f('field_of_study', 'text', 'Field of study', True),
            _f('graduation_year', 'number', 'Year completed (or expected)', True),
            _f('grade', 'text', 'Final grade / GPA / class', True, 'e.g. 3.6 / 4.0, Second Class Upper, 6 credits'),
            _f('other_qualifications', 'textarea', 'Other qualifications or certificates', width='full'),
        ]},
        {'id': 'plans', 'title': 'Study plans', 'description': 'What you want to study with this scholarship.', 'fields': [
            _f('study_level', 'radio', 'Level of study', True, options=['Undergraduate (Bachelor’s)', 'Master’s', 'PhD', 'Short course / Diploma'], width='full'),
            _f('programme', 'text', 'Programme or course you want to study', True, width='full'),
            _f('preferred_countries', 'text', 'Preferred countries', help='Separate with commas.'),
            _f('preferred_universities', 'text', 'Preferred universities (if any)'),
            _f('start_date', 'select', 'When can you start?', True, options=['As soon as possible', 'Within 6 months', 'In 6–12 months', 'In more than a year']),
            _f('motivation', 'textarea', 'Why do you want this scholarship?', True,
               'Your goals, why this programme, and how it will help you and your community (we use this for your personal statement).', width='full'),
        ]},
        {'id': 'experience', 'title': 'Work & achievements', 'description': '', 'fields': [
            _f('employed', 'yes_no', 'Are you working at the moment?', True),
            _f('employer', 'text', 'Employer and job title', 'If you are working.'),
            _f('experience_years', 'number', 'Years of work experience'),
            _f('achievements', 'textarea', 'Awards, leadership, volunteering or research', width='full'),
        ]},
        {'id': 'language', 'title': 'English language', 'description': '', 'fields': [
            _f('english_level', 'select', 'Your level of English', True, options=['Native / first language', 'Fluent', 'Good', 'Basic']),
            _f('english_tests', 'checkboxes', 'Tests you have taken', options=['IELTS', 'TOEFL', 'Duolingo English Test', 'None yet']),
            _f('test_scores', 'text', 'Test scores and dates', 'e.g. IELTS 7.0 (March 2026)', width='full'),
        ]},
        {'id': 'referees', 'title': 'Referees', 'description': 'Two people who can recommend you, such as a lecturer or employer.', 'fields': [
            _f('referee1_name', 'text', 'Referee 1: name and title', True),
            _f('referee1_contact', 'text', 'Referee 1: email and phone', True),
            _f('referee2_name', 'text', 'Referee 2: name and title'),
            _f('referee2_contact', 'text', 'Referee 2: email and phone'),
        ]},
        {'id': 'emergency', 'title': 'Emergency contact', 'description': '', 'fields': [
            _f('emergency_name', 'text', 'Name', True),
            _f('emergency_relationship', 'text', 'Relationship to you', True),
            _f('emergency_phone', 'phone', 'Phone', True),
            _f('notes', 'textarea', 'Anything else we should know?', width='full'),
        ]},
    ],
}


# ---------------------------------------------------------------- the form itself

def _slug(text, taken):
    base = re.sub(r'[^a-z0-9]+', '_', str(text).lower()).strip('_')[:40] or 'field'
    fid, n = base, 2
    while fid in taken:
        fid, n = f'{base}_{n}', n + 1
    taken.add(fid)
    return fid


def clean_form(data):
    """Checks and tidies a form sent by the admin. Returns (form, errors)."""
    errors = []
    title = str(data.get('title') or '').strip()[:150]
    if not title:
        errors.append('Give the form a title.')
    sections_in = data.get('sections') if isinstance(data.get('sections'), list) else []
    if not sections_in:
        errors.append('Add at least one section.')
    if len(sections_in) > MAX_SECTIONS:
        errors.append(f'A form can have at most {MAX_SECTIONS} sections.')
    section_ids, field_ids, sections = set(), set(), []
    for si, s in enumerate(sections_in[:MAX_SECTIONS]):
        s = s if isinstance(s, dict) else {}
        stitle = str(s.get('title') or '').strip()[:120]
        if not stitle:
            errors.append(f'Section {si + 1} needs a title.')
        sid = str(s.get('id') or '').strip()
        sid = sid if re.fullmatch(r'[a-z0-9_]{1,50}', sid) and sid not in section_ids else _slug(stitle or 'section', section_ids)
        section_ids.add(sid)
        fields_in = s.get('fields') if isinstance(s.get('fields'), list) else []
        if not fields_in:
            errors.append(f'“{stitle or f"Section {si + 1}"}” needs at least one question.')
        if len(fields_in) > MAX_FIELDS:
            errors.append(f'“{stitle}” has more than {MAX_FIELDS} questions.')
        fields = []
        for fi, f in enumerate(fields_in[:MAX_FIELDS]):
            f = f if isinstance(f, dict) else {}
            label = str(f.get('label') or '').strip()[:200]
            ftype = f.get('type') if f.get('type') in TYPES else 'text'
            if not label:
                errors.append(f'Question {fi + 1} in “{stitle}” needs a label.')
            fid = str(f.get('id') or '').strip()
            fid = fid if re.fullmatch(r'[a-z0-9_]{1,60}', fid) and fid not in field_ids else _slug(label or 'question', field_ids)
            field_ids.add(fid)
            options = []
            if ftype in CHOICE_TYPES:
                seen = set()
                for o in (f.get('options') if isinstance(f.get('options'), list) else [])[:MAX_OPTIONS]:
                    o = str(o).strip()[:120]
                    if o and o.lower() not in seen:
                        seen.add(o.lower())
                        options.append(o)
                if len(options) < (1 if ftype == 'checkboxes' else 2):
                    errors.append(f'“{label or f"Question {fi + 1}"}” needs {"at least one option" if ftype == "checkboxes" else "at least two options"}.')
            fields.append({
                'id': fid, 'type': ftype, 'label': label, 'help': str(f.get('help') or '').strip()[:300],
                'required': bool(f.get('required')), 'options': options,
                'width': 'full' if f.get('width') == 'full' or ftype in ('textarea', 'checkboxes', 'radio') else 'half',
                'prefill': f.get('prefill') if f.get('prefill') in PREFILL else '',
            })
        sections.append({'id': sid, 'title': stitle, 'description': str(s.get('description') or '').strip()[:400], 'fields': fields})
    return {'title': title, 'intro': str(data.get('intro') or '').strip()[:2000], 'sections': sections,
            'declaration': str(data.get('declaration') or '').strip()[:1000]}, errors


def form_data(form):
    return {'title': form.title, 'intro': form.intro, 'sections': form.sections, 'declaration': form.declaration}


def form_settings(form):
    return {'allow_online': form.allow_online, 'allow_upload': form.allow_upload}


class IntakeFormAdminView(APIView):
    permission_classes = [IsAdmin]

    def payload(self, form):
        return {**form_data(form), **form_settings(form), 'updated_at': form.updated_at,
                'submissions': IntakeSubmission.objects.exclude(status=IntakeSubmission.DRAFT).count()}

    def get(self, request):
        return Response(self.payload(IntakeForm.load()))

    def put(self, request):
        cleaned, errors = clean_form(request.data)
        online = bool(request.data.get('allow_online', True))
        upload = bool(request.data.get('allow_upload', True))
        if not (online or upload):
            errors.append('Let students complete the form online, on paper, or both.')
        if errors:
            return Response({'detail': errors[0], 'errors': errors}, status=status.HTTP_400_BAD_REQUEST)
        form = IntakeForm.load()
        for key, value in cleaned.items():
            setattr(form, key, value)
        form.allow_online, form.allow_upload, form.updated_by = online, upload, request.user
        form.save()
        return Response(self.payload(form))

    def delete(self, request):
        """Put the original questions back (the online / paper switches stay as they are)."""
        form = IntakeForm.load()
        for key, value in DEFAULT_FORM.items():
            setattr(form, key, value)
        form.updated_by = request.user
        form.save()
        return Response(self.payload(form))


# ---------------------------------------------------------------- answers

def prefill_values(user):
    country = getattr(user, 'country', '') or ''
    return {'full_name': user.get_full_name(), 'first_name': user.first_name, 'last_name': user.last_name,
            'email': user.email, 'phone': getattr(user, 'phone_number', '') or '', 'country': country}


def clean_answers(form, answers):
    """Keeps only answers to questions on the form, trimmed to size."""
    answers = answers if isinstance(answers, dict) else {}
    out = {}
    for s in form.get('sections', []):
        for f in s.get('fields', []):
            v = answers.get(f['id'])
            if f['type'] == 'checkboxes':
                out[f['id']] = [str(x)[:120] for x in v if str(x) in f['options']] if isinstance(v, list) else []
            elif v is not None:
                out[f['id']] = str(v).strip()[:LONG_LIMIT if f['type'] == 'textarea' else TEXT_LIMIT]
    return out


def check_answers(form, answers):
    """{field id: problem} for a submission."""
    problems = {}
    for s in form.get('sections', []):
        for f in s.get('fields', []):
            v = answers.get(f['id'])
            empty = v in (None, '', []) or (isinstance(v, list) and not v)
            if empty:
                if f['required']:
                    problems[f['id']] = 'Please answer this question.'
                continue
            t = f['type']
            if t == 'email':
                try:
                    validate_email(v)
                except ValidationError:
                    problems[f['id']] = 'Enter a valid email address.'
            elif t == 'number' and not re.fullmatch(r'-?\d+(\.\d+)?', v):
                problems[f['id']] = 'Enter a number.'
            elif t == 'date':
                try:
                    date.fromisoformat(v)
                except ValueError:
                    problems[f['id']] = 'Enter a valid date.'
            elif t in ('select', 'radio') and v not in f['options']:
                problems[f['id']] = 'Choose one of the options.'
            elif t == 'yes_no' and v not in ('yes', 'no'):
                problems[f['id']] = 'Choose yes or no.'
            elif t == 'phone' and not re.fullmatch(r'[+\d][\d\s()-]{5,24}', v):
                problems[f['id']] = 'Enter a valid phone number.'
    return problems


def progress(form, answers):
    required = [f['id'] for s in form.get('sections', []) for f in s.get('fields', []) if f['required']]
    done = sum(1 for fid in required if answers.get(fid) not in (None, '', []))
    return {'answered': done, 'required': len(required)}


UPLOAD_TYPES = {'.pdf': b'%PDF', '.jpg': b'\xff\xd8', '.jpeg': b'\xff\xd8', '.png': b'\x89PNG', '.webp': b'RIFF', '.heic': None, '.heif': None}
MAX_FILES, MAX_FILE_BYTES = 10, 10 * 1024 * 1024


def file_data(f):
    return {'id': f.id, 'name': f.file_name, 'size': f.size, 'uploaded_at': f.uploaded_at, 'url': f'/portal/files/forms/{f.id}/'}


def submission_data(sub, application, user=None):
    """What the student (or staff) sees: the form to fill in, answers, uploaded pages, status."""
    if sub and sub.status in (IntakeSubmission.SUBMITTED, IntakeSubmission.REVIEWED) and sub.form:
        form = sub.form  # a submitted copy keeps the questions it was answered with
    else:
        form = form_data(IntakeForm.load())
    settings_now = form_settings(IntakeForm.load())
    answers = sub.answers if sub else {}
    student = application.student
    return {
        'application_id': application.id, 'scholarship_name': application.scholarship_name,
        'reference': application.service.reference if hasattr(application, 'service') else '',
        'student': {'name': student.get_full_name(), 'email': student.email, 'phone': getattr(student, 'phone_number', '') or ''},
        'status': sub.status if sub else IntakeSubmission.DRAFT,
        'status_display': sub.get_status_display() if sub else IntakeSubmission.STATUS_CHOICES[0][1],
        'method': sub.method if sub else IntakeSubmission.ONLINE,
        'method_display': sub.get_method_display() if sub else IntakeSubmission.METHOD_CHOICES[0][1],
        'editable': not sub or sub.status in (IntakeSubmission.DRAFT, IntakeSubmission.RETURNED),
        'form': form, **settings_now, 'answers': answers, 'declared': bool(sub and sub.declared),
        'files': [file_data(f) for f in sub.files.all()] if sub else [],
        'prefill': prefill_values(student) if user and not answers else {},
        'submitted_at': sub.submitted_at if sub else None, 'return_note': sub.return_note if sub else '',
        'reviewed_at': sub.reviewed_at if sub else None, 'reminded_at': sub.reminded_at if sub else None,
        'flagged_fields': sub.flagged_fields if sub and sub.status == IntakeSubmission.RETURNED else [],
        'approval': ({'name': sub.approved_name, 'title': sub.approved_title, 'signature': sub.approved_signature, 'at': sub.reviewed_at}
                     if sub and sub.status == IntakeSubmission.REVIEWED else None),
        'updated_at': sub.updated_at if sub else None, 'progress': progress(form, answers),
        'agreement': _agreement(application),
    }


def _agreement(application):
    from .agreements import summary as agreement_summary
    return agreement_summary(application)


def summary(application):
    """A short line on the application card: is the form done?"""
    service = getattr(application, 'service', None)
    if not service or service.status != ServiceRequest.PAID:
        return None
    sub = IntakeSubmission.objects.filter(application=application).first()
    form = sub.form if sub and sub.form else form_data(IntakeForm.load())
    return {'status': sub.status if sub else IntakeSubmission.DRAFT,
            'status_display': sub.get_status_display() if sub else IntakeSubmission.STATUS_CHOICES[0][1],
            'method': sub.method if sub else IntakeSubmission.ONLINE,
            'submitted_at': sub.submitted_at if sub else None, 'return_note': sub.return_note if sub else '',
            'progress': progress(form, sub.answers if sub else {})}


def _paid_application(request, pk):
    app = get_object_or_404(Application.objects.select_related('service', 'student'), pk=pk, student=request.user)
    service = getattr(app, 'service', None)
    if not service or service.status != ServiceRequest.PAID:
        return app, Response({'detail': 'The application form opens once ADRAM has confirmed your payment.'}, status=status.HTTP_403_FORBIDDEN)
    return app, None


def _submitted(request, app, sub):
    """Shared by both ways of submitting: tell ADRAM, in the portal and by email."""
    from lms.notify import notify_admins
    from .services import track
    from .views import after_commit
    how = 'online' if sub.method == IntakeSubmission.ONLINE else 'as a scanned paper form'
    track(request.user, PortalEvent.DOCUMENT, app.scholarship, label=app.scholarship_name, detail=f'Application form submitted {how}')
    notify_admins('system', f'Application form from {app.student.get_full_name()}',
                  f'{app.scholarship_name}: submitted {how}.', f'/admin/applications/{app.pk}/form')
    after_commit(notify_team_form, sub)


class MyIntakeView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request, pk):
        app, denied = _paid_application(request, pk)
        if denied:
            return denied
        return Response(submission_data(IntakeSubmission.objects.filter(application=app).first(), app, request.user))

    def put(self, request, pk):
        app, denied = _paid_application(request, pk)
        if denied:
            return denied
        form_row = IntakeForm.load()
        if not form_row.allow_online:
            return Response({'detail': 'Please download the form, fill it in and upload a scan.'}, status=status.HTTP_400_BAD_REQUEST)
        sub, _ = IntakeSubmission.objects.get_or_create(application=app)
        if sub.status not in (IntakeSubmission.DRAFT, IntakeSubmission.RETURNED):
            return Response({'detail': 'Your form has been submitted. Contact ADRAM if something needs to change.'}, status=status.HTTP_400_BAD_REQUEST)
        form = form_data(form_row)
        sub.answers = clean_answers(form, request.data.get('answers'))
        sub.form = form
        sub.declared = bool(request.data.get('declared'))
        if request.data.get('submit'):
            problems = check_answers(form, sub.answers)
            if form.get('declaration') and not sub.declared:
                problems['_declaration'] = 'Please tick the declaration to confirm your answers.'
            if problems:
                sub.save()
                return Response({'detail': 'Some answers need your attention.', 'errors': problems}, status=status.HTTP_400_BAD_REQUEST)
            sub.status, sub.method, sub.submitted_at = IntakeSubmission.SUBMITTED, IntakeSubmission.ONLINE, timezone.now()
            sub.flagged_fields = []
            sub.save()
            _submitted(request, app, sub)
        else:
            sub.save()
        return Response(submission_data(sub, app, request.user))


def _looks_like(upload, ext):
    head = upload.read(12)
    upload.seek(0)
    magic = UPLOAD_TYPES.get(ext)
    if ext in ('.heic', '.heif'):
        return head[4:8] == b'ftyp'
    if ext == '.webp':
        return head[:4] == b'RIFF' and head[8:12] == b'WEBP'
    return magic is not None and head.startswith(magic)


class MyIntakeUploadView(APIView):
    """The paper route: the scan (or photos) of the form the student filled in by hand."""
    permission_classes = [IsAuthenticated]
    parser_classes = [MultiPartParser, FormParser]

    def post(self, request, pk):
        app, denied = _paid_application(request, pk)
        if denied:
            return denied
        form_row = IntakeForm.load()
        if not form_row.allow_upload:
            return Response({'detail': 'Please fill in the form online.'}, status=status.HTTP_400_BAD_REQUEST)
        sub, _ = IntakeSubmission.objects.get_or_create(application=app)
        if sub.status not in (IntakeSubmission.DRAFT, IntakeSubmission.RETURNED):
            return Response({'detail': 'Your form has been submitted. Contact ADRAM if something needs to change.'}, status=status.HTTP_400_BAD_REQUEST)
        files = request.FILES.getlist('files')
        if not files:
            return Response({'files': 'Upload the scan or photos of your completed form.'}, status=status.HTTP_400_BAD_REQUEST)
        if len(files) > MAX_FILES:
            return Response({'files': f'Upload at most {MAX_FILES} files. Tip: combine the pages into one PDF.'}, status=status.HTTP_400_BAD_REQUEST)
        for f in files:
            ext = os.path.splitext(f.name)[1].lower()
            if ext not in UPLOAD_TYPES or not _looks_like(f, ext):
                return Response({'files': f'“{f.name}” isn’t a PDF or photo. Use PDF, JPG, PNG, WEBP or HEIC.'}, status=status.HTTP_400_BAD_REQUEST)
            if f.size > MAX_FILE_BYTES:
                return Response({'files': f'“{f.name}” is larger than 10 MB. Scan at a lower resolution or take a photo instead.'}, status=status.HTTP_400_BAD_REQUEST)
        if form_row.declaration and request.data.get('declared') not in ('true', 'True', '1', 'on', True):
            return Response({'declared': 'Please confirm that you filled in and signed the form yourself.'}, status=status.HTTP_400_BAD_REQUEST)
        for old in sub.files.all():  # a new submission replaces the pages sent before
            old.file.delete(save=False)
            old.delete()
        for f in files:
            IntakeFile.objects.create(submission=sub, file=f, file_name=f.name[:200], size=f.size)
        sub.form = form_data(form_row)
        sub.status, sub.method, sub.declared, sub.submitted_at = IntakeSubmission.SUBMITTED, IntakeSubmission.UPLOAD, True, timezone.now()
        sub.flagged_fields = []
        sub.save()
        _submitted(request, app, sub)
        return Response(submission_data(sub, app, request.user), status=status.HTTP_201_CREATED)


def intake_file(request, pk):
    """For PrivateFileView: (owner id, file field, name) of an uploaded form page."""
    f = get_object_or_404(IntakeFile.objects.select_related('submission__application'), pk=pk)
    return f.submission.application.student_id, f.file, f.file_name


# ---------------------------------------------------------------- staff

class StaffIntakeView(APIView):
    permission_classes = [IsAdmin]

    def get(self, request, pk):
        app = get_object_or_404(Application.objects.select_related('service', 'student'), pk=pk)
        return Response(submission_data(IntakeSubmission.objects.filter(application=app).first(), app))

    def post(self, request, pk):
        from .views import after_commit
        app = get_object_or_404(Application.objects.select_related('service', 'student'), pk=pk)
        sub = IntakeSubmission.objects.filter(application=app).first()
        action = request.data.get('action')
        if action == 'remind':
            if sub and sub.status in (IntakeSubmission.SUBMITTED, IntakeSubmission.REVIEWED):
                return Response({'detail': 'The student has already submitted the form.'}, status=status.HTTP_400_BAD_REQUEST)
            if not hasattr(app, 'service') or app.service.status != ServiceRequest.PAID:
                return Response({'detail': 'The form opens once the payment is confirmed.'}, status=status.HTTP_400_BAD_REQUEST)
            sub = sub or IntakeSubmission.objects.create(application=app)
            sub.reminded_at = timezone.now()
            sub.save(update_fields=['reminded_at', 'updated_at'])
            after_commit(send_form_ready, app, True)
            return Response(submission_data(sub, app))
        if not sub or sub.status == IntakeSubmission.DRAFT:
            return Response({'detail': 'The student hasn’t submitted the form yet.'}, status=status.HTTP_400_BAD_REQUEST)
        if action == 'return':
            note = str(request.data.get('note') or '').strip()[:2000]
            known = {f['id'] for sec in (sub.form or {}).get('sections', []) for f in sec.get('fields', [])}
            fields = [f for f in request.data.get('fields') or [] if f in known] if isinstance(request.data.get('fields'), list) else []
            if not note and not fields:
                return Response({'note': 'Tell the student what to change, or tick the questions to check.'}, status=status.HTTP_400_BAD_REQUEST)
            sub.status, sub.return_note, sub.flagged_fields = IntakeSubmission.RETURNED, note, fields
            sub.save()
            after_commit(send_form_returned, sub)
            _tell_student(app, 'Please update your application form', note or 'Some answers need your attention.')
        elif action in ('approve', 'reviewed'):
            signature, problem = _signature(request)
            if problem:
                return Response({'signature': problem}, status=status.HTTP_400_BAD_REQUEST)
            name = str(request.data.get('name') or request.user.get_full_name() or request.user.email).strip()[:120]
            saved = StaffSignature.objects.filter(user=request.user).first()
            title = str(request.data.get('title') if request.data.get('title') is not None else (saved.title if saved else '')).strip()[:120]
            sub.status, sub.reviewed_at, sub.reviewed_by = IntakeSubmission.REVIEWED, timezone.now(), request.user
            sub.approved_name, sub.approved_title, sub.approved_signature = name, title, signature
            sub.return_note, sub.flagged_fields = '', []
            sub.save()
            if request.data.get('save_signature'):
                StaffSignature.objects.update_or_create(user=request.user, defaults={'image': signature, 'title': title})
            after_commit(send_form_approved, sub)
            _tell_student(app, 'Your application form has been approved', f'{name} reviewed and approved your form.')
        elif action == 'reopen':
            sub.status = IntakeSubmission.RETURNED
            sub.approved_name = sub.approved_title = sub.approved_signature = ''
            sub.save()
        else:
            return Response({'detail': 'Unknown action.'}, status=status.HTTP_400_BAD_REQUEST)
        return Response(submission_data(sub, app))


MAX_SIGNATURE = 300_000  # characters of data: URL (a drawn signature is usually 5-40 KB)


def clean_signature(value):
    """A signature must be a real PNG sent as a data: URL. Returns (data URL, problem)."""
    value = str(value or '').strip()
    prefix = 'data:image/png;base64,'
    if not value.startswith(prefix) or len(value) > MAX_SIGNATURE:
        return '', 'Sign in the box (draw or type your signature).'
    try:
        raw = base64.b64decode(value[len(prefix):], validate=True)
    except (ValueError, TypeError):
        return '', 'That signature could not be read. Please sign again.'
    if not raw.startswith(b'\x89PNG') or len(raw) < 100:
        return '', 'That signature could not be read. Please sign again.'
    return value, ''


def _signature(request):
    """The signature sent with an approval, or the administrator's saved one."""
    if request.data.get('signature'):
        return clean_signature(request.data['signature'])
    saved = StaffSignature.objects.filter(user=request.user).first()
    if saved:
        return saved.image, ''
    return '', 'Sign in the box (draw or type your signature).'


def _tell_student(app, title, body):
    from lms.notify import notify
    notify(app.student, 'system', title, f'{app.scholarship_name}: {body}', f'/student/applications/{app.pk}/form')


class MySignatureView(APIView):
    """The signed-in administrator's saved signature and job title."""
    permission_classes = [IsAdmin]

    def get(self, request):
        saved = StaffSignature.objects.filter(user=request.user).first()
        return Response({'image': saved.image if saved else '', 'title': saved.title if saved else '',
                         'name': request.user.get_full_name() or request.user.email})

    def put(self, request):
        image, problem = clean_signature(request.data.get('image'))
        if problem:
            return Response({'image': problem}, status=status.HTTP_400_BAD_REQUEST)
        saved, _ = StaffSignature.objects.update_or_create(user=request.user, defaults={'image': image, 'title': str(request.data.get('title') or '').strip()[:120]})
        return Response({'image': saved.image, 'title': saved.title, 'name': request.user.get_full_name() or request.user.email})

    def delete(self, request):
        StaffSignature.objects.filter(user=request.user).delete()
        return Response(status=status.HTTP_204_NO_CONTENT)


class StaffIntakeListView(APIView):
    """Every application ADRAM is working on (payment confirmed) and where its form is."""
    permission_classes = [IsAdmin]
    STATES = ('not_started', 'draft', 'submitted', 'returned', 'reviewed')

    def get(self, request):
        apps = (Application.objects.filter(service__status=ServiceRequest.PAID)
                .select_related('student', 'service', 'intake').order_by('-service__verified_at', '-id'))
        rows, counts = [], {k: 0 for k in self.STATES}
        blank = form_data(IntakeForm.load())
        for app in apps:
            sub = getattr(app, 'intake', None) if hasattr(app, 'intake') else None
            state = 'not_started' if not sub or (sub.status == IntakeSubmission.DRAFT and not sub.answers) else sub.status
            counts[state] += 1
            rows.append({
                'application_id': app.id, 'reference': app.service.reference, 'scholarship_name': app.scholarship_name,
                'student': {'id': app.student_id, 'name': app.student.get_full_name(), 'email': app.student.email},
                'state': state, 'method': sub.method if sub and state not in ('not_started', 'draft') else '',
                'progress': progress(sub.form or blank, sub.answers) if sub else progress(blank, {}),
                'files': sub.files.count() if sub else 0,
                'paid_at': app.service.verified_at, 'submitted_at': sub.submitted_at if sub else None,
                'reminded_at': sub.reminded_at if sub else None, 'updated_at': sub.updated_at if sub else None,
            })
        state = request.query_params.get('state')
        if state in self.STATES:
            rows = [r for r in rows if r['state'] == state]
        method = request.query_params.get('method')
        if method in (IntakeSubmission.ONLINE, IntakeSubmission.UPLOAD):
            rows = [r for r in rows if r['method'] == method]
        q = str(request.query_params.get('q', '')).strip().lower()
        if q:
            rows = [r for r in rows if q in r['student']['name'].lower() or q in r['student']['email'].lower()
                    or q in r['scholarship_name'].lower() or q in r['reference'].lower()]
        return Response({'results': rows, 'counts': counts})


def forms_to_review():
    """For the admin sidebar badge."""
    return IntakeSubmission.objects.filter(status=IntakeSubmission.SUBMITTED).count()


# ---------------------------------------------------------------- emails

def notify_team_form(sub):
    from django.conf import settings
    from accounts.emails import _frontend, _plain, _send, button, details, layout, paragraph
    app, student = sub.application, sub.application.student
    link = _frontend(f'/admin/applications/{app.pk}/form')
    title = 'Application form submitted'
    how = 'filled in online' if sub.method == IntakeSubmission.ONLINE else f'as a scanned paper form ({sub.files.count()} file(s))'
    lead = f'{student.get_full_name()} submitted the application form for {app.scholarship_name}, {how}.'
    rows = [('Student', student.get_full_name()), ('Email', student.email), ('Scholarship', app.scholarship_name),
            ('Reference', app.service.reference), ('How', sub.get_method_display())]
    reason = 'You received this email because you are an ADRAM portal administrator.'
    html = layout(preheader=lead, label='Action needed', tone='info', title=title, reason=reason,
                  body=paragraph(escape(lead)) + details(rows) + button('Open the form', link))
    text = _plain(title, [lead, '\n'.join(f'{k}: {v}' for k, v in rows), f'Open the form: {link}'], reason)
    _send(settings.CONTACT_NOTIFY_EMAIL, f'Application form submitted: {student.get_full_name()}', text, html)


def send_form_ready(app, reminder=False):
    """To the student: the form is open (sent with the payment confirmation, and as a reminder by the admin)."""
    from accounts.emails import _frontend, _notify, notice
    form = IntakeForm.load()
    ways = []
    if form.allow_online:
        ways.append('fill it in online in your portal (your answers are saved as you go)')
    if form.allow_upload:
        ways.append('download it, fill it in by hand and upload a scan or photos of the pages')
    how = ' or '.join(ways)
    _notify(
        app.student,
        subject=(f'Reminder: please complete your application form for {app.scholarship_name}' if reminder
                 else f'Your application form is ready: {app.scholarship_name}'),
        label='Application form', tone='info',
        title='Please complete your application form' if reminder else 'Your application form is ready',
        paragraphs=[
            ('This is a friendly reminder that we still need your application form.' if reminder
             else 'Thank you for your payment. The next step is your application form: it gives us everything we need to prepare and submit your scholarship application.'),
            f'You can {how}.',
        ],
        extra_html=notice(f'Reference: <strong>{escape(app.service.reference)}</strong> · Scholarship: {escape(app.scholarship_name)}', 'info'),
        extra_text=f'Reference: {app.service.reference}',
        cta=('Open my application form', _frontend(f'/student/applications/{app.pk}/form')),
    )


def flagged_labels(sub):
    labels = {f['id']: f['label'] for sec in (sub.form or {}).get('sections', []) for f in sec.get('fields', [])}
    return [labels[f] for f in sub.flagged_fields if f in labels]


def send_form_returned(sub):
    from accounts.emails import _frontend, _notify, notice
    app = sub.application
    labels = flagged_labels(sub)
    items = ''.join(f'<li>{escape(label)}</li>' for label in labels)
    extra_html = (notice(escape(sub.return_note), 'warning', 'Message from ADRAM') if sub.return_note else '') + (
        notice(f'<ul style="margin:4px 0 0;padding-left:20px;">{items}</ul>', 'info', 'Questions to check') if labels else '')
    extra_text = '\n'.join(filter(None, [f'Message from ADRAM: {sub.return_note}' if sub.return_note else '',
                                          ('Questions to check:\n' + '\n'.join(f'- {label}' for label in labels)) if labels else '']))
    how = ('Update the answers in your portal and submit the form again.' if sub.method == IntakeSubmission.ONLINE
           else 'Correct your paper form (or fill in a new one) and upload it again, or complete the form online instead.')
    _notify(
        app.student, subject=f'Please update your application form: {app.scholarship_name}', label='Action needed', tone='warning',
        title='A few answers need your attention',
        paragraphs=['Thank you for your application form. We’ve reviewed it and need a few changes before we can approve it.', how],
        extra_html=extra_html, extra_text=extra_text,
        cta=('Update my form', _frontend(f'/student/applications/{app.pk}/form')),
    )


def send_form_approved(sub):
    from accounts.emails import _frontend, _notify, details
    app = sub.application
    rows = [('Scholarship', app.scholarship_name), ('Reference', app.service.reference),
            ('Approved by', f'{sub.approved_name}{f", {sub.approved_title}" if sub.approved_title else ""}'),
            ('Date', timezone.localtime(sub.reviewed_at).strftime('%d %B %Y'))]
    _notify(
        app.student, subject=f'Your application form has been approved: {app.scholarship_name}', label='Form approved', tone='success',
        title='Your application form has been approved',
        paragraphs=['Good news! We’ve reviewed your application form and everything is complete. It has been signed and approved by our team.',
                    'We’ll now use it to prepare and submit your scholarship application, and keep you updated in your portal. '
                    'You can download your approved copy at any time.'],
        extra_html=details(rows), extra_text='\n'.join(f'{k}: {v}' for k, v in rows),
        cta=('Download my approved form', _frontend(f'/student/applications/{app.pk}/form/print')),
    )
