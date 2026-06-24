from rest_framework import serializers
from api.models import Transaction, TransactionAllocation

class TransactionAllocationSerializer(serializers.ModelSerializer):
    class Meta:
        model = TransactionAllocation
        fields = '__all__'


class TransactionSerializer(serializers.ModelSerializer):
    created_by_name = serializers.CharField(source='created_by.user.display_name', read_only=True)
    allocations = TransactionAllocationSerializer(many=True, read_only=True)

    class Meta:
        model = Transaction
        fields = [
            'id', 'space', 'loan', 'type', 'amount', 'transaction_date',
            'collection_method', 'note', 'reverses_transaction', 'is_reversed',
            'adjustment_reason', 'created_by', 'created_by_name', 'created_at',
            'allocations'
        ]
        read_only_fields = ['id', 'space', 'loan', 'reverses_transaction', 'is_reversed', 'created_by', 'created_at']

