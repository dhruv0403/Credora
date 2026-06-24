import uuid
from django.db import transaction as db_transaction
from django.db.models import Sum
from django.utils import timezone
from django.shortcuts import get_object_or_404
from rest_framework import viewsets, status
from rest_framework.decorators import action
from rest_framework.response import Response
from rest_framework.permissions import IsAuthenticated

from api.models import (
    SpaceMember, SpacePartner, PartnerCapitalTransaction,
    MemberRole, MemberStatus
)
from api.serializers import SpaceMemberSerializer, InviteMemberSerializer
from api.permissions import IsSpaceMember, IsOwner
from api.exceptions import BusinessValidationError
from decimal import Decimal

def log_activity(space, event_type, entity_type, entity_id, actor_member, description, metadata=None):
    from api.models import ActivityLog
    ActivityLog.objects.create(
        space=space,
        event_type=event_type,
        entity_type=entity_type,
        entity_id=entity_id,
        actor_member=actor_member,
        description=description,
        metadata=metadata
    )

class SpaceMemberViewSet(viewsets.ModelViewSet):
    serializer_class = SpaceMemberSerializer
    permission_classes = [IsAuthenticated, IsSpaceMember]

    def get_queryset(self):
        return SpaceMember.objects.filter(space_id=self.kwargs['space_id'])

    @action(detail=False, methods=['post'], permission_classes=[IsAuthenticated, IsSpaceMember, IsOwner])
    def invite(self, request, space_id=None):
        serializer = InviteMemberSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        
        email = serializer.validated_data['email']
        role = serializer.validated_data['role']
        space = request.space
        
        if SpaceMember.objects.filter(space=space, user__email=email, status=MemberStatus.ACTIVE).exists():
            return Response({"error": {"code": "MEMBER_ALREADY_EXISTS", "message": "User is already an active member."}}, status=400)
            
        with db_transaction.atomic():
            from api.models import User
            user_exists = User.objects.filter(email=email).first()
            member = SpaceMember.objects.create(
                space=space,
                user=user_exists,
                invited_email=email,
                role=role,
                status=MemberStatus.PENDING,
                invited_by=request.space_member
            )
            token = str(uuid.uuid4())
            expires_at = timezone.now() + timezone.timedelta(days=7)
            from api.models import SpaceInvite
            SpaceInvite.objects.create(
                space_member=member,
                token=token,
                expires_at=expires_at
            )
            log_activity(space, "MEMBER_INVITED", "SPACE_MEMBER", member.id, request.space_member, f"Invited {email} as {role}")
            
        return Response({
            "message": "Invite created successfully.",
            "invite_token": token,
            "member": SpaceMemberSerializer(member).data
        })

    def update(self, request, *args, **kwargs):
        self.permission_classes = [IsAuthenticated, IsSpaceMember, IsOwner]
        member = self.get_object()
        if member.role == MemberRole.OWNER and request.data.get('role') != MemberRole.OWNER:
            active_owners = SpaceMember.objects.filter(space=member.space, role=MemberRole.OWNER, status=MemberStatus.ACTIVE).count()
            if active_owners <= 1:
                raise BusinessValidationError(
                    code="SOLE_OWNER_DEMOTION",
                    message="Cannot demote the sole OWNER of the space. Transfer ownership first.",
                    edge_case_ref=1
                )
        return super().update(request, *args, **kwargs)

    def destroy(self, request, *args, **kwargs):
        self.permission_classes = [IsAuthenticated, IsSpaceMember, IsOwner]
        member = self.get_object()
        
        if member.role == MemberRole.OWNER:
            raise BusinessValidationError(
                code="SOLE_OWNER_REMOVAL",
                message="Cannot remove the OWNER of the space. Transfer ownership first.",
                edge_case_ref=1
            )
            
        partner = SpacePartner.objects.filter(space_member=member).first()
        if partner:
            contribs = PartnerCapitalTransaction.objects.filter(space_partner=partner, type='CONTRIBUTION').aggregate(total=Sum('amount'))['total'] or Decimal('0.00')
            withdraws = PartnerCapitalTransaction.objects.filter(space_partner=partner, type='WITHDRAWAL').aggregate(total=Sum('amount'))['total'] or Decimal('0.00')
            initial = partner.initial_contribution_amount or Decimal('0.00')
            net_pos = initial + contribs - withdraws
            if net_pos != 0:
                raise BusinessValidationError(
                    code="PARTNER_NON_ZERO_POSITION",
                    message="Cannot remove member who is a partner with a non-zero capital position.",
                    edge_case_ref=42,
                    status_code=409
                )

        member.status = MemberStatus.REMOVED
        member.removed_at = timezone.now()
        member.save()
        log_activity(member.space, "MEMBER_REMOVED", "SPACE_MEMBER", member.id, request.space_member, f"Removed member {member.user.display_name if member.user else member.invited_email}")
        return Response(status=status.HTTP_204_NO_CONTENT)

    @action(detail=True, methods=['post'], url_path='resend-invite', permission_classes=[IsAuthenticated, IsSpaceMember, IsOwner])
    def resend_invite(self, request, space_id=None, pk=None):
        member = self.get_object()
        if member.status != MemberStatus.PENDING:
            return Response({"error": {"code": "NOT_PENDING", "message": "Can only resend invite for pending members."}}, status=400)
            
        with db_transaction.atomic():
            from api.models import SpaceInvite
            invite = get_object_or_404(SpaceInvite, space_member=member)
            invite.token = str(uuid.uuid4())
            invite.expires_at = timezone.now() + timezone.timedelta(days=7)
            invite.save()
            log_activity(member.space, "INVITE_RESENT", "SPACE_MEMBER", member.id, request.space_member, f"Resent invite to {member.invited_email}")
            
        return Response({
            "message": "Invite resent successfully.",
            "invite_token": invite.token
        })

