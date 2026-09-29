from rest_framework.permissions import BasePermission

from accounts.models import User


def is_scholarship_editor(user):
    return bool(user and user.is_authenticated and user.role in (User.ADMIN, User.SCHOLARSHIP_MANAGER))


class CanManageScholarships(BasePermission):
    """Administrators and scholarship managers."""
    message = 'Only administrators and scholarship managers can edit scholarships.'

    def has_permission(self, request, view):
        return is_scholarship_editor(request.user)
