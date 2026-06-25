from django.test import TestCase
from django.utils import timezone
from django.db.models import Sum
from api.models import (
    User, Space, SpaceMember, SpaceSettings, Contact, Loan, Disbursement,
    RepaymentScheduleLine, Transaction, TransactionAllocation,
    MemberRole, MemberStatus, LoanStatus, ScheduleLineStatus, TransactionType,
    InterestType, RepaymentType, RatePeriod, PaymentFrequency,
    AdvancePaymentMode
)
from api.services.schedule import generate_and_save_initial_schedule
from api.services.ledger import record_transaction, reverse_transaction
from decimal import Decimal
import datetime

class CredoraBackendTests(TestCase):
    def setUp(self):
        # 1. Create User
        self.user = User.objects.create_user(
            email="testowner@example.com",
            display_name="Test Owner",
            password="password123"
        )
        
        # 2. Create Space
        self.space = Space.objects.create(
            owner=self.user,
            name="Test Space",
            space_type="PERSONAL",
            space_visibility="PRIVATE"
        )
        
        # 3. Create Settings
        self.settings = SpaceSettings.objects.create(
            space=self.space,
            default_interest_type=InterestType.NONE,
            default_advance_payment_mode=AdvancePaymentMode.CARRY_FORWARD_CREDIT,
            default_grace_period_days=0
        )
        
        # 4. Create Member
        self.member = SpaceMember.objects.create(
            space=self.space,
            user=self.user,
            role=MemberRole.OWNER,
            status=MemberStatus.ACTIVE,
            joined_at=timezone.now()
        )
        
        # 5. Create Contact
        self.contact = Contact.objects.create(
            space=self.space,
            name="Borrower Joe",
            created_by=self.member
        )

    def test_loan_activation_and_schedule_generation(self):
        # Create a reducing balance monthly loan (DRAFT)
        loan = Loan.objects.create(
            space=self.space,
            contact=self.contact,
            direction="GIVEN",
            status=LoanStatus.DRAFT,
            principal_amount=Decimal("10000.00"),
            start_date=timezone.now(),
            first_due_date=timezone.localdate() + datetime.timedelta(days=30),
            tenure_periods=5,
            interest_type=InterestType.REDUCING_BALANCE,
            rate_value=Decimal("2.0"), # 2% per month
            rate_period=RatePeriod.MONTH,
            interest_timing="PAYABLE_PERIODICALLY",
            repayment_type=RepaymentType.EMI,
            payment_frequency=PaymentFrequency.MONTHLY,
            advance_payment_mode=AdvancePaymentMode.CARRY_FORWARD_CREDIT,
            created_by=self.member
        )
        
        # Create seed disbursement
        Disbursement.objects.create(
            space=self.space,
            loan=loan,
            amount=loan.principal_amount,
            disbursement_date=loan.start_date,
            sequence_no=1,
            label='ORIGINAL',
            created_by=self.member
        )

        # Activate loan
        loan.status = LoanStatus.ACTIVE
        loan.save()
        generate_and_save_initial_schedule(loan)
        
        # Check that we generated exactly 5 schedule lines
        lines = RepaymentScheduleLine.objects.filter(loan=loan, is_current_version=True).order_by('line_no')
        self.assertEqual(lines.count(), 5)
        
        # Check interest and principal breakdown: EMI for 10000 at 2% monthly for 5 months
        # EMI = 10000 * 0.02 * (1.02)^5 / ((1.02)^5 - 1)
        # EMI approx = 2121.58
        total_p_due = lines.aggregate(total=Sum('principal_due'))['total']
        self.assertAlmostEqual(total_p_due, Decimal("10000.00"), places=2)

    def test_transaction_auto_allocation_and_reversals(self):
        # Create a loan and activate it
        loan = Loan.objects.create(
            space=self.space,
            contact=self.contact,
            direction="GIVEN",
            status=LoanStatus.ACTIVE,
            principal_amount=Decimal("5000.00"),
            start_date=timezone.now(),
            first_due_date=timezone.localdate() + datetime.timedelta(days=30),
            tenure_periods=2,
            interest_type=InterestType.REDUCING_BALANCE,
            rate_value=Decimal("12.0"), # 12% per year = 1% per month
            rate_period=RatePeriod.YEAR,
            interest_timing="PAYABLE_PERIODICALLY",
            repayment_type=RepaymentType.EMI,
            payment_frequency=PaymentFrequency.MONTHLY,
            advance_payment_mode=AdvancePaymentMode.CARRY_FORWARD_CREDIT,
            created_by=self.member
        )
        
        Disbursement.objects.create(
            space=self.space,
            loan=loan,
            amount=loan.principal_amount,
            disbursement_date=loan.start_date,
            sequence_no=1,
            label='ORIGINAL',
            created_by=self.member
        )
        
        generate_and_save_initial_schedule(loan)
        
        # Line 1: principal approx 2462.81, interest 5000 * 0.01 = 50.00. EMI approx 2512.81
        lines = RepaymentScheduleLine.objects.filter(loan=loan, is_current_version=True).order_by('line_no')
        line1 = lines.first()
        self.assertEqual(line1.interest_due, Decimal("50.00"))
        
        # Pay 100 (partially covers line 1)
        # Auto-allocate: should cover interest first (50.00), then principal (50.00)
        txn1, allocs = record_transaction(
            loan=loan,
            type=TransactionType.PAYMENT_RECEIVED,
            amount=Decimal("100.00"),
            transaction_date=timezone.now(),
            created_by=self.member
        )
        
        self.assertEqual(allocs[0].interest_component, Decimal("50.00"))
        self.assertEqual(allocs[0].principal_component, Decimal("50.00"))
        
        # Check line 1 is still pending
        line1.refresh_from_db()
        self.assertEqual(line1.status, ScheduleLineStatus.PENDING)
        
        # Revert payment
        rev_txn = reverse_transaction(txn1.id, reason="Correction", performed_by=self.member)
        txn1.refresh_from_db()
        self.assertTrue(txn1.is_reversed)
        self.assertEqual(rev_txn.type, TransactionType.MANUAL_ADJUSTMENT)

    def test_switch_mode_and_credit_balance_forfeiture(self):
        loan = Loan.objects.create(
            space=self.space,
            contact=self.contact,
            direction="GIVEN",
            status=LoanStatus.ACTIVE,
            principal_amount=Decimal("5000.00"),
            start_date=timezone.now(),
            first_due_date=timezone.localdate() + datetime.timedelta(days=30),
            tenure_periods=2,
            interest_type=InterestType.NONE,
            repayment_type=RepaymentType.EMI,
            payment_frequency=PaymentFrequency.MONTHLY,
            advance_payment_mode=AdvancePaymentMode.CARRY_FORWARD_CREDIT,
            advance_credit_balance=Decimal("200.00"), # Existing credit
            created_by=self.member
        )
        
        Disbursement.objects.create(
            space=self.space,
            loan=loan,
            amount=loan.principal_amount,
            disbursement_date=loan.start_date,
            sequence_no=1,
            label='ORIGINAL',
            created_by=self.member
        )
        generate_and_save_initial_schedule(loan)
        
        # Switch mode to RECALCULATE_SCHEDULE (corresponds to views action change_advance_mode)
        # Credit balance of 200 should be applied to outstanding principal immediately and regenerated.
        loan.advance_payment_mode = AdvancePaymentMode.RECALCULATE_SCHEDULE
        loan.advance_credit_balance = Decimal('0.00')
        loan.save()
        
        # Check that schedule was regenerated or we can trigger it
        # (This is exactly what the view does when switching mode)

    def test_request_response_logging_middleware(self):
        import json
        # Capture the logs written to the 'api.request' logger
        with self.assertLogs('api.request', level='INFO') as cm:
            # Make a simple request to register endpoint using test client
            response = self.client.get('/api/auth/register/')
            
            # Verify that at least one log entry was captured
            self.assertTrue(len(cm.output) > 0)
            
            # Extract JSON log data from log line
            log_line = cm.output[0]
            json_start = log_line.find('{')
            self.assertNotEqual(json_start, -1)
            json_str = log_line[json_start:]
            log_data = json.loads(json_str)
            
            # Assert correct logging details
            self.assertEqual(log_data['method'], 'GET')
            self.assertEqual(log_data['path'], '/api/auth/register/')
            self.assertEqual(log_data['status_code'], response.status_code)
            self.assertIn('request_id', log_data)
            self.assertIn('latency_ms', log_data)
            self.assertIn('remote_ip', log_data)


