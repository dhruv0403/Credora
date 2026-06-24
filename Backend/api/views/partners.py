from rest_framework import viewsets, status, mixins
from rest_framework.decorators import action
from rest_framework.response import Response
from rest_framework.permissions import IsAuthenticated
from rest_framework.exceptions import PermissionDenied, ValidationError
from django.db import transaction as db_transaction
from django.db.models import Sum
from django.utils import timezone
from django.shortcuts import get_object_or_404

from api.models import (
    SpacePartner, PartnerCapitalTransaction,
    SpaceType, SpaceVisibility, MemberRole, CapitalTxnType
)
from api.serializers import SpacePartnerSerializer, PartnerCapitalTransactionSerializer
from api.permissions import IsSpaceMember, IsOwnerOrAdmin
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

class SpacePartnerViewSet(viewsets.ModelViewSet):
    serializer_class = SpacePartnerSerializer
    permission_classes = [IsAuthenticated, IsSpaceMember, IsOwnerOrAdmin]

    def get_queryset(self):
        if self.request.space.space_type != SpaceType.BUSINESS or self.request.space.space_visibility != SpaceVisibility.SHARED:
            raise ValidationError("Partnership Model is not active for this space.")
        return SpacePartner.objects.filter(space=self.request.space)

    def perform_create(self, serializer):
        partner = serializer.save(space=self.request.space, created_by=self.request.space_member)
        log_activity(self.request.space, "PARTNER_DESIGNATED", "SPACE_PARTNER", partner.id, self.request.space_member, f"Member {partner.space_member.user.display_name} designated as Partner")

    def destroy(self, request, *args, **kwargs):
        partner = self.get_object()
        
        contribs = PartnerCapitalTransaction.objects.filter(space_partner=partner, type='CONTRIBUTION').aggregate(total=Sum('amount'))['total'] or Decimal('0.00')
        withdraws = PartnerCapitalTransaction.objects.filter(space_partner=partner, type='WITHDRAWAL').aggregate(total=Sum('amount'))['total'] or Decimal('0.00')
        initial = partner.initial_contribution_amount or Decimal('0.00')
        net_pos = initial + contribs - withdraws
        
        if net_pos != 0:
            raise BusinessValidationError(
                code="PARTNER_POSITION_NON_ZERO",
                message="Cannot remove partner designation while Net Position is not zero.",
                edge_case_ref=42,
                status_code=409
            )
            
        partner.delete()
        log_activity(self.request.space, "PARTNER_REMOVED", "SPACE_PARTNER", partner.id, request.space_member, f"Partner designation removed")
        return Response(status=status.HTTP_204_NO_CONTENT)

    @action(detail=False, methods=['get'], url_path='dashboard')
    def dashboard(self, request, space_id=None):
        if request.space.space_type != SpaceType.BUSINESS or request.space.space_visibility != SpaceVisibility.SHARED:
            raise ValidationError("Partnership Model is not active for this space.")
            
        partners = self.get_queryset()
        if request.space_member.role not in [MemberRole.OWNER, MemberRole.ADMIN]:
            partners = partners.filter(space_member=request.space_member)
            
        data = SpacePartnerSerializer(partners, many=True).data
        return Response(data)

    @action(detail=True, methods=['get', 'post'], url_path='capital-transactions')
    def capital_transactions(self, request, space_id=None, pk=None):
        partner = self.get_object()
        
        if request.method == 'GET':
            txns = PartnerCapitalTransaction.objects.filter(space_partner=partner)
            return Response(PartnerCapitalTransactionSerializer(txns, many=True).data)
            
        if request.space_member.role not in [MemberRole.OWNER, MemberRole.ADMIN]:
            raise PermissionDenied("Only Owners or Admins can record capital transactions.")
            
        txn_type = request.data.get('type')
        amount = Decimal(str(request.data.get('amount')))
        txn_date = request.data.get('transaction_date')
        note = request.data.get('note')
        
        if txn_type not in CapitalTxnType.values:
            return Response({"error": {"code": "INVALID_TYPE", "message": "Invalid capital transaction type."}}, status=400)
            
        if txn_type == CapitalTxnType.WITHDRAWAL:
            contribs = PartnerCapitalTransaction.objects.filter(space_partner=partner, type='CONTRIBUTION').aggregate(total=Sum('amount'))['total'] or Decimal('0.00')
            withdraws = PartnerCapitalTransaction.objects.filter(space_partner=partner, type='WITHDRAWAL').aggregate(total=Sum('amount'))['total'] or Decimal('0.00')
            initial = partner.initial_contribution_amount or Decimal('0.00')
            net_pos = initial + contribs - withdraws
            
            if amount > net_pos:
                raise BusinessValidationError(
                    code="WITHDRAWAL_EXCEEDS_POSITION",
                    message="Withdrawal amount cannot exceed the partner's current Net Position.",
                    edge_case_ref=43
                )
                
        with db_transaction.atomic():
            txn = PartnerCapitalTransaction.objects.create(
                space=request.space,
                space_partner=partner,
                type=txn_type,
                amount=amount,
                transaction_date=txn_date or timezone.localdate(),
                note=note,
                created_by=request.space_member
            )
            log_activity(request.space, "CAPITAL_TXN_RECORDED", "SPACE_PARTNER", partner.id, request.space_member, f"Recorded capital {txn_type.lower()} of {amount}")
            
        return Response(PartnerCapitalTransactionSerializer(txn).data)

