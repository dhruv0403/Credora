from rest_framework.permissions import BasePermission
from django.http import Http404
from api.models import SpaceMember, MemberStatus, MemberRole

class IsSpaceMember(BasePermission):
    """
    Checks if the user has an active membership in the space specified in the URL.
    Raises Http404 if not a member (to prevent leaking space existence).
    """
    def has_permission(self, request, view):
        if not request.user or not request.user.is_authenticated:
            return False

        space_id = view.kwargs.get('space_id')
        if not space_id:
            # If space_id is not in kwargs, try checking request.data or query params if needed,
            # but primary design is space-nested URLs.
            return True

        try:
            member = SpaceMember.objects.select_related('space').get(
                space_id=space_id,
                user=request.user,
                status=MemberStatus.ACTIVE
            )
            # Store on request for downstream usage in views/serializers
            request.space_member = member
            request.space = member.space
            return True
        except SpaceMember.DoesNotExist:
            raise Http404("Space not found")


class IsOwner(BasePermission):
    """
    Requires the member to be the OWNER of the space.
    """
    def has_permission(self, request, view):
        return (
            hasattr(request, 'space_member') and
            request.space_member.role == MemberRole.OWNER
        )


class IsOwnerOrAdmin(BasePermission):
    """
    Requires the member to be OWNER or ADMIN.
    """
    def has_permission(self, request, view):
        return (
            hasattr(request, 'space_member') and
            request.space_member.role in [MemberRole.OWNER, MemberRole.ADMIN]
        )


class CanWrite(BasePermission):
    """
    Excludes VIEWERS (allows OWNER, ADMIN, FIELDMAN).
    Note: For contacts and loans, FieldMan is allowed view only, but API Spec gates
    different operations specifically (e.g. POST contacts is gated by CanWrite which
    FieldMan can access in some cases, or FieldMan might be blocked on specific views).
    We will declare CanWrite/ExcludesFieldMan per action as defined in API Spec §15.
    """
    def has_permission(self, request, view):
        return (
            hasattr(request, 'space_member') and
            request.space_member.role != MemberRole.VIEWER
        )


class CanRecordCollection(BasePermission):
    """
    Requires OWNER, ADMIN, or FIELDMAN. Excludes VIEWERS.
    """
    def has_permission(self, request, view):
        return (
            hasattr(request, 'space_member') and
            request.space_member.role in [MemberRole.OWNER, MemberRole.ADMIN, MemberRole.FIELDMAN]
        )


class ExcludesFieldMan(BasePermission):
    """
    Excludes FIELDMAN (allows OWNER, ADMIN, VIEWER).
    Used for dashboard, reports, analytics, and activity log.
    """
    def has_permission(self, request, view):
        return (
            hasattr(request, 'space_member') and
            request.space_member.role != MemberRole.FIELDMAN
        )

