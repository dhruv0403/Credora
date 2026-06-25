from django.db import models
from .spaces import Space, SpaceMember
from .loans import Loan, RepaymentScheduleLine
from decimal import Decimal

class CollectionMethod(models.TextChoices):
    CASH = 'CASH', 'Cash'
    UPI = 'UPI', 'UPI'
    BANK_TRANSFER = 'BANK_TRANSFER', 'Bank Transfer'
    CHEQUE = 'CHEQUE', 'Cheque'
    AUTO_DEBIT = 'AUTO_DEBIT', 'Auto Debit'
    OTHER = 'OTHER', 'Other'

class TransactionType(models.TextChoices):
    PAYMENT_RECEIVED = 'PAYMENT_RECEIVED', 'Payment Received'
    PAYMENT_MADE = 'PAYMENT_MADE', 'Payment Made'
    INTEREST_RECEIVED = 'INTEREST_RECEIVED', 'Interest Received'
    INTEREST_PAID = 'INTEREST_PAID', 'Interest Paid'
    PENALTY_RECEIVED = 'PENALTY_RECEIVED', 'Penalty Received'
    PENALTY_PAID = 'PENALTY_PAID', 'Penalty Paid'
    DISBURSEMENT = 'DISBURSEMENT', 'Disbursement'
    SETTLEMENT = 'SETTLEMENT', 'Settlement'
    MANUAL_ADJUSTMENT = 'MANUAL_ADJUSTMENT', 'Manual Adjustment'


class Transaction(models.Model):
    space = models.ForeignKey(Space, on_delete=models.CASCADE, related_name='+')
    loan = models.ForeignKey(Loan, on_delete=models.CASCADE, related_name='transactions')
    type = models.CharField(max_length=30, choices=TransactionType.choices)
    amount = models.DecimalField(max_digits=14, decimal_places=2)
    transaction_date = models.DateTimeField()
    collection_method = models.CharField(
        max_length=20,
        choices=CollectionMethod.choices,
        null=True,
        blank=True
    )
    note = models.TextField(null=True, blank=True)
    reverses_transaction = models.ForeignKey(
        'self',
        null=True,
        blank=True,
        on_delete=models.SET_NULL,
        related_name='reversed_by_transactions'
    )
    is_reversed = models.BooleanField(default=False)
    adjustment_reason = models.TextField(null=True, blank=True)
    created_by = models.ForeignKey(SpaceMember, on_delete=models.PROTECT, related_name='+')
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        db_table = 'transactions'
        app_label = 'api'
        indexes = [
            models.Index(fields=['loan', 'transaction_date']),
            models.Index(fields=['space', 'transaction_date']),
        ]


class TransactionAllocation(models.Model):
    space = models.ForeignKey(Space, on_delete=models.CASCADE, related_name='+')
    transaction = models.ForeignKey(Transaction, on_delete=models.CASCADE, related_name='allocations')
    schedule_line = models.ForeignKey(
        RepaymentScheduleLine,
        null=True,
        blank=True,
        on_delete=models.CASCADE,
        related_name='allocations'
    )
    principal_component = models.DecimalField(max_digits=14, decimal_places=2, default=Decimal('0.00'))
    interest_component = models.DecimalField(max_digits=14, decimal_places=2, default=Decimal('0.00'))
    penalty_component = models.DecimalField(max_digits=14, decimal_places=2, default=Decimal('0.00'))
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        db_table = 'transaction_allocations'
        app_label = 'api'


class Settlement(models.Model):
    transaction = models.OneToOneField(Transaction, on_delete=models.CASCADE, primary_key=True, related_name='settlement_detail')
    space = models.ForeignKey(Space, on_delete=models.CASCADE, related_name='+')
    loan = models.ForeignKey(Loan, on_delete=models.CASCADE, related_name='+')
    settlement_amount = models.DecimalField(max_digits=14, decimal_places=2)
    outstanding_balance_at_settlement = models.DecimalField(max_digits=14, decimal_places=2)
    settlement_date = models.DateField()
    note = models.TextField(null=True, blank=True)

    forgiven_amount_field = models.DecimalField(db_column='forgiven_amount', max_digits=14, decimal_places=2, editable=False)

    class Meta:
        db_table = 'settlements'
        app_label = 'api'

    @property
    def forgiven_amount(self):
        return self.outstanding_balance_at_settlement - self.settlement_amount

    def save(self, *args, **kwargs):
        self.forgiven_amount_field = self.forgiven_amount
        super().save(*args, **kwargs)
