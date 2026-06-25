from rest_framework import serializers
from api.models import (
    Loan, Disbursement, RepaymentScheduleLine, LoanRateHistory,
    LoanTenureExtension, LoanMoratorium, LoanWaiver,
    LoanStatus, ScheduleLineStatus, MemberStatus, PaymentTimingRule,
    Contact, AdvancePaymentMode
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
    contact_id = serializers.PrimaryKeyRelatedField(
        queryset=Contact.objects.all(),
        source='contact'
    )
    contact_name = serializers.CharField(source='contact.name', read_only=True)
    advance_payment_mode = serializers.ChoiceField(
        choices=AdvancePaymentMode.choices,
        required=False,
        allow_null=True,
        allow_blank=True
    )
    created_by_name = serializers.CharField(source='created_by.user.display_name', read_only=True)
    outstanding_balance = serializers.SerializerMethodField()
    is_overdue = serializers.SerializerMethodField()
    accrued_penalty_to_date = serializers.SerializerMethodField()

    class Meta:
        model = Loan
        fields = [
            'id', 'space', 'contact_id', 'contact_name', 'direction', 'status',
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

    def validate(self, attrs):
        principal_amount = attrs.get('principal_amount')
        if principal_amount is None and self.instance:
            principal_amount = self.instance.principal_amount

        if principal_amount is not None and principal_amount <= 0:
            raise serializers.ValidationError({"principal_amount": "principal_amount must be greater than zero."})

        start_date = attrs.get('start_date')
        first_due_date = attrs.get('first_due_date')
        if self.instance:
            if start_date is None:
                start_date = self.instance.start_date
            if first_due_date is None:
                first_due_date = self.instance.first_due_date

        import datetime
        start_date_val = start_date.date() if isinstance(start_date, datetime.datetime) else start_date
        first_due_date_val = first_due_date.date() if isinstance(first_due_date, datetime.datetime) else first_due_date

        if start_date_val and first_due_date_val and first_due_date_val < start_date_val:
            raise serializers.ValidationError({"first_due_date": "first_due_date cannot be before start_date."})

        interest_type = attrs.get('interest_type')
        if interest_type is None and self.instance:
            interest_type = self.instance.interest_type

        if interest_type == 'FIXED':
            fixed_interest_amount = attrs.get('fixed_interest_amount')
            fixed_interest_frequency = attrs.get('fixed_interest_frequency')
            if self.instance:
                if fixed_interest_amount is None:
                    fixed_interest_amount = self.instance.fixed_interest_amount
                if fixed_interest_frequency is None:
                    fixed_interest_frequency = self.instance.fixed_interest_frequency
            if fixed_interest_amount is None or fixed_interest_frequency is None:
                raise serializers.ValidationError("Both fixed_interest_amount and fixed_interest_frequency are required when interest_type is 'FIXED'.")

        interest_timing = attrs.get('interest_timing')
        if interest_timing is None and self.instance:
            interest_timing = self.instance.interest_timing

        if interest_timing == 'DEDUCTED_FROM_DISBURSEMENT':
            net_disbursed_amount = attrs.get('net_disbursed_amount')
            if net_disbursed_amount is None and self.instance:
                net_disbursed_amount = self.instance.net_disbursed_amount
            if net_disbursed_amount is not None and principal_amount is not None and net_disbursed_amount >= principal_amount:
                raise serializers.ValidationError({"net_disbursed_amount": "net_disbursed_amount must be less than principal_amount when interest_timing is 'DEDUCTED_FROM_DISBURSEMENT'."})

        interest_rate_behavior = attrs.get('interest_rate_behavior')
        if interest_rate_behavior is None and self.instance:
            interest_rate_behavior = self.instance.interest_rate_behavior

        if interest_rate_behavior == 'PROMOTIONAL':
            promo_period_days = attrs.get('promo_period_days')
            tenure_periods = attrs.get('tenure_periods')
            payment_frequency = attrs.get('payment_frequency')
            if self.instance:
                if promo_period_days is None:
                    promo_period_days = self.instance.promo_period_days
                if tenure_periods is None:
                    tenure_periods = self.instance.tenure_periods
                if payment_frequency is None:
                    payment_frequency = self.instance.payment_frequency

            tenure_days = tenure_periods
            if tenure_periods is not None:
                if payment_frequency == 'MONTHLY':
                    tenure_days = tenure_periods * 30
                elif payment_frequency == 'WEEKLY':
                    tenure_days = tenure_periods * 7
                elif payment_frequency == 'DAILY':
                    tenure_days = tenure_periods
                elif payment_frequency == 'BI_WEEKLY':
                    tenure_days = tenure_periods * 14
                elif payment_frequency == 'QUARTERLY':
                    tenure_days = tenure_periods * 90

            if promo_period_days is not None and tenure_days is not None and promo_period_days > tenure_days:
                raise serializers.ValidationError({"promo_period_days": "promo_period_days cannot be greater than the loan tenure."})

        penalty_type = attrs.get('penalty_type')
        if penalty_type is None and self.instance:
            penalty_type = self.instance.penalty_type

        if penalty_type == 'EXTRA_INTEREST' and interest_type == 'COMPOUND':
            raise serializers.ValidationError({"penalty_type": "penalty_type 'EXTRA_INTEREST' is not allowed when interest_type is 'COMPOUND'."})

        return attrs


