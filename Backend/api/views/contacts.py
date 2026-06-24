from rest_framework import viewsets, status
from rest_framework.decorators import action
from rest_framework.response import Response
from rest_framework.permissions import IsAuthenticated
from django.shortcuts import get_object_or_404
from django.db.models import Sum

from api.models import Contact, Loan, Disbursement, RepaymentScheduleLine, MemberStatus, LoanStatus, ScheduleLineStatus
from api.serializers import ContactSerializer, LoanSerializer
from api.permissions import IsSpaceMember, CanWrite
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

class ContactViewSet(viewsets.ModelViewSet):
    serializer_class = ContactSerializer
    permission_classes = [IsAuthenticated, IsSpaceMember]

    def get_queryset(self):
        return Contact.objects.filter(space=self.request.space)

    def get_permissions(self):
        if self.action in ['create', 'update', 'partial_update', 'destroy']:
            return [IsAuthenticated(), IsSpaceMember(), CanWrite()]
        return super().get_permissions()

    def perform_create(self, serializer):
        contact = serializer.save(space=self.request.space, created_by=self.request.space_member)
        log_activity(self.request.space, "CONTACT_CREATED", "CONTACT", contact.id, self.request.space_member, f"Contact {contact.name} created")

    def perform_update(self, serializer):
        contact = serializer.save()
        log_activity(self.request.space, "CONTACT_UPDATED", "CONTACT", contact.id, self.request.space_member, f"Contact {contact.name} updated")

    def destroy(self, request, *args, **kwargs):
        contact = self.get_object()
        if Loan.objects.filter(contact=contact).exists():
            loans_count = Loan.objects.filter(contact=contact).count()
            raise BusinessValidationError(
                code="CONTACT_HAS_LOANS",
                message=f"This contact has {loans_count} loan(s) — close or reassign them first.",
                edge_case_ref=44,
                status_code=409
            )
        contact.delete()
        log_activity(self.request.space, "CONTACT_DELETED", "CONTACT", contact.id, request.space_member, f"Contact {contact.name} deleted")
        return Response(status=status.HTTP_204_NO_CONTENT)

    @action(detail=True, methods=['get'], url_path='loans')
    def loans(self, request, space_id=None, pk=None):
        contact = self.get_object()
        contact_loans = Loan.objects.filter(space=request.space, contact=contact)
        
        receivables = Decimal('0.00')
        payables = Decimal('0.00')
        
        for loan in contact_loans:
            from api.models import TransactionAllocation
            total_disb = Disbursement.objects.filter(loan=loan).aggregate(total=Sum('amount'))['total'] or Decimal('0.00')
            total_repaid = TransactionAllocation.objects.filter(transaction__loan=loan, transaction__is_reversed=False).aggregate(total=Sum('principal_component'))['total'] or Decimal('0.00')
            out_p = max(Decimal('0.00'), total_disb - total_repaid - loan.advance_credit_balance)
            
            unpaid_i = RepaymentScheduleLine.objects.filter(loan=loan, is_current_version=True, status=ScheduleLineStatus.PENDING).aggregate(total_i=Sum('interest_due'))['total_i'] or Decimal('0.00')
            paid_i = TransactionAllocation.objects.filter(transaction__loan=loan, transaction__is_reversed=False, schedule_line__is_current_version=True).aggregate(total_i=Sum('interest_component'))['total_i'] or Decimal('0.00')
            rem_i = max(Decimal('0.00'), unpaid_i - paid_i)
            
            out = out_p + rem_i
            
            if loan.direction == 'GIVEN':
                receivables += out
            else:
                payables += out
                
        net_position = receivables - payables
        
        serializer = LoanSerializer(contact_loans, many=True)
        return Response({
            "net_position": net_position,
            "loans": serializer.data
        })

