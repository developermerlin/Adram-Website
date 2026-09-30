"""The audit trail of important administrative actions (course approved, user suspended, payment refunded...)."""
import logging

from .models import AuditLog

logger = logging.getLogger(__name__)


def _ip(request):
    if request is None:
        return None
    forwarded = request.META.get('HTTP_X_FORWARDED_FOR', '')
    return (forwarded.split(',')[0].strip() or request.META.get('REMOTE_ADDR')) or None


def record(request, action, target=None, label='', **details):
    """Writes one audit entry. `request` gives the actor and address; `target` is any model instance. Never raises."""
    try:
        actor = getattr(request, 'user', None)
        AuditLog.objects.create(
            actor=actor if actor is not None and actor.is_authenticated else None,
            action=action,
            target_type=type(target).__name__.lower() if target is not None else '',
            target_id=str(target.pk) if target is not None else '',
            target_label=(label or (str(target) if target is not None else ''))[:250],
            details={k: v if isinstance(v, (str, int, float, bool, type(None))) else str(v) for k, v in details.items()},
            ip_address=_ip(request),
        )
    except Exception:
        logger.exception('Could not write the audit entry %s', action)
