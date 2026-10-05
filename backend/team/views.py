"""
The team API.

Public (published profiles only; the admin and the member themselves can preview an unpublished one)
  GET  /team/members/                     the Team page cards
  GET  /team/members/<slug>/              one member's full portfolio
  GET  /team/members/<slug>/cv/           their uploaded CV (PDF), if its visibility allows
Administrators
  GET/POST        /team/manage/           every profile, plus staff accounts that could join; POST {user_id} adds one
  POST            /team/manage/reorder/   {ids: [...]}
  GET/PUT/DELETE  /team/manage/<id>/      one profile (DELETE removes the profile, never the account)
  POST/DELETE     /team/manage/<id>/cv/   upload (multipart "file") or remove the CV
The team member themselves
  GET/PUT         /team/me/               their own profile
  POST/DELETE     /team/me/cv/            their own CV
"""
import re

from django.contrib.auth import get_user_model
from django.core.validators import validate_email
from django.core.exceptions import ValidationError
from django.http import FileResponse, Http404
from django.shortcuts import get_object_or_404
from rest_framework import status
from rest_framework.parsers import FormParser, JSONParser, MultiPartParser
from rest_framework.permissions import AllowAny, IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView

from accounts.permissions import IsAdmin

from .models import TeamProfile

User = get_user_model()

TEXT = {'display_name': 150, 'job_title': 120, 'department': 120, 'location': 120, 'headline': 220, 'photo': 500,
        'cover': 500, 'bio': 8000, 'public_phone': 40}
SOCIALS = ('linkedin', 'x', 'facebook', 'instagram', 'github', 'whatsapp', 'website')
# Each list: (max entries, {field: max length}); `current` and `level` and `tags` are handled specially
LISTS = {
    'experience': (30, {'title': 120, 'organisation': 150, 'location': 120, 'start': 20, 'end': 20, 'description': 1500}),
    'education': (20, {'qualification': 150, 'institution': 150, 'start': 20, 'end': 20, 'description': 1000}),
    'certifications': (30, {'name': 150, 'issuer': 150, 'year': 10, 'url': 300}),
    'projects': (30, {'title': 150, 'description': 1500, 'image': 500, 'url': 300}),
    'achievements': (30, {'title': 150, 'year': 10, 'description': 600}),
    'testimonials': (20, {'quote': 800, 'author': 120, 'role': 120}),
}
REQUIRED = {'experience': 'title', 'education': 'qualification', 'certifications': 'name', 'projects': 'title',
            'achievements': 'title', 'testimonials': 'quote'}
MAX_CV = 10 * 1024 * 1024
STAFF_ROLES = [r for r, _ in User.ROLE_CHOICES if r != User.STUDENT]


def can_manage(user, profile):
    return user.is_authenticated and (user.role == User.ADMIN or profile.user_id == user.pk)


def cv_allowed(profile, user):
    if profile.cv_visibility == TeamProfile.HIDDEN:
        return can_manage(user, profile)
    if profile.cv_visibility == TeamProfile.MEMBERS:
        return user.is_authenticated
    return True


def card(p):
    return {'id': p.id, 'slug': p.slug, 'name': p.name, 'job_title': p.job_title, 'department': p.department,
            'location': p.location, 'headline': p.headline, 'photo': p.photo, 'featured': p.featured,
            'skills': [s.get('name') for s in p.skills][:4], 'socials': p.socials, 'allow_chat': p.allow_chat,
            'member_id': p.user_id, 'is_published': p.is_published, 'years_experience': p.years_experience}


def full(p, viewer):
    data = {**card(p)}
    data.update({f: getattr(p, f) for f in ('bio', 'cover', 'skills', 'expertise', 'languages', 'experience', 'education',
                                             'certifications', 'projects', 'achievements', 'testimonials', 'public_email',
                                             'public_phone', 'generated_cv', 'cv_visibility', 'sort_order')})
    allowed = cv_allowed(p, viewer)
    data['cv'] = {
        'visibility': p.cv_visibility, 'visibility_display': p.get_cv_visibility_display(),
        'allowed': allowed, 'needs_sign_in': not allowed and p.cv_visibility == TeamProfile.MEMBERS,
        'file': bool(p.cv_file), 'file_name': p.cv_name if p.cv_file else '',
        'generated': p.generated_cv and allowed,  # the printable CV follows the same visibility
    }
    data['can_edit'] = can_manage(viewer, p)
    data['email'] = p.user.email if data['can_edit'] else ''
    data['role'] = p.user.role
    data['role_display'] = p.user.get_role_display()
    data['updated_at'] = p.updated_at
    return data


def _clean_text(value, limit):
    return str(value or '').strip()[:limit]


def apply_changes(p, data, admin):
    """Writes the editable fields from `data` onto the profile. Returns a list of problems (nothing saved if any)."""
    errors = []
    for field, limit in TEXT.items():
        if field in data:
            setattr(p, field, _clean_text(data[field], limit))
    if 'public_email' in data:
        email = _clean_text(data['public_email'], 254)
        if email:
            try:
                validate_email(email)
            except ValidationError:
                errors.append('Enter a valid public email address, or leave it empty.')
        p.public_email = email
    if 'years_experience' in data:
        raw = str(data['years_experience'] or '').strip()
        if not raw:
            p.years_experience = None
        elif raw.isdigit() and int(raw) <= 80:
            p.years_experience = int(raw)
        else:
            errors.append('Years of experience must be a whole number.')
    if 'skills' in data:
        skills = []
        for s in (data['skills'] if isinstance(data['skills'], list) else [])[:40]:
            name = _clean_text(s.get('name') if isinstance(s, dict) else s, 60)
            if not name:
                continue
            try:
                level = max(0, min(100, int(s.get('level', 70)) if isinstance(s, dict) else 70))
            except (TypeError, ValueError):
                level = 70
            skills.append({'name': name, 'level': level})
        p.skills = skills
    for field in ('expertise', 'languages'):
        if field in data:
            items = data[field] if isinstance(data[field], list) else []
            setattr(p, field, [v for v in (_clean_text(x, 60) for x in items[:30]) if v])
    for field, (most, spec) in LISTS.items():
        if field not in data:
            continue
        rows = []
        for i, row in enumerate((data[field] if isinstance(data[field], list) else [])[:most]):
            row = row if isinstance(row, dict) else {}
            clean = {k: _clean_text(row.get(k), n) for k, n in spec.items()}
            if field == 'experience':
                clean['current'] = bool(row.get('current'))
            if field == 'projects':
                clean['tags'] = [t for t in (_clean_text(x, 40) for x in (row.get('tags') or [])[:8]) if t]
            if not any(v for k, v in clean.items() if k not in ('current', 'tags')):
                continue  # an empty row the admin added and left
            if not clean[REQUIRED[field]]:
                errors.append(f'{field.capitalize()} {i + 1}: fill in the {REQUIRED[field]}.')
            for key in ('url',):
                if clean.get(key) and not re.match(r'^(https?://|/)', clean[key]):
                    errors.append(f'{field.capitalize()} {i + 1}: links start with https:// (or / for this site).')
            rows.append(clean)
        setattr(p, field, rows)
    if 'socials' in data:
        raw = data['socials'] if isinstance(data['socials'], dict) else {}
        socials = {}
        for key in SOCIALS:
            value = _clean_text(raw.get(key), 300)
            if value:
                if key != 'whatsapp' and not re.match(r'^https?://', value):
                    errors.append(f'{key.capitalize()}: use the full address, starting with https://.')
                socials[key] = value
        p.socials = socials
    for flag in ('allow_chat', 'generated_cv'):
        if flag in data:
            setattr(p, flag, bool(data[flag]))
    if 'cv_visibility' in data and data['cv_visibility'] in dict(TeamProfile.CV_VISIBILITY):
        p.cv_visibility = data['cv_visibility']
    if admin:
        for flag in ('is_published', 'featured'):
            if flag in data:
                setattr(p, flag, bool(data[flag]))
        if 'slug' in data:
            slug = re.sub(r'[^a-z0-9-]+', '-', str(data['slug'] or '').lower()).strip('-')[:80]
            if not slug:
                errors.append('The page address can’t be empty.')
            elif TeamProfile.objects.filter(slug=slug).exclude(pk=p.pk).exists():
                errors.append('Another team member already uses that page address.')
            else:
                p.slug = slug
    return errors


def save_cv(p, upload):
    """Validates and stores an uploaded CV (PDF). Returns a problem, or ''."""
    if not upload:
        return 'Choose the CV file (PDF).'
    if not upload.name.lower().endswith('.pdf') or upload.read(4) != b'%PDF':
        return 'Upload the CV as a PDF file.'
    upload.seek(0)
    if upload.size > MAX_CV:
        return 'The CV can be up to 10 MB.'
    if p.cv_file:
        p.cv_file.delete(save=False)
    p.cv_file = upload
    p.cv_name = upload.name[:200]
    p.save()
    return ''


# ---------------------------------------------------------------- public

class MembersView(APIView):
    permission_classes = [AllowAny]

    def get(self, request):
        profiles = TeamProfile.objects.filter(is_published=True, user__is_active=True).select_related('user')
        return Response({'results': [card(p) for p in profiles]})


class MemberView(APIView):
    permission_classes = [AllowAny]

    def get(self, request, slug):
        p = get_object_or_404(TeamProfile.objects.select_related('user'), slug=slug)
        if not (p.is_published and p.user.is_active) and not can_manage(request.user, p):
            raise Http404
        return Response(full(p, request.user))


class MemberCVView(APIView):
    permission_classes = [AllowAny]

    def get(self, request, slug):
        p = get_object_or_404(TeamProfile, slug=slug)
        visible = (p.is_published and p.user.is_active) or can_manage(request.user, p)
        if not visible or not p.cv_file or not cv_allowed(p, request.user):
            raise Http404
        try:
            handle = p.cv_file.open('rb')
        except OSError:  # the file is gone from the disk
            raise Http404
        response = FileResponse(handle, content_type='application/pdf', filename=p.cv_name or f'{p.slug}-cv.pdf')
        response['Content-Disposition'] = response['Content-Disposition'].replace('attachment', 'inline')
        return response


# ---------------------------------------------------------------- administrators

class ManageListView(APIView):
    permission_classes = [IsAdmin]

    def get(self, request):
        profiles = TeamProfile.objects.select_related('user')
        taken = profiles.values_list('user_id', flat=True)
        candidates = (User.objects.filter(role__in=STAFF_ROLES, is_active=True).exclude(pk__in=taken)
                      .order_by('first_name', 'last_name')[:200])
        return Response({
            'results': [{**card(p), 'email': p.user.email, 'role': p.user.role, 'role_display': p.user.get_role_display(),
                         'has_cv': bool(p.cv_file), 'updated_at': p.updated_at} for p in profiles],
            'candidates': [{'id': u.id, 'name': u.get_full_name(), 'email': u.email, 'role_display': u.get_role_display()} for u in candidates],
        })

    def post(self, request):
        user = get_object_or_404(User, pk=request.data.get('user_id'), is_active=True)
        if user.role == User.STUDENT:
            return Response({'detail': 'Students can’t be added to the team. Give them a staff role first.'}, status=status.HTTP_400_BAD_REQUEST)
        p, _ = TeamProfile.for_user(user)
        return Response(full(p, request.user), status=status.HTTP_201_CREATED)


class ReorderView(APIView):
    permission_classes = [IsAdmin]

    def post(self, request):
        ids = [int(i) for i in request.data.get('ids', []) if str(i).isdigit()]
        for n, pk in enumerate(ids):
            TeamProfile.objects.filter(pk=pk).update(sort_order=n)
        return Response({'ok': True})


class ProfileEditMixin:
    parser_classes = [JSONParser, MultiPartParser, FormParser]
    admin = False

    def profile(self, request, pk=None):
        raise NotImplementedError

    def get(self, request, pk=None):
        return Response(full(self.profile(request, pk), request.user))

    def put(self, request, pk=None):
        p = self.profile(request, pk)
        errors = apply_changes(p, request.data, admin=self.admin)
        if errors:
            return Response({'detail': errors[0], 'errors': errors}, status=status.HTTP_400_BAD_REQUEST)
        p.save()
        return Response(full(p, request.user))


class ManageDetailView(ProfileEditMixin, APIView):
    permission_classes = [IsAdmin]
    admin = True

    def profile(self, request, pk=None):
        return get_object_or_404(TeamProfile.objects.select_related('user'), pk=pk)

    def delete(self, request, pk):
        p = self.profile(request, pk)
        if p.user.role == User.TEAM_MEMBER:
            return Response({'detail': 'This account has the Team member role, so it keeps its profile. Change the role first, '
                                       'or unpublish the profile to hide it.'}, status=status.HTTP_400_BAD_REQUEST)
        if p.cv_file:
            p.cv_file.delete(save=False)
        p.delete()
        return Response(status=status.HTTP_204_NO_CONTENT)


class MyProfileView(ProfileEditMixin, APIView):
    permission_classes = [IsAuthenticated]

    def profile(self, request, pk=None):
        p = TeamProfile.objects.select_related('user').filter(user=request.user).first()
        if not p:
            raise Http404('You don’t have a team profile.')
        return p


class CVMixin:
    parser_classes = [MultiPartParser, FormParser]

    def post(self, request, pk=None):
        p = self.profile(request, pk)
        problem = save_cv(p, request.FILES.get('file'))
        if problem:
            return Response({'detail': problem}, status=status.HTTP_400_BAD_REQUEST)
        return Response(full(p, request.user), status=status.HTTP_201_CREATED)

    def delete(self, request, pk=None):
        p = self.profile(request, pk)
        if p.cv_file:
            p.cv_file.delete(save=False)
        p.cv_file, p.cv_name = '', ''
        p.save()
        return Response(full(p, request.user))


class ManageCVView(CVMixin, APIView):
    permission_classes = [IsAdmin]

    def profile(self, request, pk=None):
        return get_object_or_404(TeamProfile.objects.select_related('user'), pk=pk)


class MyCVView(CVMixin, APIView):
    permission_classes = [IsAuthenticated]

    def profile(self, request, pk=None):
        p = TeamProfile.objects.select_related('user').filter(user=request.user).first()
        if not p:
            raise Http404
        return p
