"""
Running the marketplace (administrators).

  GET  /lms/admin/dashboard/?days=                   platform totals and growth charts
  GET  /lms/admin/courses/?status=                   courses by review status (the review queue)
  POST /lms/admin/courses/<slug>/review/             {action: start|approve|reject|request_changes|publish|unpublish, note}
  GET/POST /lms/admin/categories/   PATCH/DELETE /lms/admin/categories/<id>/
  GET  /lms/admin/reviews/?hidden=&rating=&q=        POST /lms/admin/reviews/<id>/ {action: hide|show|delete, note}
  GET  /lms/admin/reports/?status=                   POST /lms/admin/reports/<id>/ {action: resolve|dismiss, note, remove}
  GET  /lms/admin/certificates/?q=                   POST /lms/admin/certificates/<code>/ {action: revoke|restore, reason}
  GET  /lms/admin/audit/?action=&q=
  POST /lms/admin/users/                             {email, first_name, last_name, role, password}
  GET  /lms/admin/users/<id>/learning/               a user's enrolments, orders, certificates and reviews
  POST /lms/admin/users/<id>/enroll/                 {slug} give a course without payment
Anyone signed in:
  POST /lms/reports/                                 {target_type, target_id, reason, details}
  GET  /lms/categories/                              the category tree with course counts (public)
"""
from datetime import timedelta
from decimal import Decimal

from django.contrib.auth.password_validation import validate_password
from django.core.exceptions import ValidationError
from django.db import transaction
from django.db.models import Count, Q, Sum
from django.shortcuts import get_object_or_404
from django.utils import timezone
from django.utils.text import slugify
from rest_framework import status
from rest_framework.permissions import AllowAny, IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView

from accounts.models import User
from accounts.permissions import IsAdmin
from catalog.models import Category, Course, unique_slug
from portal.models import TrainingEnrollment

from . import analytics, audit
from .briefs import public_name
from .commerce import order_data
from .models import AuditLog, Certificate, Order, Reply, Report, Review, Thread
from .notify import notify, notify_admins
from .stats import stats_for
from .views import certificate_data, learning_rows

LEARNING = [TrainingEnrollment.ACTIVE, TrainingEnrollment.COMPLETED]


# ---------------------------------------------------------------- dashboard

class DashboardView(APIView):
    permission_classes = [IsAdmin]

    def get(self, request):
        days = analytics.period(request)
        since = timezone.now() - timedelta(days=days)
        users = User.objects.all()
        courses = Course.objects.all()
        enrollments = TrainingEnrollment.objects.filter(status__in=LEARNING)
        paid = Order.objects.filter(status=Order.SUCCESSFUL)
        published = list(Course.objects.filter(is_published=True).select_related('category'))
        stats = stats_for(published)
        popular = sorted(published, key=lambda c: stats[c.id]['student_count'], reverse=True)[:8]
        categories = (Category.objects.filter(parent__isnull=True)
                      .annotate(courses_n=Count('courses', filter=Q(courses__is_published=True), distinct=True),
                                students=Count('courses__enrollments', filter=Q(courses__enrollments__status__in=LEARNING), distinct=True))
                      .order_by('-students')[:8])
        return Response({
            'days': days,
            'totals': {
                'users': users.count(), 'students': users.filter(role=User.STUDENT).count(),
                'instructors': users.filter(role=User.INSTRUCTOR).count(), 'admins': users.filter(role=User.ADMIN).count(),
                'new_users': users.filter(created_at__gte=since).count(),
                'courses': courses.count(), 'published': courses.filter(is_published=True).count(),
                'pending': courses.filter(status__in=[Course.SUBMITTED, Course.IN_REVIEW]).count(),
                'enrollments': enrollments.count(), 'new_enrollments': enrollments.filter(created_at__gte=since).count(),
                'revenue': analytics.money(paid.aggregate(t=Sum('total'))['t']),
                'period_revenue': analytics.money(paid.filter(paid_at__gte=since).aggregate(t=Sum('total'))['t']),
                'orders': Order.objects.count(), 'orders_to_check': Order.objects.filter(status=Order.PROCESSING).count(),
                'refunds': Order.objects.filter(status=Order.REFUNDED).count(),
                'refunded': analytics.money(Order.objects.filter(status=Order.REFUNDED).aggregate(t=Sum('total'))['t']),
                'certificates': Certificate.objects.filter(revoked_at__isnull=True).count(),
                'reviews': Review.objects.count(), 'open_reports': Report.objects.filter(status=Report.OPEN).count(),
            },
            'user_growth': analytics.series(users, 'created_at', days),
            'enrollment_growth': analytics.series(enrollments, 'created_at', days),
            'revenue': analytics.series(paid, 'paid_at', days, total='total'),
            'course_growth': analytics.series(courses, 'created_at', days),
            'popular_courses': [{'slug': c.slug, 'title': c.title, 'students': stats[c.id]['student_count'],
                                 'rating': stats[c.id]['rating_average'], 'reviews': stats[c.id]['rating_count']} for c in popular],
            'popular_categories': [{'id': c.id, 'name': c.name, 'courses': c.courses_n, 'students': c.students} for c in categories],
        })


# ---------------------------------------------------------------- course reviews

def course_review_row(course, stats):
    owner = course.instructor
    return {'id': course.id, 'slug': course.slug, 'title': course.title, 'subtitle': course.subtitle, 'thumbnail': course.thumbnail,
            'status': course.status, 'status_display': course.get_status_display(), 'is_published': course.is_published,
            'review_note': course.review_note, 'submitted_at': course.submitted_at, 'updated_at': course.updated_at,
            'price': analytics.money(course.price) if course.price else None,
            'category': course.category.name if course.category_id else None,
            'instructor': {'id': owner.id, 'name': owner.get_full_name(), 'email': owner.email} if owner else None,
            'stats': stats}


class CourseQueueView(APIView):
    permission_classes = [IsAdmin]

    def get(self, request):
        courses = Course.objects.select_related('instructor', 'category').order_by('-submitted_at', '-updated_at')
        counts = dict(Course.objects.values_list('status').annotate(n=Count('id')))
        wanted = request.query_params.get('status')
        if wanted == 'pending':
            courses = courses.filter(status__in=[Course.SUBMITTED, Course.IN_REVIEW])
        elif wanted in dict(Course.STATUSES):
            courses = courses.filter(status=wanted)
        courses = list(courses[:300])
        stats = stats_for(courses)
        return Response({'counts': {s: counts.get(s, 0) for s, _ in Course.STATUSES},
                         'courses': [course_review_row(c, stats[c.id]) for c in courses]})


REVIEW_ACTIONS = {
    # action: (allowed from, new status, audit action, notification kind, title)
    'start': ([Course.SUBMITTED], Course.IN_REVIEW, 'course_review_started', 'course_review', 'Your course is being reviewed'),
    'approve': ([Course.SUBMITTED, Course.IN_REVIEW, Course.CHANGES, Course.REJECTED], Course.APPROVED, 'course_approved', 'course_approved', 'Your course was approved'),
    'request_changes': ([Course.SUBMITTED, Course.IN_REVIEW, Course.APPROVED], Course.CHANGES, 'course_changes_requested', 'course_review', 'Changes requested on your course'),
    'reject': ([Course.SUBMITTED, Course.IN_REVIEW, Course.APPROVED, Course.CHANGES], Course.REJECTED, 'course_rejected', 'course_rejected', 'Your course was not approved'),
}


class CourseReviewView(APIView):
    permission_classes = [IsAdmin]

    def post(self, request, slug):
        course = get_object_or_404(Course.objects.select_related('instructor'), slug=slug)
        action = request.data.get('action')
        note = str(request.data.get('note', '')).strip()[:3000]
        if action in ('publish', 'unpublish'):
            course.is_published = action == 'publish'
            course.save()
            audit.record(request, f'course_{action}ed', course)
            if course.instructor:
                notify(course.instructor, 'course_approved', f'{course.title} is {"live" if course.is_published else "no longer live"}',
                       note, f'/instructor/courses/{course.slug}')
            return Response(course_review_row(course, stats_for([course])[course.id]))
        if action not in REVIEW_ACTIONS:
            return Response({'action': 'Choose start, approve, request_changes, reject, publish or unpublish.'}, status=status.HTTP_400_BAD_REQUEST)
        allowed, new, audit_action, kind, title = REVIEW_ACTIONS[action]
        if course.status not in allowed:
            return Response({'detail': f'This course is {course.get_status_display().lower()}.'}, status=status.HTTP_400_BAD_REQUEST)
        if action in ('reject', 'request_changes') and not note:
            return Response({'note': 'Tell the instructor what needs to change.'}, status=status.HTTP_400_BAD_REQUEST)
        with transaction.atomic():
            if course.is_published and new in (Course.CHANGES, Course.REJECTED):
                course.is_published = False
            course.status = new
            if action != 'start':
                course.review_note = note
            course.save()
        audit.record(request, audit_action, course, note=note)
        if course.instructor:
            notify(course.instructor, kind, f'{title}: {course.title}', note or ('You can now publish it.' if new == Course.APPROVED else ''),
                   f'/instructor/courses/{course.slug}')
        return Response(course_review_row(course, stats_for([course])[course.id]))


# ---------------------------------------------------------------- categories

def category_data(category, counts):
    return {'id': category.id, 'name': category.name, 'slug': category.slug, 'parent': category.parent_id,
            'description': category.description, 'icon': category.icon, 'image': category.image,
            'sort_order': category.sort_order, 'is_active': category.is_active, 'course_count': counts.get(category.id, 0)}


def category_counts():
    counts = {}
    for row in Course.objects.filter(is_published=True).values('category_id').annotate(n=Count('id')):
        counts[row['category_id']] = row['n']
    for row in Course.objects.filter(is_published=True).values('subcategory_id').annotate(n=Count('id')):
        counts[row['subcategory_id']] = row['n']
    return counts


def category_tree(active_only=False):
    rows = Category.objects.all()
    if active_only:
        rows = rows.filter(is_active=True)
    counts = category_counts()
    top = [c for c in rows if c.parent_id is None]
    return [{**category_data(c, counts), 'children': [category_data(k, counts) for k in rows if k.parent_id == c.id]} for c in top]


class PublicCategoriesView(APIView):
    permission_classes = [AllowAny]

    def get(self, request):
        return Response(category_tree(active_only=True))


def _category_fields(request, instance=None):
    data = request.data
    name = str(data.get('name', instance.name if instance else '')).strip()[:80]
    if not name:
        return None, {'name': 'Give the category a name.'}
    parent = instance.parent if instance else None
    if 'parent' in data:
        parent = Category.objects.filter(pk=data['parent'], parent__isnull=True).first() if data['parent'] else None
        if data['parent'] and not parent:
            return None, {'parent': 'Choose a top-level category as the parent.'}
        if instance and parent and (parent.id == instance.id or instance.children.exists()):
            return None, {'parent': 'A category with subcategories cannot become a subcategory.'}
    fields = {'name': name, 'parent': parent}
    for key, limit in (('description', 2000), ('icon', 30), ('image', 300)):
        if key in data:
            fields[key] = str(data[key] or '').strip()[:limit]
    if 'sort_order' in data:
        try:
            fields['sort_order'] = max(0, int(data['sort_order']))
        except (TypeError, ValueError):
            pass
    if 'is_active' in data:
        fields['is_active'] = bool(data['is_active'])
    if 'slug' in data and str(data['slug']).strip():
        slug = slugify(str(data['slug']))[:90]
        if Category.objects.filter(slug=slug).exclude(pk=getattr(instance, 'pk', None)).exists():
            return None, {'slug': 'Another category uses this web address.'}
        fields['slug'] = slug
    return fields, None


class CategoriesView(APIView):
    permission_classes = [IsAdmin]

    def get(self, request):
        return Response(category_tree())

    def post(self, request):
        fields, errors = _category_fields(request)
        if errors:
            return Response(errors, status=status.HTTP_400_BAD_REQUEST)
        fields.setdefault('slug', unique_slug(Category, fields['name']))
        category = Category.objects.create(**fields)
        audit.record(request, 'category_created', category)
        return Response(category_data(category, {}), status=status.HTTP_201_CREATED)


class CategoryDetailView(APIView):
    permission_classes = [IsAdmin]

    def patch(self, request, pk):
        category = get_object_or_404(Category, pk=pk)
        fields, errors = _category_fields(request, category)
        if errors:
            return Response(errors, status=status.HTTP_400_BAD_REQUEST)
        for key, value in fields.items():
            setattr(category, key, value)
        category.save()
        return Response(category_data(category, category_counts()))

    def delete(self, request, pk):
        category = get_object_or_404(Category, pk=pk)
        audit.record(request, 'category_deleted', category)
        category.delete()  # courses keep working without a category
        return Response(status=status.HTTP_204_NO_CONTENT)


# ---------------------------------------------------------------- review moderation

def review_row(review):
    return {'id': review.id, 'rating': review.rating, 'comment': review.comment, 'is_hidden': review.is_hidden,
            'moderation_note': review.moderation_note, 'created_at': review.created_at,
            'student': {'id': review.student_id, 'name': review.student.get_full_name() or review.student.email},
            'course': {'slug': review.course.slug, 'title': review.course.title},
            'reports': getattr(review, 'report_count', 0)}


class ReviewModerationView(APIView):
    permission_classes = [IsAdmin]

    def get(self, request):
        reported = Report.objects.filter(target_type=Report.REVIEW, status=Report.OPEN).values_list('target_id', flat=True)
        reviews = Review.objects.select_related('student', 'course')
        hidden = request.query_params.get('hidden')
        if hidden in ('true', 'false'):
            reviews = reviews.filter(is_hidden=hidden == 'true')
        if request.query_params.get('reported') == 'true':
            reviews = reviews.filter(id__in=list(reported))
        rating = request.query_params.get('rating')
        if rating and rating.isdigit():
            reviews = reviews.filter(rating=int(rating))
        query = request.query_params.get('q', '').strip()
        if query:
            reviews = reviews.filter(Q(comment__icontains=query) | Q(course__title__icontains=query) | Q(student__email__icontains=query))
        report_counts = dict(Report.objects.filter(target_type=Report.REVIEW, status=Report.OPEN).values_list('target_id').annotate(n=Count('id')))
        rows = []
        for review in reviews[:300]:
            review.report_count = report_counts.get(review.id, 0)
            rows.append(review_row(review))
        return Response(rows)


class ReviewModerateView(APIView):
    permission_classes = [IsAdmin]

    def post(self, request, pk):
        review = get_object_or_404(Review.objects.select_related('student', 'course'), pk=pk)
        action = request.data.get('action')
        note = str(request.data.get('note', '')).strip()[:300]
        if action == 'hide':
            review.is_hidden, review.moderation_note = True, note
            review.save(update_fields=['is_hidden', 'moderation_note', 'updated_at'])
        elif action == 'show':
            review.is_hidden, review.moderation_note = False, ''
            review.save(update_fields=['is_hidden', 'moderation_note', 'updated_at'])
        elif action == 'delete':
            audit.record(request, 'review_deleted', review, label=f'{review.course.title}: {review.rating}★', note=note)
            review.delete()
            return Response(status=status.HTTP_204_NO_CONTENT)
        else:
            return Response({'action': 'Choose hide, show or delete.'}, status=status.HTTP_400_BAD_REQUEST)
        audit.record(request, f'review_{"hidden" if review.is_hidden else "shown"}', review, label=f'{review.course.title}: {review.rating}★', note=note)
        return Response(review_row(review))


# ---------------------------------------------------------------- reports

REPORTABLE = {Report.COURSE: Course, Report.REVIEW: Review, Report.THREAD: Thread, Report.REPLY: Reply}


def _target_label(kind, obj):
    if obj is None:
        return ''
    if kind == Report.COURSE:
        return obj.title
    if kind == Report.REVIEW:
        return f'{obj.rating}★ on {obj.course.title}: {obj.comment[:120]}'
    if kind == Report.THREAD:
        return f'Question: {obj.title}'
    if kind == Report.REPLY:
        return f'Answer: {obj.body[:150]}'
    return str(obj)


def _target_link(kind, obj):
    if obj is None:
        return ''
    if kind == Report.COURSE:
        return f'/courses/{obj.slug}'
    if kind == Report.REVIEW:
        return f'/courses/{obj.course.slug}#reviews'
    if kind == Report.THREAD:
        return f'/courses/{obj.course.slug}'
    if kind == Report.REPLY:
        return f'/courses/{obj.thread.course.slug}'
    return ''


class ReportCreateView(APIView):
    permission_classes = [IsAuthenticated]

    def post(self, request):
        kind = request.data.get('target_type')
        if kind not in dict(Report.TARGETS):
            return Response({'target_type': 'Say what you are reporting.'}, status=status.HTTP_400_BAD_REQUEST)
        reason = request.data.get('reason') or 'other'
        if reason not in dict(Report.REASONS):
            return Response({'reason': 'Choose a reason.'}, status=status.HTTP_400_BAD_REQUEST)
        target = None
        if kind in REPORTABLE:
            target = REPORTABLE[kind].objects.filter(pk=request.data.get('target_id')).first()
            if not target:
                return Response({'target_id': 'That item no longer exists.'}, status=status.HTTP_400_BAD_REQUEST)
        details = str(request.data.get('details', '')).strip()[:2000]
        if kind == Report.OTHER and not details:
            return Response({'details': 'Tell us what is wrong.'}, status=status.HTTP_400_BAD_REQUEST)
        if Report.objects.filter(reporter=request.user, target_type=kind, target_id=getattr(target, 'pk', None), status=Report.OPEN).exists():
            return Response({'detail': 'You already reported this. Our team will look at it.'}, status=status.HTTP_200_OK)
        report = Report.objects.create(reporter=request.user, target_type=kind, target_id=getattr(target, 'pk', None),
                                       target_label=_target_label(kind, target)[:250], reason=reason, details=details)
        notify_admins('report', f'New report: {report.get_target_type_display()}', report.target_label[:200], '/admin/moderation')
        return Response({'id': report.id, 'detail': 'Thanks. Our team will review your report.'}, status=status.HTTP_201_CREATED)


def report_row(report):
    target = REPORTABLE[report.target_type].objects.filter(pk=report.target_id).first() if report.target_type in REPORTABLE else None
    return {'id': report.id, 'target_type': report.target_type, 'target_type_display': report.get_target_type_display(),
            'target_id': report.target_id, 'target_label': report.target_label, 'target_exists': target is not None or report.target_type == Report.OTHER,
            'link': _target_link(report.target_type, target), 'hidden': getattr(target, 'is_hidden', None),
            'reason': report.reason, 'reason_display': report.get_reason_display(), 'details': report.details,
            'status': report.status, 'resolution_note': report.resolution_note, 'created_at': report.created_at, 'resolved_at': report.resolved_at,
            'reporter': {'id': report.reporter_id, 'name': report.reporter.get_full_name() if report.reporter else 'Deleted user'},
            'resolved_by': report.resolved_by.get_full_name() if report.resolved_by else None}


class ReportsView(APIView):
    permission_classes = [IsAdmin]

    def get(self, request):
        reports = Report.objects.select_related('reporter', 'resolved_by')
        wanted = request.query_params.get('status', Report.OPEN)
        if wanted in (Report.OPEN, Report.RESOLVED, Report.DISMISSED):
            reports = reports.filter(status=wanted)
        counts = dict(Report.objects.values_list('status').annotate(n=Count('id')))
        return Response({'counts': {s: counts.get(s, 0) for s in (Report.OPEN, Report.RESOLVED, Report.DISMISSED)},
                         'reports': [report_row(r) for r in reports[:300]]})


class ReportDecisionView(APIView):
    permission_classes = [IsAdmin]

    def post(self, request, pk):
        report = get_object_or_404(Report, pk=pk)
        action = request.data.get('action')
        if action not in ('resolve', 'dismiss'):
            return Response({'action': 'Choose resolve or dismiss.'}, status=status.HTTP_400_BAD_REQUEST)
        note = str(request.data.get('note', '')).strip()[:500]
        removed = ''
        if action == 'resolve' and request.data.get('remove') and report.target_type in REPORTABLE:
            target = REPORTABLE[report.target_type].objects.filter(pk=report.target_id).first()
            if target is not None:
                if report.target_type == Report.REVIEW:
                    target.is_hidden, target.moderation_note = True, note or 'Hidden after a report'
                    target.save(update_fields=['is_hidden', 'moderation_note', 'updated_at'])
                    removed = 'review hidden'
                elif report.target_type == Report.COURSE:
                    target.is_published = False
                    target.save()
                    removed = 'course unpublished'
                else:
                    target.delete()
                    removed = f'{report.get_target_type_display().lower()} deleted'
        report.status = Report.RESOLVED if action == 'resolve' else Report.DISMISSED
        report.resolution_note, report.resolved_by, report.resolved_at = note, request.user, timezone.now()
        report.save()
        # Other open reports about the same thing are settled too
        Report.objects.filter(target_type=report.target_type, target_id=report.target_id, status=Report.OPEN).exclude(pk=report.pk).update(
            status=report.status, resolution_note=note, resolved_by=request.user, resolved_at=timezone.now())
        audit.record(request, f'report_{report.status}', report, label=report.target_label, removed=removed, note=note)
        return Response(report_row(report))


# ---------------------------------------------------------------- certificates

class CertificatesView(APIView):
    permission_classes = [IsAdmin]

    def get(self, request):
        rows = Certificate.objects.select_related('enrollment__student', 'enrollment__course').order_by('-issued_at')
        query = request.query_params.get('q', '').strip()
        if query:
            rows = rows.filter(Q(code__icontains=query) | Q(enrollment__student__email__icontains=query) | Q(enrollment__student__first_name__icontains=query)
                               | Q(enrollment__student__last_name__icontains=query) | Q(enrollment__course__title__icontains=query))
        if request.query_params.get('revoked') == 'true':
            rows = rows.filter(revoked_at__isnull=False)
        return Response([{**certificate_data(c), 'revoke_reason': c.revoke_reason, 'student_email': c.enrollment.student.email} for c in rows[:300]])


class CertificateActionView(APIView):
    permission_classes = [IsAdmin]

    def post(self, request, code):
        certificate = get_object_or_404(Certificate.objects.select_related('enrollment__student', 'enrollment__course'), code=code.upper())
        action = request.data.get('action')
        reason = str(request.data.get('reason', '')).strip()[:300]
        if action == 'revoke':
            if not reason:
                return Response({'reason': 'Say why the certificate is revoked.'}, status=status.HTTP_400_BAD_REQUEST)
            certificate.revoked_at, certificate.revoke_reason = timezone.now(), reason
        elif action == 'restore':
            certificate.revoked_at, certificate.revoke_reason = None, ''
        else:
            return Response({'action': 'Choose revoke or restore.'}, status=status.HTTP_400_BAD_REQUEST)
        certificate.save(update_fields=['revoked_at', 'revoke_reason'])
        audit.record(request, f'certificate_{"revoked" if certificate.revoked_at else "restored"}', certificate,
                     label=f'{certificate.code} ({certificate.enrollment.student.get_full_name()})', reason=reason)
        return Response({**certificate_data(certificate), 'revoke_reason': certificate.revoke_reason})


# ---------------------------------------------------------------- audit log

class AuditLogView(APIView):
    permission_classes = [IsAdmin]

    def get(self, request):
        rows = AuditLog.objects.select_related('actor')
        action = request.query_params.get('action')
        if action:
            rows = rows.filter(action=action)
        query = request.query_params.get('q', '').strip()
        if query:
            rows = rows.filter(Q(target_label__icontains=query) | Q(actor__email__icontains=query) | Q(actor__first_name__icontains=query)
                               | Q(actor__last_name__icontains=query) | Q(action__icontains=query))
        return Response({
            'actions': sorted(AuditLog.objects.values_list('action', flat=True).distinct()),
            'entries': [{'id': e.id, 'action': e.action, 'target_type': e.target_type, 'target_id': e.target_id, 'target_label': e.target_label,
                         'details': e.details, 'ip_address': e.ip_address, 'created_at': e.created_at,
                         'actor': {'id': e.actor_id, 'name': e.actor.get_full_name() or e.actor.email} if e.actor else None}
                        for e in rows[:500]],
        })


# ---------------------------------------------------------------- users

class CreateUserView(APIView):
    permission_classes = [IsAdmin]

    def post(self, request):
        data = request.data
        email = str(data.get('email', '')).strip().lower()
        errors = {}
        if not email or '@' not in email:
            errors['email'] = 'Enter an email address.'
        elif User.objects.filter(email__iexact=email).exists():
            errors['email'] = 'An account with this email already exists.'
        first, last = str(data.get('first_name', '')).strip()[:150], str(data.get('last_name', '')).strip()[:150]
        if not first:
            errors['first_name'] = 'Enter the first name.'
        if not last:
            errors['last_name'] = 'Enter the last name.'
        role = data.get('role') or User.STUDENT
        if role not in dict(User.ROLE_CHOICES):
            errors['role'] = 'Choose a role.'
        elif role == User.ADMIN and not request.user.is_superuser:
            errors['role'] = 'Only a super administrator can create administrators.'
        password = str(data.get('password', ''))
        if not errors:
            try:
                validate_password(password)
            except ValidationError as exc:
                errors['password'] = ' '.join(exc.messages)
        if errors:
            return Response(errors, status=status.HTTP_400_BAD_REQUEST)
        user = User.objects.create_user(email=email, password=password, first_name=first, last_name=last, role=role,
                                        is_verified=True, approval_status=User.APPROVED, approved_at=timezone.now(), approved_by=request.user)
        audit.record(request, 'user_created', user, label=f'{user.get_full_name()} ({user.email})', role=role)
        return Response({'id': user.id, 'email': user.email, 'role': user.role}, status=status.HTTP_201_CREATED)


class EditUserView(APIView):
    """PATCH /lms/admin/users/<id>/ {first_name, last_name, email, phone_number, country, in_training, in_scholarships}"""
    permission_classes = [IsAdmin]
    FIELDS = {'first_name': 150, 'last_name': 150, 'email': 254, 'phone_number': 20, 'country': 100}
    SWITCHES = ['in_training', 'in_scholarships']  # a student's dashboards

    def patch(self, request, pk):
        user = get_object_or_404(User, pk=pk)
        if user.is_superuser and not request.user.is_superuser:
            return Response({'detail': 'Only a super administrator can edit a super administrator.'}, status=status.HTTP_403_FORBIDDEN)
        changes, errors = {}, {}
        for field, limit in self.FIELDS.items():
            if field not in request.data:
                continue
            value = str(request.data.get(field) or '').strip()[:limit]
            if field in ('first_name', 'last_name') and not value:
                errors[field] = 'This cannot be empty.'
            if field == 'email':
                value = value.lower()
                if '@' not in value:
                    errors[field] = 'Enter an email address.'
                elif User.objects.filter(email__iexact=value).exclude(pk=user.pk).exists():
                    errors[field] = 'Another account uses this email.'
            if value != (getattr(user, field) or ''):
                changes[field] = value or (None if field in ('phone_number', 'country') else value)
        for field in self.SWITCHES:
            if field in request.data:
                value = request.data.get(field) in (True, 'true', '1', 1)
                if value != getattr(user, field):
                    changes[field] = value
        if errors:
            return Response(errors, status=status.HTTP_400_BAD_REQUEST)
        for field, value in changes.items():
            setattr(user, field, value)
        if changes:
            user.save(update_fields=[*changes, 'updated_at'])
            audit.record(request, 'user_edited', user, label=f'{user.get_full_name()} ({user.email})', fields=', '.join(changes))
        return Response({'id': user.id, **{f: getattr(user, f) for f in [*self.FIELDS, *self.SWITCHES]}, 'tracks': user.tracks})


class BroadcastView(APIView):
    """POST /lms/admin/notify/ {audience: students|instructors|everyone, title, body, link}: a system notification."""
    permission_classes = [IsAdmin]
    AUDIENCES = {'students': [User.STUDENT], 'instructors': [User.INSTRUCTOR], 'everyone': None}

    def post(self, request):
        audience = request.data.get('audience', 'students')
        title = str(request.data.get('title', '')).strip()[:200]
        if audience not in self.AUDIENCES:
            return Response({'audience': 'Choose who to notify.'}, status=status.HTTP_400_BAD_REQUEST)
        if not title:
            return Response({'title': 'Write a title.'}, status=status.HTTP_400_BAD_REQUEST)
        users = User.objects.filter(is_active=True)
        if self.AUDIENCES[audience]:
            users = users.filter(role__in=self.AUDIENCES[audience])
        users = list(users)
        notify(users, 'system', title, str(request.data.get('body', '')).strip()[:500], str(request.data.get('link', '')).strip()[:300])
        audit.record(request, 'notification_sent', label=title, audience=audience, recipients=len(users))
        return Response({'sent': len(users)}, status=status.HTTP_201_CREATED)


class UserLearningView(APIView):
    permission_classes = [IsAdmin]

    def get(self, request, pk):
        user = get_object_or_404(User, pk=pk)
        return Response({
            'user': {'id': user.id, 'name': user.get_full_name(), 'email': user.email, 'role': user.role},
            'learning': learning_rows(user),
            'enrollments': [{'id': e.id, 'course': {'slug': e.course.slug, 'title': e.course.title}, 'status': e.status, 'created_at': e.created_at}
                            for e in TrainingEnrollment.objects.filter(student=user).select_related('course')],
            'orders': [order_data(o, admin=True) for o in Order.objects.filter(student=user).select_related('student', 'coupon')[:50]],
            'certificates': [certificate_data(c) for c in Certificate.objects.filter(enrollment__student=user).select_related('enrollment__course', 'enrollment__student')],
            'reviews': [{'id': r.id, 'course': r.course.title, 'rating': r.rating, 'comment': r.comment, 'is_hidden': r.is_hidden, 'created_at': r.created_at}
                        for r in Review.objects.filter(student=user).select_related('course')],
            'teaching': [{'slug': c.slug, 'title': c.title, 'status': c.status} for c in Course.objects.filter(instructor=user)],
        })


class GrantEnrollmentView(APIView):
    permission_classes = [IsAdmin]

    def post(self, request, pk):
        user = get_object_or_404(User, pk=pk)
        course = get_object_or_404(Course, slug=str(request.data.get('slug', '')))
        enrollment, created = TrainingEnrollment.objects.get_or_create(student=user, course=course, defaults={'status': TrainingEnrollment.ACTIVE})
        if not created and enrollment.status not in LEARNING:
            enrollment.status = TrainingEnrollment.ACTIVE
            enrollment.save(update_fields=['status', 'updated_at'])
        audit.record(request, 'enrollment_granted', enrollment, label=f'{user.get_full_name()} → {course.title}')
        notify(user, 'enrollment', f'You’re enrolled on {course.title}', 'ADRAM gave you access to this course.', f'/courses/{course.slug}')
        return Response({'status': enrollment.status}, status=status.HTTP_201_CREATED if created else status.HTTP_200_OK)
