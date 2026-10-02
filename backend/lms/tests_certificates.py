"""Certificate templates, the verification QR code and the LinkedIn link."""
from urllib.parse import parse_qs, urlparse

from catalog.models import Course
from portal.models import TrainingEnrollment

from . import access
from .models import Certificate, CertificateTemplate
from .tests import API, LmsCase

ADMIN = f'{API}/admin/certificate-templates'


class CertificateTemplateTests(LmsCase):
    def finish(self, course=None):
        enrollment = TrainingEnrollment.objects.create(student=self.student, course=course or self.course, status=TrainingEnrollment.ACTIVE)
        return Certificate.objects.create(enrollment=enrollment, template=CertificateTemplate.for_course(enrollment.course))

    def test_admin_manages_templates(self):
        self.as_(self.admin)
        first = self.client.post(f'{ADMIN}/', {'name': 'Standard', 'layout': 'modern', 'accent_color': '#0F766E'}, format='json').data
        self.assertTrue(first['is_default'])  # the first template is the default
        self.assertEqual(first['accent_color'], '#0f766e')
        bad = self.client.post(f'{ADMIN}/', {'name': 'x', 'accent_color': 'red', 'layout': 'fancy'}, format='json')
        self.assertEqual(set(bad.data), {'accent_color', 'layout'})
        second = self.client.post(f'{ADMIN}/', {'name': 'Bootcamp', 'title': 'Bootcamp diploma', 'is_default': True, 'courses': ['web']}, format='json').data
        self.assertEqual([c['slug'] for c in second['courses']], ['web'])
        self.assertFalse(CertificateTemplate.objects.get(pk=first['id']).is_default)  # one default only
        # moving the course to the first template takes it off the second
        self.client.patch(f'{ADMIN}/{first["id"]}/', {'courses': ['web']}, format='json')
        self.assertEqual(CertificateTemplate.objects.get(pk=second['id']).courses.count(), 0)
        self.assertEqual(len(self.client.get(f'{ADMIN}/').data), 2)
        self.as_(self.student)
        self.assertEqual(self.client.get(f'{ADMIN}/').status_code, 403)

    def test_certificate_uses_its_template_and_has_qr_and_linkedin(self):
        default = CertificateTemplate.objects.create(name='Default', is_default=True, signer_name='Jane Doe')
        special = CertificateTemplate.objects.create(name='Special', layout='minimal', title='Diploma', show_qr=False)
        other = Course.objects.create(slug='excel', title='Excel', summary='x', is_published=True)
        special.courses.add(other)

        cert = self.finish()
        data = self.client.get(f'{API}/certificates/{cert.code}/').data
        self.assertEqual((data['template']['name'], data['signer_name']), ('Default', 'Jane Doe'))
        self.assertIn('<svg', data['qr_svg'])
        self.assertTrue(data['verify_url'].endswith(f'/certificate/{cert.code}'))
        link = parse_qs(urlparse(data['linkedin_url']).query)
        self.assertEqual((link['name'], link['certId'], link['startTask']), (['Web Development'], [cert.code], ['CERTIFICATION_NAME']))

        diploma = self.client.get(f'{API}/certificates/{self.finish(other).code}/').data
        self.assertEqual((diploma['template']['title'], diploma['qr_svg']), ('Diploma', ''))

        # a certificate keeps the look it was issued with
        special.courses.add(self.course)
        self.assertEqual(self.client.get(f'{API}/certificates/{cert.code}/').data['template']['name'], 'Default')
        # deleting it falls back to the course's template
        default.delete()
        self.assertEqual(self.client.get(f'{API}/certificates/{cert.code}/').data['template']['name'], 'Special')

    def test_issued_with_course_template(self):
        template = CertificateTemplate.objects.create(name='Web', is_default=False)
        template.courses.add(self.course)
        self.as_(self.student)
        enrollment = self.enroll()
        for lesson in access.published_lessons(self.course):
            access.mark_complete(enrollment, lesson)
        certificate, _ = access.finish_if_done(enrollment)
        self.assertEqual(certificate.template, template)

    def test_no_templates_still_works(self):
        data = self.client.get(f'{API}/certificates/{self.finish().code}/').data
        self.assertIsNone(data['template'])
        self.assertIn('<svg', data['qr_svg'])
