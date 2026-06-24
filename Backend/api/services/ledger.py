import datetime
from decimal import Decimal
from django.db import transaction as db_transaction
from django.db.models import Sum
from django.utils import timezone
from api.models import (
    Loan, Transaction, TransactionAllocation, RepaymentScheduleLine,
    LoanStatus, TransactionType, ScheduleLineStatus, AdvancePaymentMode,
    PaymentTimingRule, ClosureReason
)
from api.exceptions import BusinessValidationError
from api.services.schedule import regenerate_remaining_schedule

@db_transaction.atomic
def record_transaction(
    loan, type, amount, transaction_date,
    collection_method=None, note=None,
    allocations_data=None, created_by=None
):
    """
    Records a financial transaction for a loan and allocates the payment.
    """
    amount = Decimal(str(amount))
    
    # Validation 1: Loan cannot be CLOSED (except for some special administrative cases, but standard is blocked)
    # Edge case #25: transaction posting blocked on CLOSED loans
    if loan.status == LoanStatus.CLOSED:
        raise BusinessValidationError(
            code="LOAN_CLOSED",
            message="Loan is closed — reopen it first, or log a Manual Adjustment with a reason.",
            edge_case_ref=25
        )

    # Validation 2: Date cannot predate loan start_date
    # Edge case #30: transaction date must not predate start_date
    if transaction_date < loan.start_date:
        raise BusinessValidationError(
            code="TRANSACTION_BEFORE_START_DATE",
            message="Transaction date cannot predate the loan start date.",
            edge_case_ref=30
        )

    # Coerce transaction_date to datetime if date only
    if isinstance(transaction_date, datetime.date) and not isinstance(transaction_date, datetime.datetime):
        transaction_date = timezone.make_aware(datetime.datetime.combine(transaction_date, datetime.time.min))

    # Warning for future date (Edge case #27)
    # Handled at view layer (we return a warning in the response)

    # Create Transaction record
    txn = Transaction.objects.create(
        space=loan.space,
        loan=loan,
        type=type,
        amount=amount,
        transaction_date=transaction_date,
        collection_method=collection_method,
        note=note,
        created_by=created_by
    )

    # If it's a disbursement, we don't allocate it against schedule lines
    if type == TransactionType.DISBURSEMENT:
        return txn, []

    # If the loan has ANYTIME payment timing rule, we don't have schedule lines
    # Edge case #28: Always allowed on ANYTIME loans, allocations are ignored
    if loan.payment_timing_rule == PaymentTimingRule.ANYTIME:
        return txn, []

    # Allocations handling
    allocations_to_create = []
    
    if allocations_data:
        # Manual allocation provided
        remaining_amount = amount
        for alloc_item in allocations_data:
            line_id = alloc_item.get('schedule_line_id')
            p_comp = Decimal(str(alloc_item.get('principal_component', 0)))
            i_comp = Decimal(str(alloc_item.get('interest_component', 0)))
            pen_comp = Decimal(str(alloc_item.get('penalty_component', 0)))
            
            try:
                line = RepaymentScheduleLine.objects.get(id=line_id, loan=loan, is_current_version=True)
            except RepaymentScheduleLine.DoesNotExist:
                raise BusinessValidationError(
                    code="INVALID_SCHEDULE_LINE",
                    message=f"Schedule line #{line_id} is not part of the active schedule for this loan."
                )
                
            # Create Allocation
            alloc = TransactionAllocation(
                space=loan.space,
                transaction=txn,
                schedule_line=line,
                principal_component=p_comp,
                interest_component=i_comp,
                penalty_component=pen_comp
            )
            allocations_to_create.append(alloc)
            
            # Check if paid in full
            # Let's sum all prior allocations for this line
            prior_allocs = TransactionAllocation.objects.filter(
                schedule_line=line,
                transaction__is_reversed=False
            ).aggregate(
                total_p=Sum('principal_component'),
                total_i=Sum('interest_component')
            )
            total_p_paid = (prior_allocs['total_p'] or Decimal('0.00')) + p_comp
            total_i_paid = (prior_allocs['total_i'] or Decimal('0.00')) + i_comp
            
            if total_p_paid >= line.principal_due and total_i_paid >= line.interest_due:
                line.status = ScheduleLineStatus.PAID
                line.save()
                
            remaining_amount -= (p_comp + i_comp + pen_comp)
            
        if remaining_amount > 0:
            # Overpayment on manual allocation: apply to advance credit or recalculate
            _handle_excess_payment(loan, remaining_amount, txn, transaction_date)
            
    else:
        # Auto-allocation
        remaining_amount = amount
        unpaid_lines = RepaymentScheduleLine.objects.filter(
            loan=loan,
            is_current_version=True,
            status=ScheduleLineStatus.PENDING
        ).order_by('due_date', 'line_no')
        
        for line in unpaid_lines:
            if remaining_amount <= 0:
                break
                
            # Calculate prior payments for this line
            prior = TransactionAllocation.objects.filter(
                schedule_line=line,
                transaction__is_reversed=False
            ).aggregate(
                p_paid=Sum('principal_component'),
                i_paid=Sum('interest_component')
            )
            p_paid = prior['p_paid'] or Decimal('0.00')
            i_paid = prior['i_paid'] or Decimal('0.00')
            
            unpaid_interest = max(Decimal('0.00'), line.interest_due - i_paid)
            unpaid_principal = max(Decimal('0.00'), line.principal_due - p_paid)
            
            alloc_i = Decimal('0.00')
            alloc_p = Decimal('0.00')
            
            # 1. Allocate to interest first
            if unpaid_interest > 0:
                alloc_i = min(remaining_amount, unpaid_interest)
                remaining_amount -= alloc_i
                
            # 2. Allocate to principal next
            if remaining_amount > 0 and unpaid_principal > 0:
                alloc_p = min(remaining_amount, unpaid_principal)
                remaining_amount -= alloc_p
                
            if alloc_i > 0 or alloc_p > 0:
                alloc = TransactionAllocation(
                    space=loan.space,
                    transaction=txn,
                    schedule_line=line,
                    principal_component=alloc_p,
                    interest_component=alloc_i,
                    penalty_component=Decimal('0.00')
                )
                allocations_to_create.append(alloc)
                
                # Check if line fully paid
                if (p_paid + alloc_p) >= line.principal_due and (i_paid + alloc_i) >= line.interest_due:
                    line.status = ScheduleLineStatus.PAID
                    line.save()
                    
        # Create allocations in database
        if allocations_to_create:
            TransactionAllocation.objects.bulk_create(allocations_to_create)
            
        # If there is still remaining amount, it's an overpayment!
        if remaining_amount > 0:
            _handle_excess_payment(loan, remaining_amount, txn, transaction_date)

    return txn, allocations_to_create


def _handle_excess_payment(loan, excess_amount, transaction, transaction_date):
    """
    Internal helper to handle payment amount that exceeds total scheduled obligations.
    """
    if loan.advance_payment_mode == AdvancePaymentMode.CARRY_FORWARD_CREDIT:
        # Carry forward as advance credit balance
        loan.advance_credit_balance += excess_amount
        loan.save()
        
        # Create unallocated allocation record to track the excess on this transaction
        TransactionAllocation.objects.create(
            space=loan.space,
            transaction=transaction,
            schedule_line=None,
            principal_component=excess_amount,
            interest_component=Decimal('0.00'),
            penalty_component=Decimal('0.00')
        )
    elif loan.advance_payment_mode == AdvancePaymentMode.RECALCULATE_SCHEDULE:
        # Subtract excess from principal and regenerate schedule immediately
        # We write this excess as an allocation with schedule_line=None
        TransactionAllocation.objects.create(
            space=loan.space,
            transaction=transaction,
            schedule_line=None,
            principal_component=excess_amount,
            interest_component=Decimal('0.00'),
            penalty_component=Decimal('0.00')
        )
        # Recalculate schedule
        regenerate_remaining_schedule(
            loan=loan,
            effective_date=transaction_date.date() if isinstance(transaction_date, datetime.datetime) else transaction_date,
            reason_type='ADVANCE_PAYMENT',
            reason_id=transaction.id
        )


@db_transaction.atomic
def reverse_transaction(transaction_id, reason=None, performed_by=None):
    """
    Reverses a transaction by inserting a reversing MANUAL_ADJUSTMENT transaction.
    """
    try:
        orig = Transaction.objects.get(id=transaction_id)
    except Transaction.DoesNotExist:
        raise BusinessValidationError(
            code="TRANSACTION_NOT_FOUND",
            message=f"Transaction #{transaction_id} not found."
        )

    if orig.is_reversed:
        raise BusinessValidationError(
            code="TRANSACTION_ALREADY_REVERSED",
            message="This transaction has already been reversed."
        )

    loan = orig.loan

    # Reversal creates a MANUAL_ADJUSTMENT with negated effect
    reversing_amount = orig.amount
    
    # Reversal note
    rev_note = f"Reversal of transaction #{orig.id}"
    if reason:
        rev_note += f": {reason}"

    # Create the reversing transaction
    rev_txn = Transaction.objects.create(
        space=orig.space,
        loan=loan,
        type=TransactionType.MANUAL_ADJUSTMENT,
        amount=reversing_amount, # Always store positive, type carries direction or we handle it in calculations
        transaction_date=timezone.now(),
        note=rev_note,
        reverses_transaction=orig,
        created_by=performed_by
    )

    # Flip original is_reversed to True
    orig.is_reversed = True
    orig.save()

    # Revert allocations: we must mark the original transaction's allocations as reversed
    # For any schedule line that was marked PAID by the original transaction, we revert its status to PENDING
    allocations = TransactionAllocation.objects.filter(transaction=orig)
    
    for alloc in allocations:
        if alloc.schedule_line:
            line = alloc.schedule_line
            line.status = ScheduleLineStatus.PENDING
            line.save()

    # Create a reversing allocation entry
    for alloc in allocations:
        TransactionAllocation.objects.create(
            space=orig.space,
            transaction=rev_txn,
            schedule_line=alloc.schedule_line,
            principal_component=-alloc.principal_component,
            interest_component=-alloc.interest_component,
            penalty_component=-alloc.penalty_component
        )

    # If it was an overpayment, adjust the loan's advance credit balance
    if orig.loan.advance_payment_mode == AdvancePaymentMode.CARRY_FORWARD_CREDIT:
        # Sum allocations with schedule_line=None
        unallocated = allocations.filter(schedule_line__isnull=True).aggregate(total=Sum('principal_component'))['total'] or Decimal('0.00')
        if unallocated > 0:
            orig.loan.advance_credit_balance = max(Decimal('0.00'), orig.loan.advance_credit_balance - unallocated)
            orig.loan.save()

    return rev_txn

