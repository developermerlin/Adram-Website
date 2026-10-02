"""
Certificate templates, the verification QR code and "Add to LinkedIn".

A template sets the layout, colour and wording. A course uses the template it is listed on, otherwise the default
template, otherwise the built-in design. A certificate keeps the template it was issued with.

  GET    /lms/admin/certificate-templates/          the templates, with the courses using each
  POST   /lms/admin/certificate-templates/          create
  PATCH  /lms/admin/certificate-templates/<id>/     edit ({courses: [slugs]} moves those courses onto this template)
  DELETE /lms/admin/certificate-templates/<id>/     certificates issued with it fall back to the course's or default template
"""
import re
from urllib.parse import urlencode

from django.conf import settings
from django.db import transaction
from django.shortcuts import get_object_or_404
from rest_framework import status
from rest_framework.response import Response
from rest_framework.views import APIView

from catalog.models import Course
from accounts.permissions import IsAdmin

from .models import CertificateTemplate

COLOR = re.compile(r'^#[0-9a-fA-F]{6}$')
TEXT_FIELDS = {'name': 120, 'title': 80, 'heading': 80, 'lead': 160, 'footer_note': 200, 'signer_name': 120, 'signer_title': 120}
FLAGS = ('show_hours', 'show_instructor', 'show_qr', 'is_default')


def verify_url(code):
    return f'{settings.FRONTEND_URL.rstrip("/")}/certificate/{code}'


def qr_svg(url):
    """An inline SVG QR code for a link."""
    import segno
    return segno.make(url, error='m').svg_inline(scale=4, dark='#0b1b46', light='#ffffff', border=1)


def linkedin_url(certificate, course_title, organisation):
    """LinkedIn's "Add licence or certification" form, filled in."""
    issued = certificate.issued_at
    return 'https://www.linkedin.com/profile/add?' + urlencode({
        'startTask': 'CERTIFICATION_NAME', 'name': course_title, 'organizationName': organisation,
        'issueYear': issued.year, 'issueMonth': issued.month, 'certUrl': verify_url(certificate.code), 'certId': certificate.code,
    })


def template_data(template):
    if not template:
        return None
    return {'id': template.id, 'name': template.name, 'layout': template.layout, 'accent_color': template.accent_color,
            'title': template.title, 'heading': template.heading, 'lead': template.lead, 'footer_note': template.footer_note,
            'show_hours': template.show_hours, 'show_instructor': template.show_instructor, 'show_qr': template.show_qr,
            'signer_name': template.signer_name, 'signer_title': template.signer_title, 'is_default': template.is_default}


def template_for(certificate):
    return certificate.template or CertificateTemplate.for_course(certificate.enrollment.course)


def admin_data(template):
    return {**template_data(template), 'courses': [{'slug': c.slug, 'title': c.title} for c in template.courses.all()],
            'issued': template.certificates.count(), 'updated_at': template.updated_at}


def apply(template, data):
    """Copies valid input onto a template; returns a dict of problems."""
    errors = {}
    for field, limit in TEXT_FIELDS.items():
        if field in data:
            setattr(template, field, str(data[field] or '').strip()[:limit])
    for field in FLAGS:
        if field in data:
            setattr(template, field, bool(data[field]))
    if 'layout' in data:
        if data['layout'] not in dict(CertificateTemplate.LAYOUTS):
            errors['layout'] = 'Choose classic, modern or minimal.'
        else:
            template.layout = data['layout']
    if 'accent_color' in data:
        if not COLOR.match(str(data['accent_color'] or '')):
            errors['accent_color'] = 'Use a colour like #1d4ed8.'
        else:
            template.accent_color = data['accent_color'].lower()
    if not template.name:
        errors['name'] = 'Name the template.'
    if not template.title:
        errors['title'] = 'Give the certificate a title.'
    return errors


def save(template, data):
    errors = apply(template, data)
    courses = None
    if 'courses' in data:
        slugs = data['courses'] if isinstance(data['courses'], list) else []
        courses = list(Course.objects.filter(slug__in=[str(s) for s in slugs]))
        if len(courses) != len(set(map(str, slugs))):
            errors['courses'] = 'Some of those courses do not exist.'
    if errors:
        return errors
    with transaction.atomic():
        template.save()
        if template.is_default:  # only one default
            CertificateTemplate.objects.exclude(pk=template.pk).filter(is_default=True).update(is_default=False)
        if courses is not None:
            for course in courses:  # a course uses one template
                course.certificate_templates.remove(*course.certificate_templates.exclude(pk=template.pk))
            template.courses.set(courses)
    return {}


class TemplatesView(APIView):
    permission_classes = [IsAdmin]

    def get(self, request):
        rows = CertificateTemplate.objects.prefetch_related('courses')
        return Response([admin_data(t) for t in rows])

    def post(self, request):
        template = CertificateTemplate(is_default=not CertificateTemplate.objects.exists())
        errors = save(template, request.data)
        if errors:
            return Response(errors, status=status.HTTP_400_BAD_REQUEST)
        return Response(admin_data(template), status=status.HTTP_201_CREATED)


class TemplateDetailView(APIView):
    permission_classes = [IsAdmin]

    def patch(self, request, pk):
        template = get_object_or_404(CertificateTemplate, pk=pk)
        errors = save(template, request.data)
        if errors:
            return Response(errors, status=status.HTTP_400_BAD_REQUEST)
        return Response(admin_data(CertificateTemplate.objects.get(pk=pk)))

    def delete(self, request, pk):
        get_object_or_404(CertificateTemplate, pk=pk).delete()
        return Response(status=status.HTTP_204_NO_CONTENT)
