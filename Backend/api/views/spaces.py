import uuid
import datetime
from decimal import Decimal
from django.db import transaction as db_transaction
from django.db.models import Sum
from django.utils import timezone
from django.shortcuts import get_object_or_404

from rest_framework import viewsets, status, generics
from rest_framework.decorators import action
from rest_framework.response import Response
from rest_framework.permissions import IsAuthenticated

from api.models import (
    Space, SpaceSettings, SpaceMember, SpacePartner, Loan, Disbursement,
    TransactionAllocation, RepaymentScheduleLine, ActivityLog,
    SpaceType, SpaceVisibility, MemberRole, MemberStatus, LoanStatus,
    ScheduleLineStatus, TransactionType
)
from api.serializers import SpaceSerializer, SpaceSettingsSerializer, ActivityLogSerializer
from api.permissions import IsSpaceMember, IsOwner, ExcludesFieldMan, CanWrite
from api.exceptions import BusinessValidationError

def log_activity(space, event_type, entity_type, entity_id, actor_member, description, metadata=None):
    ActivityLog.objects.create(
        space=space,
        event_type=event_type,
        entity_type=entity_type,
        entity_id=entity_id,
        actor_member=actor_member,
        description=description,
        metadata=metadata
    )

class SpaceViewSet(viewsets.ModelViewSet):
    serializer_class = SpaceSerializer
    permission_classes = [IsAuthenticated]

    def get_queryset(self):
        return Space.objects.filter(
            members__user=self.request.user,
            members__status=MemberStatus.ACTIVE,
            deleted_at__isnull=True
        )

    def perform_create(self, serializer):
        with db_transaction.atomic():
            space = serializer.save(owner=self.request.user)
            SpaceSettings.objects.create(space=space)
            member = SpaceMember.objects.create(
                space=space,
                user=self.request.user,
                role=MemberRole.OWNER,
                status=MemberStatus.ACTIVE,
                joined_at=timezone.now()
            )
            if not self.request.user.last_active_space:
                self.request.user.last_active_space = space
                self.request.user.save()
            log_activity(space, "SPACE_CREATED", "SPACE", space.id, member, f"Space {space.name} created")

    def get_permissions(self):
        if self.action in ['update', 'partial_update']:
            return [IsAuthenticated(), IsSpaceMember(), CanWrite()]
        elif self.action == 'destroy':
            return [IsAuthenticated(), IsSpaceMember(), IsOwner()]
        elif self.action == 'retrieve':
            return [IsAuthenticated(), IsSpaceMember()]
        elif self.action in ['change_type', 'change_visibility', 'transfer_ownership']:
            return [IsAuthenticated(), IsSpaceMember(), IsOwner()]
        elif self.action == 'dashboard':
            return [IsAuthenticated(), IsSpaceMember(), ExcludesFieldMan()]
        return super().get_permissions()

    def get_object(self):
        space_id = self.kwargs.get('pk') or self.kwargs.get('space_id')
        queryset = self.get_queryset()
        return get_object_or_404(queryset, id=space_id)

    @action(detail=True, methods=['post'], url_path='change-type', permission_classes=[IsAuthenticated, IsSpaceMember, IsOwner])
    def change_type(self, request, space_id=None, pk=None):
        space = self.get_object()
        target_type = request.data.get('target_type')
        confirm = request.data.get('confirm') == True
        
        if target_type not in SpaceType.values:
            return Response({"error": {"code": "INVALID_TYPE", "message": "Invalid space type."}}, status=400)
            
        if space.space_type == target_type:
            return Response({"message": f"Space is already of type {target_type}."})

        if target_type == SpaceType.PERSONAL:
            if SpacePartner.objects.filter(space=space).exists():
                raise BusinessValidationError(
                    code="PARTNERS_EXIST",
                    message="Cannot convert Business space to Personal while partners exist.",
                    edge_case_ref=7,
                    status_code=409
                )
        elif target_type == SpaceType.BUSINESS:
            if Loan.objects.filter(space=space).exists() and not confirm:
                raise BusinessValidationError(
                    code="LOANS_EXIST_CONFIRM_REQUIRED",
                    message="Loans exist. Confirmation required to convert space to Business type.",
                    edge_case_ref=5,
                    status_code=400
                )
        
        space.space_type = target_type
        space.save()
        log_activity(space, "SPACE_TYPE_CHANGED", "SPACE", space.id, request.space_member, f"Space type changed to {target_type}")
        return Response(SpaceSerializer(space, context={'request': request}).data)

    @action(detail=True, methods=['post'], url_path='change-visibility', permission_classes=[IsAuthenticated, IsSpaceMember, IsOwner])
    def change_visibility(self, request, space_id=None, pk=None):
        space = self.get_object()
        target_visibility = request.data.get('target_visibility')
        
        if target_visibility not in SpaceVisibility.values:
            return Response({"error": {"code": "INVALID_VISIBILITY", "message": "Invalid visibility option."}}, status=400)

        if space.space_visibility == target_visibility:
            return Response({"message": f"Space is already {target_visibility}."})

        if target_visibility == SpaceVisibility.PRIVATE:
            active_members_count = SpaceMember.objects.filter(space=space, status=MemberStatus.ACTIVE).count()
            if active_members_count > 1:
                raise BusinessValidationError(
                    code="MULTIPLE_MEMBERS",
                    message="Cannot convert Shared space to Private while multiple active members exist.",
                    edge_case_ref=6,
                    status_code=409
                )

        space.space_visibility = target_visibility
        space.save()
        log_activity(space, "SPACE_VISIBILITY_CHANGED", "SPACE", space.id, request.space_member, f"Space visibility changed to {target_visibility}")
        return Response(SpaceSerializer(space, context={'request': request}).data)

    @action(detail=True, methods=['post'], url_path='transfer-ownership', permission_classes=[IsAuthenticated, IsSpaceMember, IsOwner])
    def transfer_ownership(self, request, space_id=None, pk=None):
        space = self.get_object()
        new_owner_id = request.data.get('new_owner_member_id')
        
        new_owner_member = get_object_or_404(SpaceMember, id=new_owner_id, space=space, status=MemberStatus.ACTIVE)
        
        with db_transaction.atomic():
            current_owner_member = request.space_member
            current_owner_member.role = MemberRole.ADMIN
            current_owner_member.save()
            
            new_owner_member.role = MemberRole.OWNER
            new_owner_member.save()
            
            space.owner = new_owner_member.user
            space.save()
            
            log_activity(space, "OWNER_TRANSFERRED", "SPACE", space.id, current_owner_member, f"Ownership transferred to {new_owner_member.user.display_name}")
            
        return Response({"message": "Ownership transferred successfully."})

    def destroy(self, request, *args, **kwargs):
        space = self.get_object()
        confirm_name = request.data.get('confirm_name')
        if confirm_name != space.name:
            raise BusinessValidationError(
                code="CONFIRM_NAME_MISMATCH",
                message="Confirmation name does not match the space name.",
                edge_case_ref=8
            )
        space.deleted_at = timezone.now()
        space.save()
        log_activity(space, "SPACE_DELETED", "SPACE", space.id, request.space_member, f"Space {space.name} soft-deleted")
        return Response(status=status.HTTP_204_NO_CONTENT)

    @action(detail=True, methods=['get'], url_path='dashboard', permission_classes=[IsAuthenticated, IsSpaceMember, ExcludesFieldMan])
    def dashboard(self, request, space_id=None, pk=None):
        space = self.get_object()
        
        loans = Loan.objects.filter(space=space, status__in=[LoanStatus.ACTIVE, LoanStatus.CLOSED])
        money_given = loans.filter(direction='GIVEN').aggregate(total=Sum('principal_amount'))['total'] or Decimal('0.00')
        money_borrowed = loans.filter(direction='TAKEN').aggregate(total=Sum('principal_amount'))['total'] or Decimal('0.00')
        
        disb_given = Disbursement.objects.filter(loan__space=space, loan__direction='GIVEN').aggregate(total=Sum('amount'))['total'] or Decimal('0.00')
        repaid_given = TransactionAllocation.objects.filter(transaction__space=space, transaction__loan__direction='GIVEN', transaction__is_reversed=False).aggregate(total=Sum('principal_component'))['total'] or Decimal('0.00')
        credit_given = loans.filter(direction='GIVEN').aggregate(total=Sum('advance_credit_balance'))['total'] or Decimal('0.00')
        receivable = max(Decimal('0.00'), disb_given - repaid_given - credit_given)
        
        disb_taken = Disbursement.objects.filter(loan__space=space, loan__direction='TAKEN').aggregate(total=Sum('amount'))['total'] or Decimal('0.00')
        repaid_taken = TransactionAllocation.objects.filter(transaction__space=space, transaction__loan__direction='TAKEN', transaction__is_reversed=False).aggregate(total=Sum('principal_component'))['total'] or Decimal('0.00')
        credit_taken = loans.filter(direction='TAKEN').aggregate(total=Sum('advance_credit_balance'))['total'] or Decimal('0.00')
        payable = max(Decimal('0.00'), disb_taken - repaid_taken - credit_taken)

        interest_earned = TransactionAllocation.objects.filter(
            transaction__space=space,
            transaction__type=TransactionType.INTEREST_RECEIVED,
            transaction__is_reversed=False
        ).aggregate(total=Sum('interest_component'))['total'] or Decimal('0.00')
        
        interest_paid = TransactionAllocation.objects.filter(
            transaction__space=space,
            transaction__type=TransactionType.INTEREST_PAID,
            transaction__is_reversed=False
        ).aggregate(total=Sum('interest_component'))['total'] or Decimal('0.00')

        active_count = Loan.objects.filter(space=space, status=LoanStatus.ACTIVE).count()
        today = timezone.localdate()
        overdue_count = Loan.objects.filter(
            space=space,
            status=LoanStatus.ACTIVE,
            schedule_lines__is_current_version=True,
            schedule_lines__status=ScheduleLineStatus.PENDING,
            schedule_lines__due_date__lt=today
        ).distinct().count()

        upcoming_lines = RepaymentScheduleLine.objects.filter(
            space=space,
            is_current_version=True,
            status=ScheduleLineStatus.PENDING,
            due_date__range=[today, today + datetime.timedelta(days=30)]
        ).order_by('due_date')[:10]
        
        upcoming_payments = [
            {
                "loan_id": line.loan.id,
                "contact_name": line.loan.contact.name,
                "due_date": line.due_date,
                "amount": line.principal_due + line.interest_due,
                "direction": line.loan.direction
            }
            for line in upcoming_lines
        ]

        recent_activity = ActivityLog.objects.filter(space=space).order_by('-created_at')[:10]
        recent_activity_data = ActivityLogSerializer(recent_activity, many=True).data

        return Response({
            "money_lent": money_given,
            "money_borrowed": money_borrowed,
            "outstanding_receivable": receivable,
            "outstanding_payable": payable,
            "interest_earned": interest_earned,
            "interest_paid": interest_paid,
            "active_loans_count": active_count,
            "overdue_loans_count": overdue_count,
            "upcoming_payments": upcoming_payments,
            "recent_activity": recent_activity_data
        })


class AcceptInviteView(generics.GenericAPIView):
    permission_classes = [IsAuthenticated]

    def post(self, request, token=None):
        from api.models import SpaceInvite
        invite = get_object_or_404(SpaceInvite, token=token, expires_at__gt=timezone.now(), accepted_at__isnull=True)
        member = invite.space_member
        
        if member.invited_email != request.user.email:
            raise PermissionDenied("This invite was sent to a different email address.")
            
        with db_transaction.atomic():
            member.user = request.user
            member.status = MemberStatus.ACTIVE
            member.joined_at = timezone.now()
            member.save()
            
            invite.accepted_at = timezone.now()
            invite.save()
            
            request.user.last_active_space = member.space
            request.user.save()
            
            log_activity(member.space, "INVITE_ACCEPTED", "SPACE_MEMBER", member.id, member, f"{request.user.display_name} joined the space")
            
        return Response({"message": f"Successfully joined space {member.space.name}."})


class SpaceSettingsView(generics.RetrieveUpdateAPIView):
    serializer_class = SpaceSettingsSerializer
    permission_classes = [IsAuthenticated, IsSpaceMember, IsOwner]

    def get_object(self):
        return get_object_or_404(SpaceSettings, space=self.request.space)

