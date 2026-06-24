from rest_framework import serializers
from api.models import Expense

class ExpenseSerializer(serializers.ModelSerializer):
    created_by_name = serializers.CharField(source='created_by.user.display_name', read_only=True)

    class Meta:
        model = Expense
        fields = [
            'id', 'space', 'loan', 'category', 'amount', 'expense_date',
            'note', 'created_by', 'created_by_name', 'created_at'
        ]
        read_only_fields = ['id', 'space', 'created_by', 'created_at']

