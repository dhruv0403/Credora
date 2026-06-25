from django.db import models
from .spaces import Space, SpaceMember
from .contacts import Contact
from decimal import Decimal

class LoanDirection(models.TextChoices):
    GIVEN = 'GIVEN', 'Given'
    TAKEN = 'TAKEN', 'Taken'

class LoanStatus(models.TextChoices):
    DRAFT = 'DRAFT', 'Draft'
    ACTIVE = 'ACTIVE', 'Active'
    CLOSED = 'CLOSED', 'Closed'

class ClosureReason(models.TextChoices):
    FULLY_PAID = 'FULLY_PAID', 'Fully Paid'
    SETTLED = 'SETTLED', 'Settled'
    WRITTEN_OFF = 'WRITTEN_OFF', 'Written Off'
    MANUALLY_CLOSED = 'MANUALLY_CLOSED', 'Manually Closed'

class InterestType(models.TextChoices):
    NONE = 'NONE', 'No Interest'
    FIXED = 'FIXED', 'Fixed Amount'
    FLAT = 'FLAT', 'Flat Rate'
    REDUCING_BALANCE = 'REDUCING_BALANCE', 'Reducing Balance'
    COMPOUND = 'COMPOUND', 'Compound'
    CUSTOM = 'CUSTOM', 'Custom Interest'

class FixedInterestFrequency(models.TextChoices):
    ONE_TIME = 'ONE_TIME', 'One Time'
    RECURRING = 'RECURRING', 'Recurring'

class RatePeriod(models.TextChoices):
    DAY = 'DAY', 'Daily'
    WEEK = 'WEEK', 'Weekly'
    MONTH = 'MONTH', 'Monthly'
    YEAR = 'YEAR', 'Yearly'

class InterestTiming(models.TextChoices):
    COLLECTED_UPFRONT = 'COLLECTED_UPFRONT', 'Collected Upfront'
    DEDUCTED_FROM_DISBURSEMENT = 'DEDUCTED_FROM_DISBURSEMENT', 'Deducted From Disbursement'
    PAYABLE_AT_END = 'PAYABLE_AT_END', 'Payable at End'
    PAYABLE_PERIODICALLY = 'PAYABLE_PERIODICALLY', 'Payable Periodically'

class InterestRateBehavior(models.TextChoices):
    FIXED = 'FIXED', 'Fixed'
    VARIABLE = 'VARIABLE', 'Variable'
    PROMOTIONAL = 'PROMOTIONAL', 'Promotional'

class RepaymentType(models.TextChoices):
    ONE_TIME = 'ONE_TIME', 'One-time (Bullet)'
    EMI = 'EMI', 'EMI'
    INTEREST_ONLY = 'INTEREST_ONLY', 'Interest Only'
    PRINCIPAL_ONLY = 'PRINCIPAL_ONLY', 'Principal Only'
    FLEXIBLE = 'FLEXIBLE', 'Flexible'
    CUSTOM_INSTALLMENTS = 'CUSTOM_INSTALLMENTS', 'Custom Installments'

class PaymentFrequency(models.TextChoices):
    DAILY = 'DAILY', 'Daily'
    WEEKLY = 'WEEKLY', 'Weekly'
    BI_WEEKLY = 'BI_WEEKLY', 'Bi-weekly'
    MONTHLY = 'MONTHLY', 'Monthly'
    QUARTERLY = 'QUARTERLY', 'Quarterly'

class PaymentTimingRule(models.TextChoices):
    SCHEDULED = 'SCHEDULED', 'Scheduled'
    ANYTIME = 'ANYTIME', 'Anytime'

class AdvancePaymentMode(models.TextChoices):
    CARRY_FORWARD_CREDIT = 'CARRY_FORWARD_CREDIT', 'Carry Forward Credit'
    RECALCULATE_SCHEDULE = 'RECALCULATE_SCHEDULE', 'Recalculate Schedule'

class PenaltyType(models.TextChoices):
    NONE = 'NONE', 'None'
    FIXED = 'FIXED', 'Fixed Penalty'
    PERCENTAGE = 'PERCENTAGE', 'Percentage Penalty'
    DAILY_LATE_FEE = 'DAILY_LATE_FEE', 'Daily Late Fee'
    MONTHLY_LATE_FEE = 'MONTHLY_LATE_FEE', 'Monthly Late Fee'
    EXTRA_INTEREST = 'EXTRA_INTEREST', 'Extra Interest'

class DisbursementLabel(models.TextChoices):
    ORIGINAL = 'ORIGINAL', 'Original'
    TOP_UP = 'TOP_UP', 'Top-up'
    ADDITIONAL_BORROWING = 'ADDITIONAL_BORROWING', 'Additional Borrowing'

class RateHistoryTrigger(models.TextChoices):
    INITIAL = 'INITIAL', 'Initial'
    VARIABLE_CHANGE = 'VARIABLE_CHANGE', 'Variable Change'
    PROMO_EXPIRY = 'PROMO_EXPIRY', 'Promotional Expiry'
    RESTRUCTURING = 'RESTRUCTURING', 'Restructuring'

class WaiverType(models.TextChoices):
    INTEREST = 'INTEREST', 'Interest'
    PENALTY = 'PENALTY', 'Penalty'

class ScheduleLineStatus(models.TextChoices):
    PENDING = 'PENDING', 'Pending'
    PAID = 'PAID', 'Paid'


class Loan(models.Model):
    space = models.ForeignKey(Space, on_delete=models.CASCADE, related_name='loans')
    contact = models.ForeignKey(Contact, on_delete=models.RESTRICT, related_name='loans')
    direction = models.CharField(max_length=10, choices=LoanDirection.choices)
    status = models.CharField(
        max_length=10,
        choices=LoanStatus.choices,
        default=LoanStatus.DRAFT
    )
    closure_reason = models.CharField(
        max_length=20,
        choices=ClosureReason.choices,
        null=True,
        blank=True
    )
    closure_note = models.TextField(null=True, blank=True)
    closed_at = models.DateTimeField(null=True, blank=True)
    closed_by = models.ForeignKey(
        SpaceMember,
        null=True,
        blank=True,
        on_delete=models.PROTECT,
        related_name='loans_closed'
    )
    written_off_amount = models.DecimalField(max_digits=14, decimal_places=2, null=True, blank=True)
    reopened_at = models.DateTimeField(null=True, blank=True)
    created_by = models.ForeignKey(SpaceMember, on_delete=models.PROTECT, related_name='loans_created')
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    principal_amount = models.DecimalField(max_digits=14, decimal_places=2)
    start_date = models.DateTimeField()
    first_due_date = models.DateField(null=True, blank=True)
    tenure_periods = models.PositiveSmallIntegerField(null=True, blank=True)

    interest_type = models.CharField(max_length=20, choices=InterestType.choices)
    rate_value = models.DecimalField(max_digits=10, decimal_places=4, null=True, blank=True)
    rate_period = models.CharField(max_length=10, choices=RatePeriod.choices, null=True, blank=True)
    fixed_interest_amount = models.DecimalField(max_digits=14, decimal_places=2, null=True, blank=True)
    fixed_interest_frequency = models.CharField(
        max_length=20,
        choices=FixedInterestFrequency.choices,
        null=True,
        blank=True
    )
    interest_timing = models.CharField(
        max_length=30,
        choices=InterestTiming.choices,
        default=InterestTiming.PAYABLE_PERIODICALLY
    )
    net_disbursed_amount = models.DecimalField(max_digits=14, decimal_places=2, null=True, blank=True)
    interest_rate_behavior = models.CharField(
        max_length=20,
        choices=InterestRateBehavior.choices,
        default=InterestRateBehavior.FIXED
    )
    promo_rate = models.DecimalField(max_digits=10, decimal_places=4, null=True, blank=True)
    promo_period_days = models.PositiveSmallIntegerField(null=True, blank=True)

    repayment_type = models.CharField(max_length=20, choices=RepaymentType.choices)
    has_balloon_final_payment = models.BooleanField(default=False)
    payment_frequency = models.CharField(
        max_length=20,
        choices=PaymentFrequency.choices,
        null=True,
        blank=True
    )
    payment_timing_rule = models.CharField(
        max_length=20,
        choices=PaymentTimingRule.choices,
        default=PaymentTimingRule.SCHEDULED
    )

    advance_payment_mode = models.CharField(max_length=30, choices=AdvancePaymentMode.choices)
    advance_credit_balance = models.DecimalField(max_digits=14, decimal_places=2, default=Decimal('0.00'))
    penalty_type = models.CharField(
        max_length=20,
        choices=PenaltyType.choices,
        default=PenaltyType.NONE
    )
    penalty_value = models.DecimalField(max_digits=10, decimal_places=4, null=True, blank=True)
    grace_period_days = models.PositiveSmallIntegerField(default=0)

    class Meta:
        db_table = 'loans'
        app_label = 'api'
        indexes = [
            models.Index(fields=['space']),
            models.Index(fields=['space', 'status']),
            models.Index(fields=['space', 'contact']),
            models.Index(fields=['space', 'direction', 'status']),
        ]

    def __str__(self):
        return f"Loan #{self.id} ({self.contact.name} - {self.direction})"


class Disbursement(models.Model):
    space = models.ForeignKey(Space, on_delete=models.CASCADE, related_name='+')
    loan = models.ForeignKey(Loan, on_delete=models.CASCADE, related_name='disbursements')
    amount = models.DecimalField(max_digits=14, decimal_places=2)
    disbursement_date = models.DateTimeField()
    sequence_no = models.PositiveSmallIntegerField()
    label = models.CharField(
        max_length=30,
        choices=DisbursementLabel.choices,
        default=DisbursementLabel.ORIGINAL
    )
    created_by = models.ForeignKey(SpaceMember, on_delete=models.PROTECT, related_name='+')
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        db_table = 'disbursements'
        app_label = 'api'


class LoanRateHistory(models.Model):
    space = models.ForeignKey(Space, on_delete=models.CASCADE, related_name='+')
    loan = models.ForeignKey(Loan, on_delete=models.CASCADE, related_name='rate_history')
    effective_from = models.DateField()
    rate_value = models.DecimalField(max_digits=10, decimal_places=4)
    rate_period = models.CharField(max_length=10, choices=RatePeriod.choices)
    trigger = models.CharField(max_length=30, choices=RateHistoryTrigger.choices)
    reason = models.TextField(null=True, blank=True)
    created_by = models.ForeignKey(SpaceMember, on_delete=models.PROTECT, related_name='+')
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        db_table = 'loan_rate_history'
        app_label = 'api'


class LoanTenureExtension(models.Model):
    space = models.ForeignKey(Space, on_delete=models.CASCADE, related_name='+')
    loan = models.ForeignKey(Loan, on_delete=models.CASCADE, related_name='tenure_extensions')
    added_periods = models.PositiveSmallIntegerField()
    tenure_periods_before = models.PositiveSmallIntegerField()
    tenure_periods_after = models.PositiveSmallIntegerField()
    reason = models.TextField()
    performed_by = models.ForeignKey(SpaceMember, on_delete=models.PROTECT, related_name='+')
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        db_table = 'loan_tenure_extensions'
        app_label = 'api'


class LoanMoratorium(models.Model):
    space = models.ForeignKey(Space, on_delete=models.CASCADE, related_name='+')
    loan = models.ForeignKey(Loan, on_delete=models.CASCADE, related_name='moratoriums')
    pause_start_date = models.DateField()
    pause_end_date = models.DateField()
    interest_free = models.BooleanField(default=False)
    reason = models.TextField()
    performed_by = models.ForeignKey(SpaceMember, on_delete=models.PROTECT, related_name='+')
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        db_table = 'loan_moratoriums'
        app_label = 'api'


class LoanWaiver(models.Model):
    space = models.ForeignKey(Space, on_delete=models.CASCADE, related_name='+')
    loan = models.ForeignKey(Loan, on_delete=models.CASCADE, related_name='waivers')
    waiver_type = models.CharField(max_length=10, choices=WaiverType.choices)
    waived_amount = models.DecimalField(max_digits=14, decimal_places=2)
    reason = models.TextField()
    performed_by = models.ForeignKey(SpaceMember, on_delete=models.PROTECT, related_name='+')
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        db_table = 'loan_waivers'
        app_label = 'api'


class RepaymentScheduleLine(models.Model):
    space = models.ForeignKey(Space, on_delete=models.CASCADE, related_name='+')
    loan = models.ForeignKey(Loan, on_delete=models.CASCADE, related_name='schedule_lines')
    schedule_version = models.PositiveSmallIntegerField(default=1)
    line_no = models.PositiveSmallIntegerField()
    due_date = models.DateField()
    principal_due = models.DecimalField(max_digits=14, decimal_places=2)
    interest_due = models.DecimalField(max_digits=14, decimal_places=2, default=Decimal('0.00'))
    status = models.CharField(
        max_length=10,
        choices=ScheduleLineStatus.choices,
        default=ScheduleLineStatus.PENDING
    )
    is_current_version = models.BooleanField(default=True)
    superseded_by_type = models.CharField(max_length=30, null=True, blank=True)
    superseded_by_id = models.BigIntegerField(null=True, blank=True)
    is_custom_line = models.BooleanField(default=False)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        db_table = 'repayment_schedule_lines'
        app_label = 'api'
        indexes = [
            models.Index(fields=['loan', 'is_current_version', 'status', 'due_date']),
        ]
