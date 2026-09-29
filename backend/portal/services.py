from datetime import timedelta

from django.db import transaction
from django.utils import timezone

from catalog.models import Scholarship
from .models import DEFAULT_DOCUMENTS, Application, ApplicationDocument, PortalEvent

VIEW_DEDUPE = timedelta(minutes=30)


def track(user, kind, scholarship=None, detail='', label=''):
    """Record a portal event for a signed-in student. Repeat views within 30 minutes count once."""
    if not (user and user.is_authenticated):
        return
    if kind == PortalEvent.VIEWED and PortalEvent.objects.filter(
            user=user, kind=kind, scholarship=scholarship, created_at__gte=timezone.now() - VIEW_DEDUPE).exists():
        return
    PortalEvent.objects.create(user=user, kind=kind, scholarship=scholarship, detail=detail,
                               label=label or (scholarship.name if scholarship else ''))


@transaction.atomic
def start_application(student, scholarship=None, name='', by=None, **fields):
    """Creates an application with the standard documents checklist (or returns the existing one)."""
    if scholarship:
        existing = Application.objects.filter(student=student, scholarship=scholarship).first()
        if existing:
            return existing, False
    application = Application.objects.create(
        student=student, scholarship=scholarship, scholarship_name=scholarship.name if scholarship else name,
        created_by=by, updated_by=by, **fields,
        advice_stage=fields.get('stage', Application.INTERESTED) if fields.get('next_step') or fields.get('counsellor_note') else '',
    )
    if not application.deadline and scholarship and scholarship.deadline:
        application.deadline = scholarship.deadline
        application.save(update_fields=['deadline'])
    # The checklist is what the admin asks for on this scholarship, or the usual documents.
    documents = (scholarship.service_requirements if scholarship and scholarship.service_enabled else None) or DEFAULT_DOCUMENTS
    ApplicationDocument.objects.bulk_create(
        ApplicationDocument(application=application, name=doc[:200], order=i) for i, doc in enumerate(documents))
    track(student, PortalEvent.STARTED, scholarship, label=application.scholarship_name,
          detail='' if by == student or by is None else f'Added by {by.get_full_name()}')
    return application, True


def recommended_for(user, limit=4):
    """
    Published scholarships the student hasn't saved or started, best matches first:
    level and destination from their study goals, then fully funded, then an upcoming deadline.
    """
    goals = getattr(user, 'study_goals', None)
    levels = set(goals.levels) if goals else set()
    destinations = set(goals.destinations) if goals else set()
    taken = set(user.saved_scholarships.values_list('scholarship_id', flat=True)) | set(
        user.applications.exclude(scholarship=None).values_list('scholarship_id', flat=True))
    today = timezone.localdate()

    def score(s):
        points = 0
        if levels and levels & set(s.levels):
            points += 3
        if destinations and s.country in destinations:
            points += 3
        if s.funding == Scholarship.FULL:
            points += 1
        if s.deadline and s.deadline >= today:
            points += 1
        return points

    candidates = [s for s in Scholarship.objects.filter(is_published=True) if s.pk not in taken]
    # Stable sort keeps the admin's website order among equal scores.
    return sorted(candidates, key=score, reverse=True)[:limit]
