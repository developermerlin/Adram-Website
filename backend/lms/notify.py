"""
In-site notifications (the bell). Call `notify(...)` wherever something happens that a user should hear about;
emails stay in `emails.py`. New channels (push, SMS) can hook in here later without touching the callers.
"""
import logging

from accounts.models import User

from .models import Notification

logger = logging.getLogger(__name__)


def notify(users, kind, title, body='', link=''):
    """Adds a notification for each user (a user, or a list/queryset of users). Never raises."""
    if users is None:
        return
    if isinstance(users, User):
        users = [users]
    users = [u for u in users if u is not None]
    try:
        Notification.objects.bulk_create([
            Notification(user=u, kind=kind, title=title[:200], body=(body or '')[:500], link=(link or '')[:300])
            for u in users
        ])
    except Exception:
        logger.exception('Could not save notifications (%s)', kind)
    from .mobile import push  # and to their phones, when they use the app
    push([u.pk for u in users], title, body, link)


def notify_admins(kind, title, body='', link=''):
    notify(list(User.objects.filter(role=User.ADMIN, is_active=True)), kind, title, body, link)
