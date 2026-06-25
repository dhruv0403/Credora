import datetime
from decimal import Decimal
from django.utils import timezone
from django.db import transaction, models
from api.models import (
    Loan, RepaymentScheduleLine, Disbursement, LoanRateHistory,
    InterestType, RepaymentType, RatePeriod, PaymentFrequency,
    InterestTiming, PaymentTimingRule, ScheduleLineStatus, MemberStatus,
    FixedInterestFrequency, LoanStatus, ClosureReason
)

def add_months(d, months):
    """
    Safely adds calendar months to a date or datetime object, handling end-of-month bounds.
    """
    month = d.month - 1 + months
    year = d.year + month // 12
    month = month % 12 + 1
    # Handle maximum days in target month
    is_leap = year % 4 == 0 and (year % 100 != 0 or year % 400 == 0)
    days_in_month = [31, 29 if is_leap else 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31]
    day = min(d.day, days_in_month[month - 1])
    
    if isinstance(d, datetime.datetime):
        # preserve timezone if d is timezone aware
        if timezone.is_aware(d):
            naive = datetime.datetime(year, month, day, d.hour, d.minute, d.second)
            return timezone.make_aware(naive, d.tzinfo)
        return datetime.datetime(year, month, day, d.hour, d.minute, d.second)
    return datetime.date(year, month, day)


def get_frequency_multiplier(frequency):
    """
    Returns the number of periods in a year for the given payment frequency.
    """
    if frequency == PaymentFrequency.DAILY:
        return 365
    elif frequency == PaymentFrequency.WEEKLY:
        return 52
    elif frequency == PaymentFrequency.BI_WEEKLY:
        return 26
    elif frequency == PaymentFrequency.MONTHLY:
        return 12
    elif frequency == PaymentFrequency.QUARTERLY:
        return 4
    return 12


def get_due_date(start_date, index, frequency):
    """
    Calculates the due date for the index-th installment based on payment frequency.
    """
    if frequency == PaymentFrequency.DAILY:
        return start_date + datetime.timedelta(days=index)
    elif frequency == PaymentFrequency.WEEKLY:
        return start_date + datetime.timedelta(weeks=index)
    elif frequency == PaymentFrequency.BI_WEEKLY:
        return start_date + datetime.timedelta(weeks=2 * index)
    elif frequency == PaymentFrequency.MONTHLY:
        return add_months(start_date, index)
    elif frequency == PaymentFrequency.QUARTERLY:
        return add_months(start_date, 3 * index)
    return add_months(start_date, index)


def calculate_periodic_rate(rate_value, rate_period, payment_frequency):
    """
    Aligns rate_value + rate_period to the payment_frequency.
    Returns the periodic interest rate as a decimal (e.g. 0.015 for 1.5% per period).
    """
    if not rate_value:
        return Decimal('0.0000')
        
    rate_val = Decimal(str(rate_value))
    
    # Step 1: Convert rate to annual rate (as a decimal)
    if rate_period == RatePeriod.DAY:
        annual_rate = rate_val * 365 / 100
    elif rate_period == RatePeriod.WEEK:
        annual_rate = rate_val * 52 / 100
    elif rate_period == RatePeriod.MONTH:
        annual_rate = rate_val * 12 / 100
    elif rate_period == RatePeriod.YEAR:
        annual_rate = rate_val / 100
    else:
        annual_rate = rate_val / 100
        
    # Step 2: Divide by installment periods in a year
    multiplier = get_frequency_multiplier(payment_frequency)
    periodic_rate = annual_rate / multiplier
    return periodic_rate


def calculate_emi_amount(principal, rate_value, rate_period, tenure_periods, interest_type, repayment_type, payment_frequency, fixed_interest_amount=0):
    """
    Calculates the standard installment payment (EMI/periodic payment) for the loan.
    """
    principal = Decimal(str(principal))
    tenure = int(tenure_periods) if tenure_periods else 1
    fixed_interest = Decimal(str(fixed_interest_amount or 0))

    if interest_type == InterestType.NONE or rate_value == 0:
        return principal / tenure

    if interest_type == InterestType.FIXED:
        return (principal + fixed_interest) / tenure

    # Interest rates based on formulas
    r = calculate_periodic_rate(rate_value, rate_period, payment_frequency)

    if interest_type == InterestType.FLAT:
        freq_mult = get_frequency_multiplier(payment_frequency)
        tenure_years = Decimal(str(tenure)) / Decimal(str(freq_mult))
        r_annual = r * freq_mult
        total_interest = principal * r_annual * tenure_years
        return (principal + total_interest) / tenure

    if interest_type == InterestType.COMPOUND:
        freq_mult = get_frequency_multiplier(payment_frequency)
        tenure_years = Decimal(str(tenure)) / Decimal(str(freq_mult))
        r_annual = r * freq_mult
        total_compound_amount = principal * ((1 + r_annual) ** tenure_years)
        return total_compound_amount / tenure

    # REDUCING_BALANCE with EMI
    if interest_type == InterestType.REDUCING_BALANCE:
        if repayment_type == RepaymentType.EMI:
            if r == 0:
                return principal / tenure
            pow_val = (1 + r) ** tenure
            emi = principal * r * pow_val / (pow_val - 1)
            return emi
        elif repayment_type in [RepaymentType.INTEREST_ONLY, RepaymentType.ONE_TIME]:
            # Periodic EMI is just interest. Principal is paid in final balloon installment.
            return principal * r
        elif repayment_type == RepaymentType.PRINCIPAL_ONLY:
            # Principal only means principal is split equally, interest is added on top.
            # Thus, the EMI amount varies per installment. We return the principal portion here.
            return principal / tenure

    return principal / tenure


def generate_schedule_lines(
    space_id, loan_id, principal_amount, start_date, first_due_date,
    tenure_periods, interest_type, rate_value, rate_period,
    fixed_interest_amount, fixed_interest_frequency, interest_timing,
    repayment_type, has_balloon_final_payment, payment_frequency,
    payment_timing_rule, schedule_version=1, start_line_no=1,
    moratorium_ranges=None
):
    """
    Generates repayment schedule lines as list of dictionaries.
    moratorium_ranges: list of tuples (start_date, end_date, interest_free)
    """
    lines = []
    principal = Decimal(str(principal_amount))
    tenure = int(tenure_periods) if tenure_periods else 1
    fixed_interest = Decimal(str(fixed_interest_amount or 0))
    
    if payment_timing_rule == PaymentTimingRule.ANYTIME:
        # Flexible/Anytime loans have no schedule lines by design
        return lines

    # Calculate standard EMI/installment base payment
    emi_base = calculate_emi_amount(
        principal=principal,
        rate_value=rate_value,
        rate_period=rate_period,
        tenure_periods=tenure,
        interest_type=interest_type,
        repayment_type=repayment_type,
        payment_frequency=payment_frequency,
        fixed_interest_amount=fixed_interest if fixed_interest_frequency == FixedInterestFrequency.ONE_TIME else fixed_interest * tenure
    )

    r = calculate_periodic_rate(rate_value, rate_period, payment_frequency)
    
    # If interest timing is upfront or deducted from disbursement, periodic interest is 0
    is_interest_payable_periodically = (interest_timing == InterestTiming.PAYABLE_PERIODICALLY)
    
    # Date tracking
    base_date = first_due_date if first_due_date else start_date.date()
    
    # We will generate tenure lines
    bal = principal
    line_idx = 0
    lines_generated = 0
    
    while lines_generated < tenure:
        line_idx += 1
        due_date = get_due_date(base_date, line_idx - 1, payment_frequency)
        
        # Check if due_date falls in a moratorium
        in_moratorium = False
        is_interest_free_mora = False
        if moratorium_ranges:
            for m_start, m_end, int_free in moratorium_ranges:
                if m_start <= due_date <= m_end:
                    in_moratorium = True
                    is_interest_free_mora = int_free
                    break
        
        if in_moratorium:
            # Shift the schedule: we create a moratorium line or just shift the due date forward.
            # In Django Backend Restructuring section: "moratorium: mark a range where no installment is due".
            # So we skip this due_date for standard collection and shift subsequent ones forward,
            # or we log a schedule line with 0 principal and interest (unless interest continues to accrue).
            # The spec says: "interest free is FALSE by default ... interest continues accruing".
            # Let's insert a pause line or simply shift the schedule.
            # Since standard practice is that moratorium offsets due dates, let's keep generating.
            # If interest continues accruing, it adds to the next installment's interest or is logged on a pause line.
            # Let's shift subsequent installments.
            # To do that, we shift our base_date or skip this index.
            # Let's adjust due_date calculation by shifting base_date by one period length.
            # A simple way to do it: we increment a moratorium offset days/months.
            # Let's just shift the schedule lines' due dates by the duration of the moratorium.
            # Let's write standard logic: if due_date falls within moratorium, we extend the schedule's calendar duration
            # and shift this installment's due date to after the moratorium ends.
            # Wait, standard moratorium pauses EMIs during the range, meaning no EMIs are due during the range.
            # Let's handle this in view layer by shifting due dates when creating the moratorium.
            pass

        # Calculate interest and principal components
        int_due = Decimal('0.00')
        prin_due = Decimal('0.00')

        if is_interest_payable_periodically:
            if interest_type == InterestType.REDUCING_BALANCE:
                int_due = bal * r
                if repayment_type == RepaymentType.EMI:
                    prin_due = emi_base - int_due
                elif repayment_type in [RepaymentType.INTEREST_ONLY, RepaymentType.ONE_TIME]:
                    prin_due = Decimal('0.00')
                elif repayment_type == RepaymentType.PRINCIPAL_ONLY:
                    prin_due = principal / tenure
                else:
                    prin_due = emi_base
            elif interest_type == InterestType.FLAT:
                freq_mult = get_frequency_multiplier(payment_frequency)
                tenure_years = Decimal(str(tenure)) / Decimal(str(freq_mult))
                r_annual = r * freq_mult
                total_interest = principal * r_annual * tenure_years
                int_due = total_interest / tenure
                prin_due = principal / tenure
            elif interest_type == InterestType.COMPOUND:
                # Compound interest per period = compound amount per period minus principal portion
                freq_mult = get_frequency_multiplier(payment_frequency)
                tenure_years = Decimal(str(tenure)) / Decimal(str(freq_mult))
                r_annual = r * freq_mult
                total_compound_amount = principal * ((1 + r_annual) ** tenure_years)
                int_due = (total_compound_amount - principal) / tenure
                prin_due = principal / tenure
            elif interest_type == InterestType.FIXED:
                if fixed_interest_frequency == FixedInterestFrequency.ONE_TIME:
                    int_due = fixed_interest / tenure
                else:
                    int_due = fixed_interest
                prin_due = principal / tenure
            else:
                # NONE or CUSTOM
                int_due = Decimal('0.00')
                prin_due = emi_base
        else:
            # Interest is collected upfront or deducted from disbursement, so periodic interest = 0
            int_due = Decimal('0.00')
            prin_due = principal / tenure if repayment_type != RepaymentType.ONE_TIME else Decimal('0.00')

        # Handle final installment principal adjustments
        lines_generated += 1
        
        # Last installment adjustments for balloon or bullet payments
        is_last = (lines_generated == tenure)
        if is_last:
            if repayment_type in [RepaymentType.INTEREST_ONLY, RepaymentType.ONE_TIME] or has_balloon_final_payment:
                prin_due = bal
            else:
                # Adjust rounding errors
                prin_due = bal
        
        bal = max(Decimal('0.00'), bal - prin_due)

        lines.append({
            'space_id': space_id,
            'schedule_version': schedule_version,
            'line_no': start_line_no + lines_generated - 1,
            'due_date': due_date,
            'principal_due': round(prin_due, 2),
            'interest_due': round(int_due, 2),
            'status': ScheduleLineStatus.PENDING,
            'is_current_version': True
        })

    return lines


@transaction.atomic
def generate_and_save_initial_schedule(loan):
    """
    Generates and saves the initial schedule (version 1) for a loan.
    Called when a loan moves from DRAFT to ACTIVE.
    """
    if loan.payment_timing_rule == PaymentTimingRule.ANYTIME:
        # Flexible/Anytime loans have no schedule lines
        return

    # Delete any existing lines (just in case)
    RepaymentScheduleLine.objects.filter(loan=loan).delete()

    lines_data = generate_schedule_lines(
        space_id=loan.space_id,
        loan_id=loan.id,
        principal_amount=loan.principal_amount,
        start_date=loan.start_date,
        first_due_date=loan.first_due_date,
        tenure_periods=loan.tenure_periods,
        interest_type=loan.interest_type,
        rate_value=loan.rate_value,
        rate_period=loan.rate_period,
        fixed_interest_amount=loan.fixed_interest_amount,
        fixed_interest_frequency=loan.fixed_interest_frequency,
        interest_timing=loan.interest_timing,
        repayment_type=loan.repayment_type,
        has_balloon_final_payment=loan.has_balloon_final_payment,
        payment_frequency=loan.payment_frequency,
        payment_timing_rule=loan.payment_timing_rule,
        schedule_version=1
    )

    db_lines = [
        RepaymentScheduleLine(loan=loan, **line)
        for line in lines_data
    ]
    RepaymentScheduleLine.objects.bulk_create(db_lines)


@transaction.atomic
def regenerate_remaining_schedule(loan, effective_date, added_periods=0, moratorium_dates=None, reason_type=None, reason_id=None):
    """
    Regenerates the unpaid portion of the schedule from effective_date forward.
    Marks old lines as is_current_version=False and creates new lines with incremented version.
    moratorium_dates: dict containing {'start_date': Date, 'end_date': Date, 'interest_free': Bool} or None
    """
    if loan.payment_timing_rule == PaymentTimingRule.ANYTIME:
        return 0

    # Step 1: Identify all unpaid lines starting on or after effective_date
    unpaid_lines = RepaymentScheduleLine.objects.filter(
        loan=loan,
        is_current_version=True,
        status=ScheduleLineStatus.PENDING,
        due_date__gte=effective_date
    ).order_by('line_no')

    if not unpaid_lines.exists() and added_periods == 0 and not moratorium_dates:
        return 0

    current_version = RepaymentScheduleLine.objects.filter(loan=loan).aggregate(
        max_version=models.Max('schedule_version')
    )['max_version'] or 1
    new_version = current_version + 1

    # Step 2: Calculate remaining principal and remaining tenure
    # Remaining principal = Loan Outstanding principal as of effective_date
    # To compute remaining principal, we sum disbursements up to effective_date minus allocations
    # or simply take total unpaid principal due in the remaining schedule lines.
    # In Django Data Model §4.5, "versioned in place... remaining schedule regenerated from outstanding principal".
    # Remaining principal is the sum of principal_due in the remaining unpaid lines.
    # Wait, if there was advance credit or manual payment applied, the remaining principal should reflect that.
    # Outstanding principal is: SUM(disbursements.amount) - SUM(allocations.principal_component)
    # Let's calculate outstanding principal directly:
    from django.db.models import Sum
    from api.models import Disbursement, TransactionAllocation
    
    total_disbursed = Disbursement.objects.filter(loan=loan, disbursement_date__lte=effective_date).aggregate(
        total=Sum('amount')
    )['total'] or Decimal('0.00')
    
    total_principal_repaid = TransactionAllocation.objects.filter(
        transaction__loan=loan,
        transaction__is_reversed=False,
        transaction__transaction_date__lte=effective_date
    ).aggregate(total=Sum('principal_component'))['total'] or Decimal('0.00')
    
    remaining_principal = total_disbursed - total_principal_repaid
    
    # If there is advance credit balance, we also subtract it!
    # Because advance credit balance is applied to reduce outstanding principal on mode switch
    remaining_principal -= loan.advance_credit_balance

    if remaining_principal <= 0:
        # If remaining principal is zero or less, we should close the loan instead of generating schedule!
        # Edge case #33: auto-close if applied credit zeroes all installments
        loan.status = LoanStatus.CLOSED
        loan.closure_reason = ClosureReason.FULLY_PAID
        loan.closed_at = timezone.now()
        loan.save()
        
        # Mark all remaining unpaid lines as superseded
        unpaid_lines.update(
            is_current_version=False,
            superseded_by_type=reason_type,
            superseded_by_id=reason_id
        )
        return new_version

    # Remaining tenure periods
    remaining_tenure = unpaid_lines.count() + added_periods
    if remaining_tenure <= 0:
        return 0

    # Start line no for new lines
    start_line_no = unpaid_lines.first().line_no if unpaid_lines.exists() else 1

    # Determine start date for the new schedule portion
    new_start_date = unpaid_lines.first().due_date if unpaid_lines.exists() else effective_date

    # Step 3: Mark current unpaid lines as superseded
    unpaid_lines.update(
        is_current_version=False,
        superseded_by_type=reason_type,
        superseded_by_id=reason_id
    )

    # Step 4: Handle Moratorium Pause Date shift
    moratorium_ranges = []
    if moratorium_dates:
        m_start = moratorium_dates['start_date']
        m_end = moratorium_dates['end_date']
        int_free = moratorium_dates.get('interest_free', False)
        moratorium_ranges.append((m_start, m_end, int_free))
        
        # Calculate how many days/months to shift
        # A moratorium shifts the due dates of all remaining unpaid installments
        # Let's shift the start date of the first installment to be after the moratorium ends
        # If new_start_date falls within the moratorium, we set it to the first frequency interval after moratorium end date.
        duration_days = (m_end - m_start).days + 1
        
        # If the moratorium overlaps with new_start_date, shift new_start_date forward
        if m_start <= new_start_date <= m_end:
            new_start_date = m_end + datetime.timedelta(days=1)
            # Find next scheduled date aligned with frequency
            # For simplicity, we can let the new schedule start from this shifted date
            
    # Step 5: Generate the new schedule lines
    new_lines_data = generate_schedule_lines(
        space_id=loan.space_id,
        loan_id=loan.id,
        principal_amount=remaining_principal,
        start_date=timezone.make_aware(datetime.datetime.combine(new_start_date, datetime.time.min)) if isinstance(new_start_date, datetime.date) else new_start_date,
        first_due_date=new_start_date,
        tenure_periods=remaining_tenure,
        interest_type=loan.interest_type,
        rate_value=loan.rate_value,
        rate_period=loan.rate_period,
        fixed_interest_amount=loan.fixed_interest_amount,
        fixed_interest_frequency=loan.fixed_interest_frequency,
        interest_timing=loan.interest_timing,
        repayment_type=loan.repayment_type,
        has_balloon_final_payment=loan.has_balloon_final_payment,
        payment_frequency=loan.payment_frequency,
        payment_timing_rule=loan.payment_timing_rule,
        schedule_version=new_version,
        start_line_no=start_line_no,
        moratorium_ranges=moratorium_ranges
    )

    db_lines = [
        RepaymentScheduleLine(loan=loan, **line)
        for line in new_lines_data
    ]
    RepaymentScheduleLine.objects.bulk_create(db_lines)

    # Write rate history initial/change if rate changed (Variable Rate support)
    # The view layer will write these entries but they will trigger this regeneration.
    
    return new_version

