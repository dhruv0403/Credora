from rest_framework import serializers
from api.models import (
    Loan, Disbursement, RepaymentScheduleLine, LoanRateHistory,
    LoanTenureExtension, LoanMoratorium, LoanWaiver,
    LoanStatus, ScheduleLineStatus, MemberStatus, PaymentTimingRule
)
from decimal import Decimal
from django.utils import timezone
from django.db.models import Sum

class DisbursementSerializer(serializers.ModelSerializer):
    created_by_name = serializers.CharField(source='created_by.user.display_name', read_only=True)

    class Meta:
        model = Disbursement
        fields = [
            'id', 'space', 'loan', 'amount', 'disbursement_date',
            'sequence_no', 'label', 'created_by', 'created_by_name', 'created_at'
        ]
        read_only_fields = ['id', 'space', 'loan', 'sequence_no', 'created_by', 'created_at']


class RepaymentScheduleLineSerializer(serializers.ModelSerializer):
    class Meta:
        model = RepaymentScheduleLine
        fields = [
            'id', 'space', 'loan', 'schedule_version', 'line_no',
            'due_date', 'principal_due', 'interest_due', 'status',
            'is_current_version', 'is_custom_line', 'created_at'
        ]
        read_only_fields = ['id', 'space', 'loan', 'schedule_version', 'is_current_version', 'is_custom_line', 'created_at']


class LoanRateHistorySerializer(serializers.ModelSerializer):
    class Meta:
        model = LoanRateHistory
        fields = '__all__'


class LoanTenureExtensionSerializer(serializers.ModelSerializer):
    class Meta:
        model = LoanTenureExtension
        fields = '__all__'


class LoanMoratoriumSerializer(serializers.ModelSerializer):
    class Meta:
        model = LoanMoratorium
        fields = '__all__'


class LoanWaiverSerializer(serializers.ModelSerializer):
    class Meta:
        model = LoanWaiver
        fields = '__all__'


class LoanSerializer(serializers.ModelSerializer):
    contact_name = serializers.CharField(source='contact.name', read_only=True)
    created_by_name = serializers.CharField(source='created_by.user.display_name', read_only=True)
    outstanding_balance = serializers.SerializerMethodField()
    is_overdue = serializers.SerializerMethodField()
    accrued_penalty_to_date = serializers.SerializerMethodField()

    class Meta:
        model = Loan
        fields = [
            'id', 'space', 'contact', 'contact_name', 'direction', 'status',
            'closure_reason', 'closure_note', 'closed_at', 'closed_by',
            'written_off_amount', 'reopened_at', 'created_by', 'created_by_name',
            'created_at', 'updated_at', 'principal_amount', 'start_date',
            'first_due_date', 'tenure_periods', 'interest_type', 'rate_value',
            'rate_period', 'fixed_interest_amount', 'fixed_interest_frequency',
            'interest_timing', 'net_disbursed_amount', 'interest_rate_behavior',
            'promo_rate', 'promo_period_days', 'repayment_type',
            'has_balloon_final_payment', 'payment_frequency', 'payment_timing_rule',
            'advance_payment_mode', 'advance_credit_balance', 'penalty_type',
            'penalty_value', 'grace_period_days', 'outstanding_balance',
            'is_overdue', 'accrued_penalty_to_date'
        ]
        read_only_fields = [
            'id', 'space', 'status', 'closure_reason', 'closure_note',
            'closed_at', 'closed_by', 'written_off_amount', 'reopened_at',
            'created_by', 'created_at', 'updated_at', 'advance_credit_balance'
        ]

    def get_outstanding_balance(self, obj):
        from api.models import TransactionAllocation
        total_disb = Disbursement.objects.filter(loan=obj).aggregate(total=Sum('amount'))['total'] or Decimal('0.00')
        total_repaid = TransactionAllocation.objects.filter(
            transaction__loan=obj,
            transaction__is_reversed=False
        ).aggregate(total=Sum('principal_component'))['total'] or Decimal('0.00')
        
        outstanding_principal = total_disb - total_repaid - obj.advance_credit_balance
        
        unpaid_i = RepaymentScheduleLine.objects.filter(
            loan=obj,
            is_current_version=True,
            status=ScheduleLineStatus.PENDING
        ).aggregate(
            total_i=Sum('interest_due')
        )['total_i'] or Decimal('0.00')
        
        interest_paid_allocs = TransactionAllocation.objects.filter(
            transaction__loan=obj,
            transaction__is_reversed=False,
            schedule_line__is_current_version=True
        ).aggregate(total_i=Sum('interest_component'))['total_i'] or Decimal('0.00')
        
        remaining_interest = max(Decimal('0.00'), unpaid_i - interest_paid_allocs)
        return max(Decimal('0.00'), outstanding_principal + remaining_interest)

    def get_is_overdue(self, obj):
        if obj.status != LoanStatus.ACTIVE or obj.payment_timing_rule == PaymentTimingRule.ANYTIME:
            return False
        today = timezone.localdate()
        return RepaymentScheduleLine.objects.filter(
            loan=obj,
            is_current_version=True,
            status=ScheduleLineStatus.PENDING,
            due_date__lt=today
        ).exists()

    def get_accrued_penalty_to_date(self, obj):
        if obj.status != LoanStatus.ACTIVE or obj.penalty_type == 'NONE':
            return Decimal('0.00')
            
        today = timezone.localdate()
        overdue_lines = RepaymentScheduleLine.objects.filter(
            loan=obj,
            is_current_version=True,
            status=ScheduleLineStatus.PENDING,
            due_date__lt=today
        )
        
        if not overdue_lines.exists():
            return Decimal('0.00')
            
        total_penalty = Decimal('0.00')
        for line in overdue_lines:
            days_overdue = (today - line.due_date).days
            if days_overdue <= obj.grace_period_days:
                continue
                
            if obj.penalty_type == 'FIXED':
                total_penalty += Decimal(str(obj.penalty_value or 0))
            elif obj.penalty_type == 'PERCENTAGE':
                total_penalty += (line.principal_due + line.interest_due) * Decimal(str(obj.penalty_value or 0)) / 100
            elif obj.penalty_type == 'DAILY_LATE_FEE':
                total_penalty += Decimal(str(obj.penalty_value or 0)) * Decimal(str(days_overdue))
            elif obj.penalty_type == 'MONTHLY_LATE_FEE':
                months_overdue = days_overdue // 30
                if months_overdue > 0:
                    total_penalty += Decimal(str(obj.penalty_value or 0)) * Decimal(str(months_overdue))
                    
        waived = LoanWaiver.objects.filter(loan=obj, waiver_type='PENALTY').aggregate(total=Sum('waived_amount'))['total'] or Decimal('0.00')
        return max(Decimal('0.00'), total_penalty - waived)

