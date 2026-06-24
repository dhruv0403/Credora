import datetime
from django.utils import timezone
from django.shortcuts import get_object_or_404
from rest_framework import viewsets, status, mixins
from rest_framework.decorators import action
from rest_framework.response import Response
from rest_framework.permissions import IsAuthenticated

from api.models import Loan, Transaction, TransactionType
from api.serializers import TransactionSerializer
from api.permissions import IsSpaceMember, CanRecordCollection
from api.services.ledger import record_transaction, reverse_transaction

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

class TransactionViewSet(viewsets.GenericViewSet, mixins.ListModelMixin, mixins.RetrieveModelMixin):
    serializer_class = TransactionSerializer
    permission_classes = [IsAuthenticated, IsSpaceMember]

    def get_queryset(self):
        return Transaction.objects.filter(space=self.request.space)

    def get_permissions(self):
        if self.action in ['create', 'reverse']:
            return [IsAuthenticated(), IsSpaceMember(), CanRecordCollection()]
        return super().get_permissions()

    def list(self, request, space_id=None):
        qs = self.get_queryset()
        loan_id = request.query_params.get('loan_id')
        if loan_id:
            qs = qs.filter(loan_id=loan_id)
        
        txn_type = request.query_params.get('type')
        if txn_type:
            qs = qs.filter(type=txn_type)
            
        date_from = request.query_params.get('date_from')
        date_to = request.query_params.get('date_to')
        if date_from and date_to:
            qs = qs.filter(transaction_date__range=[date_from, date_to])
            
        page = self.paginate_queryset(qs)
        if page is not None:
            serializer = self.get_serializer(page, many=True)
            return self.get_paginated_response(serializer.data)
            
        serializer = self.get_serializer(qs, many=True)
        return Response(serializer.data)

    def create(self, request, space_id=None):
        loan_id = request.data.get('loan_id')
        loan = get_object_or_404(Loan, id=loan_id, space=request.space)
        
        txn_type = request.data.get('type')
        amount = request.data.get('amount')
        txn_date = request.data.get('transaction_date') or timezone.now()
        method = request.data.get('collection_method')
        note = request.data.get('note')
        allocations = request.data.get('allocations')

        txn, created_allocs = record_transaction(
            loan=loan,
            type=txn_type,
            amount=amount,
            transaction_date=txn_date,
            collection_method=method,
            note=note,
            allocations_data=allocations,
            created_by=request.space_member
        )
        
        log_activity(request.space, "TRANSACTION_RECORDED", "TRANSACTION", txn.id, request.space_member, f"Transaction recorded: {txn_type} of {amount}")
        
        warnings = []
        parsed_date = txn_date if isinstance(txn_date, datetime.datetime) else datetime.datetime.strptime(txn_date, "%Y-%m-%d")
        if timezone.is_naive(parsed_date):
            parsed_date = timezone.make_aware(parsed_date)
        if parsed_date > timezone.now():
            warnings.append("Transaction date is in the future.")
            
        return Response({
            "warnings": warnings,
            "transaction": TransactionSerializer(txn).data
        }, status=status.HTTP_201_CREATED)

    @action(detail=True, methods=['post'])
    def reverse(self, request, space_id=None, pk=None):
        reason = request.data.get('reason')
        rev_txn = reverse_transaction(
            transaction_id=pk,
            reason=reason,
            performed_by=request.space_member
        )
        log_activity(request.space, "TRANSACTION_REVERSED", "TRANSACTION", pk, request.space_member, f"Transaction #{pk} reversed")
        return Response(TransactionSerializer(rev_txn).data)

