from rest_framework.permissions import BasePermission
from django.contrib.auth import get_user_model

User = get_user_model()


class IsAdmin(BasePermission):
    """
    Permission to check if user is an admin.
    """
    message = 'Only administrators can access this resource.'

    def has_permission(self, request, view):
        return (
            request.user and
            request.user.is_authenticated and
            request.user.role == User.ADMIN
        )


class IsScholarshipManager(BasePermission):
    """
    Permission to check if user is a scholarship manager.
    """
    message = 'Only scholarship managers can access this resource.'

    def has_permission(self, request, view):
        return (
            request.user and
            request.user.is_authenticated and
            request.user.role == User.SCHOLARSHIP_MANAGER
        )


class IsFinanceManager(BasePermission):
    """
    Permission to check if user is a finance manager.
    """
    message = 'Only finance managers can access this resource.'

    def has_permission(self, request, view):
        return (
            request.user and
            request.user.is_authenticated and
            request.user.role == User.FINANCE_MANAGER
        )


class IsCounsellor(BasePermission):
    """
    Permission to check if user is a counsellor.
    """
    message = 'Only counsellors can access this resource.'

    def has_permission(self, request, view):
        return (
            request.user and
            request.user.is_authenticated and
            request.user.role == User.COUNSELLOR
        )


class IsStudent(BasePermission):
    """
    Permission to check if user is a student.
    """
    message = 'Only students can access this resource.'

    def has_permission(self, request, view):
        return (
            request.user and
            request.user.is_authenticated and
            request.user.role == User.STUDENT
        )


class IsAdminOrScholarshipManager(BasePermission):
    """
    Permission for admin or scholarship manager access.
    """
    message = 'Only admins or scholarship managers can access this resource.'

    def has_permission(self, request, view):
        return (
            request.user and
            request.user.is_authenticated and
            request.user.role in [User.ADMIN, User.SCHOLARSHIP_MANAGER]
        )


class IsAdminOrOwner(BasePermission):
    """
    Permission to check if user is admin or owner of the resource.
    """
    message = 'Only admins or resource owners can access this.'

    def has_object_permission(self, request, view, obj):
        return (
            request.user.role == User.ADMIN or
            obj.user == request.user
        )


class IsVerifiedUser(BasePermission):
    """
    Permission to check if user's email is verified.
    """
    message = 'User email must be verified to access this resource.'

    def has_permission(self, request, view):
        return (
            request.user and
            request.user.is_authenticated and
            request.user.is_verified
        )
