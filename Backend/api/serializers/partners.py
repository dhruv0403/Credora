from rest_framework import serializers
from api.models import SpacePartner, PartnerCapitalTransaction
from decimal import Decimal
from django.db.models import Sum

class SpacePartnerSerializer(serializers.ModelSerializer):
    member_name = serializers.CharField(source='space_member.user.display_name', read_only=True)
    net_position = serializers.SerializerMethodField()

    class Meta:
        model = SpacePartner
        fields = [
            'id', 'space', 'space_member', 'member_name',
            'initial_contribution_amount', 'profit_share_percent',
            'net_position', 'created_by', 'created_at', 'updated_at'
        ]
        read_only_fields = ['id', 'space', 'created_by', 'created_at', 'updated_at']

    def get_net_position(self, obj):
        contribs = PartnerCapitalTransaction.objects.filter(
            space_partner=obj, type='CONTRIBUTION'
        ).aggregate(total=Sum('amount'))['total'] or Decimal('0.00')
        
        withdraws = PartnerCapitalTransaction.objects.filter(
            space_partner=obj, type='WITHDRAWAL'
        ).aggregate(total=Sum('amount'))['total'] or Decimal('0.00')
        
        initial = obj.initial_contribution_amount or Decimal('0.00')
        return initial + contribs - withdraws


class PartnerCapitalTransactionSerializer(serializers.ModelSerializer):
    created_by_name = serializers.CharField(source='created_by.user.display_name', read_only=True)

    class Meta:
        model = PartnerCapitalTransaction
        fields = [
            'id', 'space', 'space_partner', 'type', 'amount',
            'transaction_date', 'note', 'created_by', 'created_by_name', 'created_at'
        ]
        read_only_fields = ['id', 'space', 'space_partner', 'created_by', 'created_at']

