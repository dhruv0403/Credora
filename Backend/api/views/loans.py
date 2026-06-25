import uuid
import datetime
from decimal import Decimal
from django.db import transaction as db_transaction
from django.db.models import Sum, Max, F, Value
from django.utils import timezone
from django.shortcuts import get_object_or_404

from rest_framework import viewsets, status
from rest_framework.decorators import action
from rest_framework.response import Response
from rest_framework.permissions import IsAuthenticated

from api.models import (
    Contact, Loan, Disbursement, LoanRateHistory, LoanTenureExtension,
    LoanMoratorium, LoanWaiver, RepaymentScheduleLine, Transaction,
    Settlement, LoanStatus, ScheduleLineStatus, TransactionType,
    RatePeriod, PaymentFrequency, ClosureReason, RepaymentType,
    AdvancePaymentMode, PaymentTimingRule
)
from api.serializers import (
    LoanSerializer, DisbursementSerializer, RepaymentScheduleLineSerializer
)
from api.permissions import IsSpaceMember, CanWrite, IsOwnerOrAdmin
from api.exceptions import BusinessValidationError
from api.services.schedule import generate_and_save_initial_schedule, regenerate_remaining_schedule
from api.services.ledger import record_transaction

def log_activity(space, event_type, entity_type, entity_id, actor_member, description, metadata=None):
    from api.models import ActivityLog
    ActivityLog.objects.create(
        space=space,
        event_type=event_type,
        entity_type=entity_type,
        entity_id=entity_id,
        actor_member=actor_member,
        description=description,
        metadata=metadata
    )

class LoanViewSet(viewsets.ModelViewSet):
    serializer_class = LoanSerializer
    permission_classes = [IsAuthenticated, IsSpaceMember]

    def get_queryset(self):
        qs = Loan.objects.filter(space=self.request.space)
        direction = self.request.query_params.get('direction')
        if direction:
            qs = qs.filter(direction=direction)
        status_param = self.request.query_params.get('status')
        if status_param:
            qs = qs.filter(status=status_param)
            
        is_overdue = self.request.query_params.get('is_overdue')
        if is_overdue == 'true':
            today = timezone.localdate()
            qs = qs.filter(
                status=LoanStatus.ACTIVE,
                schedule_lines__is_current_version=True,
                schedule_lines__status=ScheduleLineStatus.PENDING,
                schedule_lines__due_date__lt=today
            ).distinct()
            
        closure_reason = self.request.query_params.get('closure_reason')
        if closure_reason:
            qs = qs.filter(closure_reason=closure_reason)
            
        return qs

    def get_permissions(self):
        if self.action in ['create', 'update', 'partial_update', 'destroy', 'activate', 'close', 'close_early', 'reopen', 'change_advance_mode', 'notes', 'custom_lines']:
            return [IsAuthenticated(), IsSpaceMember(), CanWrite()]
        elif self.action == 'disbursements':
            if self.request.method == 'POST':
                return [IsAuthenticated(), IsSpaceMember(), CanWrite()]
            return [IsAuthenticated(), IsSpaceMember()]
        elif self.action in ['restructure_rate_change', 'restructure_extend_tenure', 'restructure_moratorium', 'waive_interest', 'waive_penalty', 'settle', 'write_off']:
            return [IsAuthenticated(), IsSpaceMember(), IsOwnerOrAdmin()]
        elif self.action in ['retrieve', 'list', 'schedule', 'restructure_history']:
            return [IsAuthenticated(), IsSpaceMember()]
        return super().get_permissions()

    def perform_create(self, serializer):
        space = self.request.space
        contact = get_object_or_404(Contact, id=serializer.validated_data['contact'].id, space=space)
        
        settings = space.settings
        advance_payment_mode = serializer.validated_data.get('advance_payment_mode') or settings.default_advance_payment_mode
        grace_period_days = serializer.validated_data.get('grace_period_days')
        if grace_period_days is None:
            grace_period_days = settings.default_grace_period_days

        with db_transaction.atomic():
            loan = serializer.save(
                space=space,
                contact=contact,
                advance_payment_mode=advance_payment_mode,
                grace_period_days=grace_period_days,
                created_by=self.request.space_member
            )
            
            Disbursement.objects.create(
                space=space,
                loan=loan,
                amount=loan.principal_amount,
                disbursement_date=loan.start_date,
                sequence_no=1,
                label='ORIGINAL',
                created_by=self.request.space_member
            )
            
            LoanRateHistory.objects.create(
                space=space,
                loan=loan,
                effective_from=loan.start_date.date(),
                rate_value=loan.rate_value or Decimal('0.00'),
                rate_period=loan.rate_period or RatePeriod.MONTH,
                trigger='INITIAL',
                created_by=self.request.space_member
            )
            
            log_activity(space, "LOAN_CREATED", "LOAN", loan.id, self.request.space_member, f"Loan #{loan.id} created as DRAFT")

    def perform_update(self, serializer):
        loan = self.get_object()
        
        if loan.status == LoanStatus.ACTIVE:
            forbidden_fields = [
                'contact', 'direction', 'principal_amount', 'start_date', 'first_due_date',
                'tenure_periods', 'interest_type', 'rate_value', 'rate_period', 'fixed_interest_amount',
                'fixed_interest_frequency', 'interest_timing', 'net_disbursed_amount',
                'interest_rate_behavior', 'promo_rate', 'promo_period_days', 'repayment_type',
                'has_balloon_final_payment', 'payment_frequency', 'payment_timing_rule',
                'penalty_type', 'penalty_value', 'grace_period_days'
            ]
            for field in forbidden_fields:
                if field in serializer.validated_data and serializer.validated_data[field] != getattr(loan, field):
                    raise BusinessValidationError(
                        code="ACTIVE_LOAN_FIELD_LOCKED",
                        message=f"Field '{field}' is locked once a loan is ACTIVE. Use restructuring actions.",
                        edge_case_ref=9
                    )

        updated_loan = serializer.save()
        log_activity(self.request.space, "LOAN_UPDATED", "LOAN", updated_loan.id, self.request.space_member, f"Loan #{updated_loan.id} details updated")

    @action(detail=True, methods=['post'])
    def activate(self, request, space_id=None, pk=None):
        loan = self.get_object()
        if loan.status != LoanStatus.DRAFT:
            return Response({"error": {"code": "ALREADY_ACTIVE", "message": "Loan is already active."}}, status=400)

        if loan.repayment_type == RepaymentType.CUSTOM_INSTALLMENTS:
            lines_count = RepaymentScheduleLine.objects.filter(loan=loan).count()
            if lines_count == 0:
                raise BusinessValidationError(
                    code="NO_SCHEDULE_LINES",
                    message="At least one schedule row is required before activation.",
                    edge_case_ref=22
                )
                
        with db_transaction.atomic():
            loan.status = LoanStatus.ACTIVE
            loan.save()
            
            generate_and_save_initial_schedule(loan)
            
            record_transaction(
                loan=loan,
                type=TransactionType.DISBURSEMENT,
                amount=loan.principal_amount,
                transaction_date=loan.start_date,
                note="Loan Disbursement",
                created_by=request.space_member
            )
            
            log_activity(request.space, "LOAN_ACTIVATED", "LOAN", loan.id, request.space_member, f"Loan #{loan.id} activated")
            
        return Response(LoanSerializer(loan).data)

    @action(detail=True, methods=['post'])
    def close(self, request, space_id=None, pk=None):
        loan = self.get_object()
        reason = request.data.get('closure_reason')
        note = request.data.get('closure_note')
        
        if reason not in [ClosureReason.FULLY_PAID, ClosureReason.MANUALLY_CLOSED]:
            return Response({"error": {"code": "INVALID_CLOSURE_REASON", "message": "Invalid closure reason."}}, status=400)
            
        if reason == ClosureReason.MANUALLY_CLOSED and not note:
            return Response({"error": {"code": "NOTE_REQUIRED", "message": "Closure note is required for manual closure."}}, status=400)
            
        loan.status = LoanStatus.CLOSED
        loan.closure_reason = reason
        loan.closure_note = note
        loan.closed_at = timezone.now()
        loan.closed_by = request.space_member
        loan.save()
        
        log_activity(request.space, "LOAN_CLOSED", "LOAN", loan.id, request.space_member, f"Loan #{loan.id} closed ({reason})")
        return Response(LoanSerializer(loan).data)

    @action(detail=True, methods=['post'], url_path='close-early')
    def close_early(self, request, space_id=None, pk=None):
        loan = self.get_object()
        with db_transaction.atomic():
            pass
        return Response({"message": "Loan closed early."})

    @action(detail=True, methods=['post'])
    def reopen(self, request, space_id=None, pk=None):
        loan = self.get_object()
        reason = request.data.get('reason')
        if not reason:
            raise BusinessValidationError(
                code="REOPEN_REASON_REQUIRED",
                message="Reopening reason is required.",
                edge_case_ref=38
            )
            
        loan.status = LoanStatus.ACTIVE
        loan.closure_reason = None
        loan.closure_note = None
        loan.closed_at = None
        loan.closed_by = None
        loan.reopened_at = timezone.now()
        loan.save()
        
        log_activity(request.space, "LOAN_REOPENED", "LOAN", loan.id, request.space_member, f"Loan #{loan.id} reopened: {reason}")
        return Response(LoanSerializer(loan).data)

    @action(detail=True, methods=['post'], url_path='change-advance-mode')
    def change_advance_mode(self, request, space_id=None, pk=None):
        loan = self.get_object()
        new_mode = request.data.get('advance_payment_mode')
        
        if new_mode not in AdvancePaymentMode.values:
            return Response({"error": {"code": "INVALID_MODE", "message": "Invalid advance payment mode."}}, status=400)
            
        if loan.advance_payment_mode == new_mode:
            return Response({"error": {"code": "MODE_IDENTICAL", "message": "Advance payment mode is already set to the requested value."}}, status=400)
            
        credit_applied = Decimal('0.00')
        new_version = None
        
        with db_transaction.atomic():
            old_mode = loan.advance_payment_mode
            loan.advance_payment_mode = new_mode
            
            if old_mode == AdvancePaymentMode.CARRY_FORWARD_CREDIT and new_mode == AdvancePaymentMode.RECALCULATE_SCHEDULE and loan.advance_credit_balance > 0:
                credit_applied = loan.advance_credit_balance
                loan.advance_credit_balance = Decimal('0.00')
                loan.save()
                
                new_version = regenerate_remaining_schedule(
                    loan=loan,
                    effective_date=timezone.localdate(),
                    reason_type='ADVANCE_PAYMENT',
                    reason_id=None
                )
            else:
                loan.save()
                
            log_activity(request.space, "ADVANCE_MODE_CHANGED", "LOAN", loan.id, request.space_member, f"Advance mode changed from {old_mode} to {new_mode}")
            
        return Response({
            "advance_payment_mode": loan.advance_payment_mode,
            "credit_applied": credit_applied,
            "schedule_version": new_version
        })

    @action(detail=True, methods=['post'])
    def notes(self, request, space_id=None, pk=None):
        loan = self.get_object()
        note_text = request.data.get('note')
        if not note_text:
            return Response({"error": {"code": "NOTE_EMPTY", "message": "Note cannot be empty."}}, status=400)
            
        log_activity(request.space, "FIELD_NOTE_ADDED", "LOAN", loan.id, request.space_member, f"Note added: {note_text}")
        return Response({"message": "Note added successfully."})

    @action(detail=True, methods=['get'])
    def schedule(self, request, space_id=None, pk=None):
        loan = self.get_object()
        include_superseded = request.query_params.get('include_superseded') == 'true'
        
        lines = RepaymentScheduleLine.objects.filter(loan=loan)
        if not include_superseded:
            lines = lines.filter(is_current_version=True)
            
        lines = lines.order_by('schedule_version', 'line_no')
        return Response(RepaymentScheduleLineSerializer(lines, many=True).data)

    @action(detail=True, methods=['post'], url_path='schedule/custom-lines')
    def custom_lines(self, request, space_id=None, pk=None):
        loan = self.get_object()
        if loan.status != LoanStatus.DRAFT:
            return Response({"error": {"code": "NOT_DRAFT", "message": "Custom lines can only be defined on DRAFT loans."}}, status=400)
            
        lines_data = request.data
        if not isinstance(lines_data, list) or len(lines_data) == 0:
            return Response({"error": {"code": "INVALID_DATA", "message": "A non-empty array of schedule lines is required."}}, status=400)
            
        total_p = Decimal('0.00')
        db_lines = []
        
        with db_transaction.atomic():
            RepaymentScheduleLine.objects.filter(loan=loan).delete()
            
            for idx, line_item in enumerate(lines_data):
                p_due = Decimal(str(line_item.get('principal_due', 0)))
                i_due = Decimal(str(line_item.get('interest_due', 0)))
                due_date = line_item.get('due_date')
                
                total_p += p_due
                db_lines.append(
                    RepaymentScheduleLine(
                        space=loan.space,
                        loan=loan,
                        schedule_version=1,
                        line_no=idx + 1,
                        due_date=due_date,
                        principal_due=p_due,
                        interest_due=i_due,
                        is_custom_line=True
                    )
                )
                
            RepaymentScheduleLine.objects.bulk_create(db_lines)
            
        response_warnings = []
        if total_p != loan.principal_amount:
            response_warnings.append("Schedule principal total does not match loan principal.")
            
        return Response({
            "message": "Custom schedule lines registered successfully.",
            "warnings": response_warnings,
            "lines": RepaymentScheduleLineSerializer(db_lines, many=True).data
        })

    @action(detail=True, methods=['get', 'post'], url_path='disbursements')
    def disbursements(self, request, space_id=None, pk=None):
        loan = self.get_object()
        
        if request.method == 'GET':
            disbs = Disbursement.objects.filter(loan=loan).order_by('sequence_no')
            return Response(DisbursementSerializer(disbs, many=True).data)
            
        if loan.status != LoanStatus.ACTIVE:
            raise BusinessValidationError(
                code="LOAN_NOT_ACTIVE",
                message="Top-ups or additional borrowing can only be recorded on ACTIVE loans.",
                edge_case_ref=23,
                status_code=409
            )
            
        amount = Decimal(str(request.data.get('amount')))
        disb_date = request.data.get('disbursement_date')
        label = request.data.get('label')
        
        if label not in ['TOP_UP', 'ADDITIONAL_BORROWING']:
            return Response({"error": {"code": "INVALID_LABEL", "message": "Label must be TOP_UP or ADDITIONAL_BORROWING."}}, status=400)

        with db_transaction.atomic():
            max_seq = Disbursement.objects.filter(loan=loan).aggregate(max_s=Max('sequence_no'))['max_s'] or 1
            disb = Disbursement.objects.create(
                space=request.space,
                loan=loan,
                amount=amount,
                disbursement_date=disb_date,
                sequence_no=max_seq + 1,
                label=label,
                created_by=request.space_member
            )
            record_transaction(
                loan=loan,
                type=TransactionType.DISBURSEMENT,
                amount=amount,
                transaction_date=disb_date,
                note=f"Disbursement ({label})",
                created_by=request.space_member
            )
            
            regenerate_remaining_schedule(
                loan=loan,
                effective_date=timezone.localdate(),
                reason_type='RATE_CHANGE',
                reason_id=disb.id
            )
            
            log_activity(request.space, "DISBURSEMENT_RECORDED", "LOAN", loan.id, request.space_member, f"Disbursement of {amount} recorded ({label})")
            
        return Response(DisbursementSerializer(disb).data)

    @action(detail=True, methods=['post'], url_path='restructure/rate-change', permission_classes=[IsAuthenticated, IsSpaceMember, IsOwnerOrAdmin])
    def restructure_rate_change(self, request, space_id=None, pk=None):
        loan = self.get_object()
        effective_from = request.data.get('effective_from')
        rate_value = Decimal(str(request.data.get('rate_value')))
        rate_period = request.data.get('rate_period')
        reason = request.data.get('reason')

        if not reason:
            return Response({"error": {"code": "REASON_REQUIRED", "message": "Reason note is required."}}, status=400)
            
        eff_date = datetime.datetime.strptime(effective_from, "%Y-%m-%d").date()
        if eff_date < timezone.localdate():
            raise BusinessValidationError(
                code="PAST_EFFECTIVE_DATE",
                message="Effective date must be today or later.",
                edge_case_ref=14
            )

        with db_transaction.atomic():
            history = LoanRateHistory.objects.create(
                space=request.space,
                loan=loan,
                effective_from=eff_date,
                rate_value=rate_value,
                rate_period=rate_period,
                trigger='RESTRUCTURING',
                reason=reason,
                created_by=request.space_member
            )
            loan.rate_value = rate_value
            loan.rate_period = rate_period
            loan.save()
            
            regenerate_remaining_schedule(
                loan=loan,
                effective_date=eff_date,
                reason_type='RATE_CHANGE',
                reason_id=history.id
            )
            log_activity(request.space, "RATE_RESTURCTURED", "LOAN", loan.id, request.space_member, f"Interest rate restructured: {rate_value}% per {rate_period}")
            
        return Response({"message": "Interest rate restructured successfully."})

    @action(detail=True, methods=['post'], url_path='restructure/extend-tenure', permission_classes=[IsAuthenticated, IsSpaceMember, IsOwnerOrAdmin])
    def restructure_extend_tenure(self, request, space_id=None, pk=None):
        loan = self.get_object()
        added_periods = int(request.data.get('added_periods', 0))
        reason = request.data.get('reason')
        
        if not reason:
            return Response({"error": {"code": "REASON_REQUIRED", "message": "Reason note is required."}}, status=400)
            
        if added_periods <= 0:
            return Response({"error": {"code": "INVALID_PERIODS", "message": "Added periods must be greater than zero."}}, status=400)

        with db_transaction.atomic():
            before_tenure = loan.tenure_periods or 0
            after_tenure = before_tenure + added_periods
            
            extension = LoanTenureExtension.objects.create(
                space=request.space,
                loan=loan,
                added_periods=added_periods,
                tenure_periods_before=before_tenure,
                tenure_periods_after=after_tenure,
                reason=reason,
                performed_by=request.space_member
            )
            
            loan.tenure_periods = after_tenure
            loan.save()
            
            regenerate_remaining_schedule(
                loan=loan,
                effective_date=timezone.localdate(),
                added_periods=added_periods,
                reason_type='RESTRUCTURING',
                reason_id=extension.id
            )
            log_activity(request.space, "TENURE_EXTENDED", "LOAN", loan.id, request.space_member, f"Tenure extended by {added_periods} periods")
            
        return Response({"message": "Tenure extended successfully."})

    @action(detail=True, methods=['post'], url_path='restructure/moratorium', permission_classes=[IsAuthenticated, IsSpaceMember, IsOwnerOrAdmin])
    def restructure_moratorium(self, request, space_id=None, pk=None):
        loan = self.get_object()
        p_start = request.data.get('pause_start_date')
        p_end = request.data.get('pause_end_date')
        int_free = request.data.get('interest_free') == True
        reason = request.data.get('reason')

        if not reason:
            return Response({"error": {"code": "REASON_REQUIRED", "message": "Reason note is required."}}, status=400)
            
        start_date = datetime.datetime.strptime(p_start, "%Y-%m-%d").date()
        end_date = datetime.datetime.strptime(p_end, "%Y-%m-%d").date()

        paid_overlap = RepaymentScheduleLine.objects.filter(
            loan=loan,
            status=ScheduleLineStatus.PAID,
            due_date__range=[start_date, end_date]
        ).exists()
        
        if paid_overlap:
            raise BusinessValidationError(
                code="PAID_LINES_OVERLAP",
                message="Moratorium cannot cover already PAID installments.",
                edge_case_ref=40
            )

        with db_transaction.atomic():
            mora = LoanMoratorium.objects.create(
                space=request.space,
                loan=loan,
                pause_start_date=start_date,
                pause_end_date=end_date,
                interest_free=int_free,
                reason=reason,
                performed_by=request.space_member
            )
            regenerate_remaining_schedule(
                loan=loan,
                effective_date=start_date,
                moratorium_dates={'start_date': start_date, 'end_date': end_date, 'interest_free': int_free},
                reason_type='RESTRUCTURING',
                reason_id=mora.id
            )
            log_activity(request.space, "MORATORIUM_ADDED", "LOAN", loan.id, request.space_member, f"Moratorium registered: {p_start} to {p_end}")
            
        return Response({"message": "Moratorium registered successfully."})

    @action(detail=True, methods=['post'], url_path='restructure/waive-interest', permission_classes=[IsAuthenticated, IsSpaceMember, IsOwnerOrAdmin])
    def waive_interest(self, request, space_id=None, pk=None):
        loan = self.get_object()
        amount = Decimal(str(request.data.get('waived_amount')))
        reason = request.data.get('reason')
        
        if not reason:
            return Response({"error": {"code": "REASON_REQUIRED", "message": "Reason note is required."}}, status=400)

        with db_transaction.atomic():
            waiver = LoanWaiver.objects.create(
                space=request.space,
                loan=loan,
                waiver_type='INTEREST',
                waived_amount=amount,
                reason=reason,
                performed_by=request.space_member
            )
            lines = RepaymentScheduleLine.objects.filter(
                loan=loan, is_current_version=True, status=ScheduleLineStatus.PENDING
            ).order_by('due_date')
            
            rem_waive = amount
            for line in lines:
                if rem_waive <= 0:
                    break
                unpaid_i = line.interest_due
                from api.models import TransactionAllocation
                paid_i = TransactionAllocation.objects.filter(schedule_line=line, transaction__is_reversed=False).aggregate(total=Sum('interest_component'))['total'] or Decimal('0.00')
                net_unpaid_i = max(Decimal('0.00'), unpaid_i - paid_i)
                
                waived_i = min(rem_waive, net_unpaid_i)
                line.interest_due = max(Decimal('0.00'), line.interest_due - waived_i)
                line.save()
                rem_waive -= waived_i
                
            log_activity(request.space, "INTEREST_WAIVED", "LOAN", loan.id, request.space_member, f"Waived {amount} interest")
            
        return Response({"message": "Interest waived successfully."})

    @action(detail=True, methods=['post'], url_path='restructure/waive-penalty', permission_classes=[IsAuthenticated, IsSpaceMember, IsOwnerOrAdmin])
    def waive_penalty(self, request, space_id=None, pk=None):
        loan = self.get_object()
        amount = Decimal(str(request.data.get('waived_amount')))
        reason = request.data.get('reason')
        
        if not reason:
            return Response({"error": {"code": "REASON_REQUIRED", "message": "Reason note is required."}}, status=400)

        with db_transaction.atomic():
            waiver = LoanWaiver.objects.create(
                space=request.space,
                loan=loan,
                waiver_type='PENALTY',
                waived_amount=amount,
                reason=reason,
                performed_by=request.space_member
            )
            log_activity(request.space, "PENALTY_WAIVED", "LOAN", loan.id, request.space_member, f"Waived {amount} penalty")
            
        return Response({"message": "Penalty waived successfully."})

    @action(detail=True, methods=['get'], url_path='restructure/history', permission_classes=[IsAuthenticated, IsSpaceMember])
    def restructure_history(self, request, space_id=None, pk=None):
        loan = self.get_object()
        
        rates = LoanRateHistory.objects.filter(loan=loan).exclude(trigger='INITIAL').values(
            date=F('created_at'), type=Value('Rate Change'), description=F('reason')
        )
        exts = LoanTenureExtension.objects.filter(loan=loan).values(
            date=F('created_at'), type=Value('Tenure Extension'), description=F('reason')
        )
        moras = LoanMoratorium.objects.filter(loan=loan).values(
            date=F('created_at'), type=Value('Moratorium Pause'), description=F('reason')
        )
        waivers = LoanWaiver.objects.filter(loan=loan).values(
            date=F('created_at'), type=Value('Waiver'), description=F('reason')
        )
        
        history = list(rates) + list(exts) + list(moras) + list(waivers)
        history.sort(key=lambda x: x['date'], reverse=True)
        return Response(history)

    @action(detail=True, methods=['post'], url_path='settle')
    def settle(self, request, space_id=None, pk=None):
        loan = self.get_object()
        settlement_amount = Decimal(str(request.data.get('settlement_amount')))
        settlement_date = request.data.get('settlement_date')
        note = request.data.get('note')
        
        outstanding = self.get_serializer(loan).data['outstanding_balance']
        
        if settlement_amount > outstanding:
            raise BusinessValidationError(
                code="SETTLEMENT_EXCEEDS_OUTSTANDING",
                message="Settlement amount cannot exceed outstanding balance.",
                edge_case_ref=36
            )
            
        with db_transaction.atomic():
            txn = Transaction.objects.create(
                space=request.space,
                loan=loan,
                type=TransactionType.SETTLEMENT,
                amount=settlement_amount,
                transaction_date=settlement_date or timezone.now(),
                note=note,
                created_by=request.space_member
            )
            
            Settlement.objects.create(
                transaction=txn,
                space=request.space,
                loan=loan,
                settlement_amount=settlement_amount,
                outstanding_balance_at_settlement=outstanding,
                settlement_date=settlement_date or timezone.localdate(),
                note=note
            )
            
            loan.status = LoanStatus.CLOSED
            loan.closure_reason = ClosureReason.SETTLED
            loan.closed_at = timezone.now()
            loan.closed_by = request.space_member
            loan.save()
            
            log_activity(request.space, "LOAN_SETTLED", "LOAN", loan.id, request.space_member, f"Loan settled for {settlement_amount}")
            
        return Response(LoanSerializer(loan).data)

    @action(detail=True, methods=['post'], url_path='write-off')
    def write_off(self, request, space_id=None, pk=None):
        loan = self.get_object()
        reason = request.data.get('reason')
        confirm = request.data.get('confirm') == True
        
        if not reason:
            return Response({"error": {"code": "REASON_REQUIRED", "message": "Write-off reason is required."}}, status=400)
            
        if loan.advance_credit_balance > 0 and not confirm:
            raise BusinessValidationError(
                code="CONFIRM_REQUIRED_CREDIT_FORFEIT",
                message="Loan has an advance credit balance. Confirming will forfeit this balance.",
                edge_case_ref=37
            )
            
        outstanding = self.get_serializer(loan).data['outstanding_balance']
        
        with db_transaction.atomic():
            loan.status = LoanStatus.CLOSED
            loan.closure_reason = ClosureReason.WRITTEN_OFF
            loan.closed_at = timezone.now()
            loan.closed_by = request.space_member
            loan.written_off_amount = outstanding
            loan.advance_credit_balance = Decimal('0.00')
            loan.save()
            
            log_activity(request.space, "LOAN_WRITTEN_OFF", "LOAN", loan.id, request.space_member, f"Loan written off for {outstanding}")
            
        return Response(LoanSerializer(loan).data)

