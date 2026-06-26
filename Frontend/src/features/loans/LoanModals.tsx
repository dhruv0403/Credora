import React, { useState, useEffect } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';

import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Checkbox } from '@/components/ui/checkbox';
import { Switch } from '@/components/ui/switch';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { ServerMessage } from '@/components/shared/ServerMessage';
import { formatCurrency } from '@/lib/formatCurrency';

import type { Loan } from '@/api/loans';
import {
  closeLoan,
  closeEarlyLoan,
  changeAdvanceMode,
  recordDisbursement,
  getSchedule,
  restructureRateChange,
  restructureExtendTenure,
  restructureMoratorium,
  restructureWaiveInterest,
  restructureWaivePenalty,
} from '@/api/loans';
import {
  createTransaction,
  settleLoan,
  writeOffLoan,
} from '@/api/transactions';
import { transactionSchema } from '@/schemas/transaction.schema';

// -------------------------------------------------------------
// 1. RECORD PAYMENT MODAL
// -------------------------------------------------------------
interface RecordPaymentModalProps {
  isOpen: boolean;
  onClose: () => void;
  spaceId: number;
  loan: Loan;
  onSuccess: () => void;
}

export const RecordPaymentModal: React.FC<RecordPaymentModalProps> = ({
  isOpen,
  onClose,
  spaceId,
  loan,
  onSuccess,
}) => {
  const queryClient = useQueryClient();
  const [preciseTime, setPreciseTime] = useState(false);
  const [autoAllocate, setAutoAllocate] = useState(true);
  const [serverError, setServerError] = useState<any>(null);
  
  // Transition state for prompt screen
  const [promptData, setPromptData] = useState<{ transactionId: number } | null>(null);

  const defaultType = loan.direction === 'GIVEN' ? 'PAYMENT_RECEIVED' : 'PAYMENT_MADE';

  const {
    register,
    handleSubmit,
    setValue,
    watch,
    reset,
    formState: { errors },
  } = useForm<any>({
    resolver: zodResolver(transactionSchema) as any,
    defaultValues: {
      type: defaultType,
      amount: 0,
      transaction_date: new Date().toISOString().substring(0, 10),
      collection_method: 'UPI',
      note: '',
      adjustment_reason: '',
      allocations: [],
    },
  });

  const transactionType = watch('type');

  // Fetch schedule lines if auto-allocate is off
  const { data: schedule } = useQuery({
    queryKey: ['loan-schedule-lines', spaceId, loan.id],
    queryFn: () => getSchedule(spaceId, loan.id, false),
    enabled: isOpen && !autoAllocate,
  });

  useEffect(() => {
    if (isOpen) {
      reset({
        type: defaultType,
        amount: 0,
        transaction_date: new Date().toISOString().substring(0, preciseTime ? 16 : 10),
        collection_method: 'UPI',
        note: '',
        adjustment_reason: '',
        allocations: [],
      });
      setPromptData(null);
      setServerError(null);
    }
  }, [isOpen, loan, reset, defaultType, preciseTime]);

  const submitMutation = useMutation({
    mutationFn: (data: any) => {
      // Map manual allocations if manual override is active
      let manualAllocations = null;
      if (!autoAllocate && schedule) {
        manualAllocations = schedule
          .filter((line) => line.status !== 'PAID')
          .map((line) => {
            const inputVal = (document.getElementById(`alloc-p-${line.id}`) as HTMLInputElement)?.value;
            const interestVal = (document.getElementById(`alloc-i-${line.id}`) as HTMLInputElement)?.value;
            return {
              schedule_line_id: line.id,
              principal_component: parseFloat(inputVal || '0'),
              interest_component: parseFloat(interestVal || '0'),
            };
          })
          .filter((alloc) => alloc.principal_component > 0 || alloc.interest_component > 0)
          .map((alloc) => ({
            schedule_line_id: alloc.schedule_line_id,
            principal_component: alloc.principal_component.toString(),
            interest_component: alloc.interest_component.toString(),
          }));
      }

      return createTransaction(spaceId, {
        loan_id: loan.id,
        type: data.type,
        amount: Number(data.amount),
        transaction_date: preciseTime
          ? new Date(data.transaction_date).toISOString()
          : data.transaction_date + 'T12:00:00Z',
        collection_method: data.collection_method,
        note: data.note,
        adjustment_reason: data.adjustment_reason,
        allocations: manualAllocations,
      });
    },
    onSuccess: (res) => {
      if (res.prompt === 'Close as Fully Paid?') {
        setPromptData({ transactionId: res.transaction.id });
      } else {
        toast.success('Transaction recorded successfully!');
        queryClient.invalidateQueries({ queryKey: ['loan', spaceId, loan.id] });
        queryClient.invalidateQueries({ queryKey: ['loan-transactions', spaceId, loan.id] });
        queryClient.invalidateQueries({ queryKey: ['schedule', spaceId, loan.id] });
        onSuccess();
        onClose();
      }
    },
    onError: (err: any) => {
      setServerError(err);
    },
  });

  const closeFullyPaidMutation = useMutation({
    mutationFn: () => closeLoan(spaceId, loan.id, 'FULLY_PAID'),
    onSuccess: () => {
      toast.success('Loan closed as Fully Paid!');
      queryClient.invalidateQueries({ queryKey: ['loan', spaceId, loan.id] });
      queryClient.invalidateQueries({ queryKey: ['schedule', spaceId, loan.id] });
      onSuccess();
      onClose();
    },
    onError: (err: any) => {
      toast.error(err.message || 'Failed to close loan');
    },
  });

  const handleDateToggle = () => {
    const nextPrecise = !preciseTime;
    setPreciseTime(nextPrecise);
    const dateStr = watch('transaction_date');
    if (nextPrecise) {
      // Add local hour/minute
      setValue('transaction_date', `${dateStr}T12:00`);
    } else {
      // Keep date only
      setValue('transaction_date', dateStr.substring(0, 10));
    }
  };

  const onSubmit = (data: any) => {
    setServerError(null);
    const futureDate = new Date(data.transaction_date) > new Date();
    if (futureDate) {
      if (!window.confirm('This transaction date is in the future. Confirm?')) {
        return;
      }
    }
    submitMutation.mutate(data);
  };

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="max-w-md bg-paper border border-slate/15 shadow-md">
        <DialogHeader>
          <DialogTitle className="font-serif text-lg text-ink font-bold">
            {promptData ? 'Suggest Loan Closure' : 'Record Transaction'}
          </DialogTitle>
          <DialogDescription className="text-xs text-slate">
            {promptData
              ? 'Confirm early closure of this loan'
              : 'Log payments or balance adjustments into this loan ledger'}
          </DialogDescription>
        </DialogHeader>

        {promptData ? (
          <div className="space-y-4 py-2">
            <div className="p-3 bg-receivable/5 border border-receivable/20 rounded-md text-xs text-ink leading-relaxed">
              Payment transaction recorded. Outstanding balance has been paid down to <strong>₹0.00</strong>.
              Would you like to close this loan contract as <strong>Fully Paid</strong> now?
            </div>
            <DialogFooter className="flex gap-2">
              <Button
                type="button"
                variant="outline"
                onClick={() => {
                  toast.success('Transaction saved. Loan remains Active.');
                  queryClient.invalidateQueries({ queryKey: ['loan', spaceId, loan.id] });
                  queryClient.invalidateQueries({ queryKey: ['loan-transactions', spaceId, loan.id] });
                  onSuccess();
                  onClose();
                }}
                className="text-xs border-slate/30 text-ink"
              >
                Not now
              </Button>
              <Button
                type="button"
                onClick={() => closeFullyPaidMutation.mutate()}
                disabled={closeFullyPaidMutation.isPending}
                className="bg-brass hover:bg-brass/90 text-paper text-xs font-semibold"
              >
                {closeFullyPaidMutation.isPending ? 'Closing...' : 'Close as Fully Paid'}
              </Button>
            </DialogFooter>
          </div>
        ) : (
          <form onSubmit={handleSubmit(onSubmit)} className="space-y-4 py-2">
            <ServerMessage error={serverError} />

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1">
                <Label className="text-xs font-semibold text-ink">Type</Label>
                <Select
                  value={transactionType}
                  onValueChange={(val: any) => setValue('type', val)}
                >
                  <SelectTrigger className="bg-paper border-slate/30 text-ink text-xs h-9">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent className="bg-paper border-slate/15 text-ink text-xs">
                    <SelectItem value="PAYMENT_RECEIVED">Payment Received</SelectItem>
                    <SelectItem value="PAYMENT_MADE">Payment Made</SelectItem>
                    <SelectItem value="DISBURSEMENT">Disbursement</SelectItem>
                    <SelectItem value="MANUAL_ADJUSTMENT">Manual Adjustment</SelectItem>
                    <SelectItem value="INTEREST_ACCRUED">Interest Accrued</SelectItem>
                    <SelectItem value="PENALTY_ACCRUED">Penalty Accrued</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-1">
                <Label htmlFor="amount" className="text-xs font-semibold text-ink">Amount</Label>
                <Input
                  id="amount"
                  type="number"
                  step="0.01"
                  className="bg-paper border-slate/30 text-ink text-xs h-9"
                  {...register('amount', { valueAsNumber: true })}
                />
                {errors.amount && (
                  <p className="text-[10px] text-payable font-medium">{errors.amount.message as string}</p>
                )}
              </div>
            </div>

            <div className="grid grid-cols-1 gap-2">
              <div className="flex justify-between items-center">
                <Label htmlFor="transaction_date" className="text-xs font-semibold text-ink">Transaction Date</Label>
                <button
                  type="button"
                  onClick={handleDateToggle}
                  className="text-[10px] text-brass hover:underline font-bold"
                >
                  {preciseTime ? 'Disable precise time' : 'Enable precise time'}
                </button>
              </div>
              <Input
                id="transaction_date"
                type={preciseTime ? 'datetime-local' : 'date'}
                className="bg-paper border-slate/30 text-ink text-xs h-9"
                {...register('transaction_date')}
              />
            </div>

            <div className="space-y-1">
              <Label className="text-xs font-semibold text-ink">Collection Method</Label>
              <Select
                defaultValue="UPI"
                onValueChange={(val: any) => setValue('collection_method', val)}
              >
                <SelectTrigger className="bg-paper border-slate/30 text-ink text-xs h-9">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent className="bg-paper border-slate/15 text-ink text-xs">
                  <SelectItem value="UPI">UPI</SelectItem>
                  <SelectItem value="CASH">Cash</SelectItem>
                  <SelectItem value="BANK_TRANSFER">Bank Transfer</SelectItem>
                  <SelectItem value="ACH">ACH Auto-debit</SelectItem>
                  <SelectItem value="OTHER">Other</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {transactionType === 'MANUAL_ADJUSTMENT' && (
              <div className="space-y-1">
                <Label htmlFor="adjustment_reason" className="text-xs font-semibold text-ink">Adjustment Reason</Label>
                <Input
                  id="adjustment_reason"
                  placeholder="e.g. Clearing bank error..."
                  className="bg-paper border-slate/30 text-ink text-xs h-9"
                  {...register('adjustment_reason')}
                />
                {errors.adjustment_reason && (
                  <p className="text-[10px] text-payable font-medium">{errors.adjustment_reason.message as string}</p>
                )}
              </div>
            )}

            <div className="space-y-1">
              <Label htmlFor="note" className="text-xs font-semibold text-ink">Private Notes</Label>
              <Textarea
                id="note"
                placeholder="Audit logs..."
                className="bg-paper border-slate/30 text-ink text-xs min-h-[60px]"
                {...register('note')}
              />
            </div>

            {/* Manual Allocations Split */}
            {transactionType.includes('PAYMENT_') && (
              <div className="border border-slate/15 rounded-md p-3 space-y-2">
                <div className="flex justify-between items-center">
                  <div>
                    <span className="text-xs font-bold text-ink">Auto-allocate funds</span>
                    <p className="text-[9px] text-slate mt-0.5">Let the ledger distribute payments across due dates automatically</p>
                  </div>
                  <Switch
                    checked={autoAllocate}
                    onCheckedChange={(checked) => setAutoAllocate(checked)}
                  />
                </div>

                {!autoAllocate && schedule && (
                  <div className="pt-2 border-t border-slate/10 max-h-[140px] overflow-y-auto space-y-2 pr-1 no-scrollbar">
                    {schedule
                      .filter((line) => line.status !== 'PAID')
                      .map((line, idx) => (
                        <div key={idx} className="text-[10px] space-y-1 bg-slate/5 p-2 rounded">
                          <div className="flex justify-between font-bold text-ink">
                            <span>Due: {new Date(line.due_date).toLocaleDateString()}</span>
                            <span>Outstanding: {formatCurrency(Number(line.principal_due) - Number(line.principal_paid) + Number(line.interest_due) - Number(line.interest_paid), 'INR')}</span>
                          </div>
                          <div className="grid grid-cols-2 gap-2">
                            <div>
                              <Label className="text-[8px] text-slate font-bold">Principal Split</Label>
                              <Input
                                id={`alloc-p-${line.id}`}
                                type="number"
                                step="0.01"
                                defaultValue="0"
                                className="h-6 text-[9px] bg-paper"
                              />
                            </div>
                            <div>
                              <Label className="text-[8px] text-slate font-bold">Interest Split</Label>
                              <Input
                                id={`alloc-i-${line.id}`}
                                type="number"
                                step="0.01"
                                defaultValue="0"
                                className="h-6 text-[9px] bg-paper"
                              />
                            </div>
                          </div>
                        </div>
                      ))}
                  </div>
                )}
              </div>
            )}

            <DialogFooter>
              <Button
                type="button"
                variant="outline"
                onClick={onClose}
                className="text-xs border-slate/30 text-ink hover:bg-slate/5"
              >
                Cancel
              </Button>
              <Button
                type="submit"
                disabled={submitMutation.isPending}
                className="bg-brass hover:bg-brass/90 text-paper text-xs font-semibold"
              >
                {submitMutation.isPending ? 'Saving...' : 'Record Transaction'}
              </Button>
            </DialogFooter>
          </form>
        )}
      </DialogContent>
    </Dialog>
  );
};

// -------------------------------------------------------------
// 2. SETTLE MODAL
// -------------------------------------------------------------
interface SettleModalProps {
  isOpen: boolean;
  onClose: () => void;
  spaceId: number;
  loan: Loan;
  onSuccess: () => void;
}

export const SettleModal: React.FC<SettleModalProps> = ({
  isOpen,
  onClose,
  spaceId,
  loan,
  onSuccess,
}) => {
  const queryClient = useQueryClient();
  const [amount, setAmount] = useState(0);
  const [date, setDate] = useState(new Date().toISOString().substring(0, 10));
  const [note, setNote] = useState('');
  const [serverError, setServerError] = useState<any>(null);

  const outstanding = parseFloat(loan.outstanding_balance);
  const isSubmitDisabled = amount <= 0 || amount > outstanding;

  useEffect(() => {
    if (isOpen) {
      setAmount(0);
      setDate(new Date().toISOString().substring(0, 10));
      setNote('');
      setServerError(null);
    }
  }, [isOpen]);

  const mutation = useMutation({
    mutationFn: () =>
      settleLoan(spaceId, loan.id, {
        settlement_amount: amount,
        settlement_date: date,
        note,
      }),
    onSuccess: () => {
      toast.success('Loan settled and closed!');
      queryClient.invalidateQueries({ queryKey: ['loan', spaceId, loan.id] });
      queryClient.invalidateQueries({ queryKey: ['loan-transactions', spaceId, loan.id] });
      queryClient.invalidateQueries({ queryKey: ['schedule', spaceId, loan.id] });
      onSuccess();
      onClose();
    },
    onError: (err: any) => {
      setServerError(err);
    },
  });

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="max-w-sm bg-paper border border-slate/15 shadow-md">
        <DialogHeader>
          <DialogTitle className="font-serif text-lg text-ink font-bold">Settle Loan Contract</DialogTitle>
          <DialogDescription className="text-xs text-slate">
            Write off outstanding balance with a final negotiated settlement payment.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-2">
          <ServerMessage error={serverError} />

          <div className="p-3 bg-slate/5 border border-slate/10 rounded-md text-xs">
            <div className="flex justify-between">
              <span className="text-slate font-medium">Outstanding Balance:</span>
              <span className="font-bold text-ink font-figures">{formatCurrency(outstanding, 'INR')}</span>
            </div>
          </div>

          <div className="space-y-1">
            <Label htmlFor="settlement_amount" className="text-xs font-semibold text-ink">Settlement Paid Amount</Label>
            <Input
              id="settlement_amount"
              type="number"
              step="0.01"
              value={amount || ''}
              onChange={(e) => setAmount(parseFloat(e.target.value) || 0)}
              className="bg-paper border-slate/30 text-ink text-xs h-9"
            />
            {amount > outstanding && (
              <p className="text-[10px] text-payable font-medium">Settlement amount cannot exceed outstanding balance.</p>
            )}
          </div>

          <div className="space-y-1">
            <Label htmlFor="settlement_date" className="text-xs font-semibold text-ink">Settlement Date</Label>
            <Input
              id="settlement_date"
              type="date"
              value={date}
              onChange={(e) => setDate(e.target.value)}
              className="bg-paper border-slate/30 text-ink text-xs h-9"
            />
          </div>

          <div className="space-y-1">
            <Label htmlFor="settle_note" className="text-xs font-semibold text-ink">Public Remarks / Notes</Label>
            <Textarea
              id="settle_note"
              placeholder="e.g. One-time compromise settlement agreed..."
              value={note}
              onChange={(e) => setNote(e.target.value)}
              className="bg-paper border-slate/30 text-ink text-xs min-h-[60px]"
            />
          </div>
        </div>

        <DialogFooter>
          <Button
            type="button"
            variant="outline"
            onClick={onClose}
            className="text-xs border-slate/30 text-ink hover:bg-slate/5"
          >
            Cancel
          </Button>
          <Button
            type="button"
            onClick={() => mutation.mutate()}
            disabled={isSubmitDisabled || mutation.isPending}
            className="bg-brass hover:bg-brass/90 text-paper text-xs font-semibold"
          >
            {mutation.isPending ? 'Settling...' : 'Settle & Close'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

// -------------------------------------------------------------
// 3. FULL EARLY CLOSURE MODAL
// -------------------------------------------------------------
interface FullClosureModalProps {
  isOpen: boolean;
  onClose: () => void;
  spaceId: number;
  loan: Loan;
  onSuccess: () => void;
}

export const FullClosureModal: React.FC<FullClosureModalProps> = ({
  isOpen,
  onClose,
  spaceId,
  loan,
  onSuccess,
}) => {
  const queryClient = useQueryClient();
  const [date, setDate] = useState(new Date().toISOString().substring(0, 10));
  const [serverError, setServerError] = useState<any>(null);

  useEffect(() => {
    if (isOpen) {
      setDate(new Date().toISOString().substring(0, 10));
      setServerError(null);
    }
  }, [isOpen]);

  const mutation = useMutation({
    mutationFn: () => closeEarlyLoan(spaceId, loan.id, date),
    onSuccess: () => {
      toast.success('Loan early closed successfully!');
      queryClient.invalidateQueries({ queryKey: ['loan', spaceId, loan.id] });
      queryClient.invalidateQueries({ queryKey: ['schedule', spaceId, loan.id] });
      onSuccess();
      onClose();
    },
    onError: (err: any) => {
      setServerError(err);
    },
  });

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="max-w-sm bg-paper border border-slate/15 shadow-md">
        <DialogHeader>
          <DialogTitle className="font-serif text-lg text-ink font-bold">Close Early (Full Closure)</DialogTitle>
          <DialogDescription className="text-xs text-slate">
            Close contract ahead of schedule. Interest calculations stop at the closure date.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-2">
          <ServerMessage error={serverError} />

          <div className="p-3 bg-brass/5 border border-brass/15 rounded-md text-xs text-ink/80 leading-relaxed">
            <strong>Important Notice:</strong> Interest will stop accruing immediately. Previously paid upfront interest is non-refundable.
          </div>

          <div className="space-y-1">
            <Label htmlFor="closure_date" className="text-xs font-semibold text-ink">Closure Effective Date</Label>
            <Input
              id="closure_date"
              type="date"
              value={date}
              onChange={(e) => setDate(e.target.value)}
              className="bg-paper border-slate/30 text-ink text-xs h-9"
            />
          </div>
        </div>

        <DialogFooter>
          <Button
            type="button"
            variant="outline"
            onClick={onClose}
            className="text-xs border-slate/30 text-ink hover:bg-slate/5"
          >
            Cancel
          </Button>
          <Button
            type="button"
            onClick={() => mutation.mutate()}
            disabled={mutation.isPending}
            className="bg-brass hover:bg-brass/90 text-paper text-xs font-semibold"
          >
            {mutation.isPending ? 'Closing...' : 'Close early'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

// -------------------------------------------------------------
// 4. WRITE OFF MODAL
// -------------------------------------------------------------
interface WriteOffModalProps {
  isOpen: boolean;
  onClose: () => void;
  spaceId: number;
  loan: Loan;
  onSuccess: () => void;
}

export const WriteOffModal: React.FC<WriteOffModalProps> = ({
  isOpen,
  onClose,
  spaceId,
  loan,
  onSuccess,
}) => {
  const queryClient = useQueryClient();
  const [reason, setReason] = useState('');
  const [confirm, setConfirm] = useState(false);
  const [serverError, setServerError] = useState<any>(null);

  const hasCredit = loan.advance_credit_balance && parseFloat(loan.advance_credit_balance) > 0;
  const isSubmitDisabled = !reason.trim() || !confirm;

  useEffect(() => {
    if (isOpen) {
      setReason('');
      setConfirm(false);
      setServerError(null);
    }
  }, [isOpen]);

  const mutation = useMutation({
    mutationFn: () => writeOffLoan(spaceId, loan.id, { reason, confirm }),
    onSuccess: () => {
      toast.success('Loan balance written off as bad debt.');
      queryClient.invalidateQueries({ queryKey: ['loan', spaceId, loan.id] });
      queryClient.invalidateQueries({ queryKey: ['loan-transactions', spaceId, loan.id] });
      queryClient.invalidateQueries({ queryKey: ['schedule', spaceId, loan.id] });
      onSuccess();
      onClose();
    },
    onError: (err: any) => {
      setServerError(err);
    },
  });

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="max-w-sm bg-paper border border-slate/15 shadow-md">
        <DialogHeader>
          <DialogTitle className="font-serif text-lg text-ink font-bold">Write Off Bad Debt</DialogTitle>
          <DialogDescription className="text-xs text-slate">
            Mark the remaining outstanding balance as uncollectable and close the contract.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-2">
          <ServerMessage error={serverError} />

          {hasCredit && (
            <div className="p-3 bg-payable/10 border border-payable/20 rounded-md text-xs text-payable leading-relaxed">
              <strong>Forfeiture Alert:</strong> Writing off this contract will forfeit the advance credit balance of <strong>{formatCurrency(loan.advance_credit_balance, 'INR')}</strong> currently recorded on this ledger.
            </div>
          )}

          <div className="space-y-1">
            <Label htmlFor="write_off_reason" className="text-xs font-semibold text-ink">Reason / Audit Trail Explanation</Label>
            <Textarea
              id="write_off_reason"
              placeholder="e.g. Borrower declared bankruptcy..."
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              className="bg-paper border-slate/30 text-ink text-xs min-h-[70px]"
            />
          </div>

          <div className="flex gap-2 items-start border border-slate/10 p-2.5 rounded bg-slate/5">
            <Checkbox
              id="write_off_confirm"
              checked={confirm}
              onCheckedChange={(checked) => setConfirm(!!checked)}
              className="mt-0.5 border-slate/30 text-brass focus:ring-brass"
            />
            <Label htmlFor="write_off_confirm" className="text-[11px] text-ink/80 leading-snug cursor-pointer select-none">
              I understand that this action is permanent, completely clears outstanding liabilities, and generates a bad debt transaction write-off record.
            </Label>
          </div>
        </div>

        <DialogFooter>
          <Button
            type="button"
            variant="outline"
            onClick={onClose}
            className="text-xs border-slate/30 text-ink hover:bg-slate/5"
          >
            Cancel
          </Button>
          <Button
            type="button"
            onClick={() => mutation.mutate()}
            disabled={isSubmitDisabled || mutation.isPending}
            className="bg-payable hover:bg-payable/90 text-paper text-xs font-semibold"
          >
            {mutation.isPending ? 'Writing off...' : 'Write Off Loan'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

// -------------------------------------------------------------
// 5. MANUALLY CLOSE MODAL
// -------------------------------------------------------------
interface ManuallyCloseModalProps {
  isOpen: boolean;
  onClose: () => void;
  spaceId: number;
  loan: Loan;
  onSuccess: () => void;
}

export const ManuallyCloseModal: React.FC<ManuallyCloseModalProps> = ({
  isOpen,
  onClose,
  spaceId,
  loan,
  onSuccess,
}) => {
  const queryClient = useQueryClient();
  const [note, setNote] = useState('');
  const [serverError, setServerError] = useState<any>(null);

  const isSubmitDisabled = !note.trim();

  useEffect(() => {
    if (isOpen) {
      setNote('');
      setServerError(null);
    }
  }, [isOpen]);

  const mutation = useMutation({
    mutationFn: () => closeLoan(spaceId, loan.id, 'MANUALLY_CLOSED', note),
    onSuccess: () => {
      toast.success('Loan manually closed successfully!');
      queryClient.invalidateQueries({ queryKey: ['loan', spaceId, loan.id] });
      queryClient.invalidateQueries({ queryKey: ['schedule', spaceId, loan.id] });
      onSuccess();
      onClose();
    },
    onError: (err: any) => {
      setServerError(err);
    },
  });

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="max-w-sm bg-paper border border-slate/15 shadow-md">
        <DialogHeader>
          <DialogTitle className="font-serif text-lg text-ink font-bold">Force Manual Closure</DialogTitle>
          <DialogDescription className="text-xs text-slate">
            Force close this contract. Use only for ledger cleanup or extraordinary adjustments.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-2">
          <ServerMessage error={serverError} />

          <div className="space-y-1">
            <Label htmlFor="manual_note" className="text-xs font-semibold text-ink">Closure Remark / Notes</Label>
            <Textarea
              id="manual_note"
              placeholder="e.g. Legal resolution closed contract obligations..."
              value={note}
              onChange={(e) => setNote(e.target.value)}
              className="bg-paper border-slate/30 text-ink text-xs min-h-[80px]"
            />
          </div>
        </div>

        <DialogFooter>
          <Button
            type="button"
            variant="outline"
            onClick={onClose}
            className="text-xs border-slate/30 text-ink hover:bg-slate/5"
          >
            Cancel
          </Button>
          <Button
            type="button"
            onClick={() => mutation.mutate()}
            disabled={isSubmitDisabled || mutation.isPending}
            className="bg-brass hover:bg-brass/90 text-paper text-xs font-semibold"
          >
            {mutation.isPending ? 'Closing...' : 'Close Contract'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

// -------------------------------------------------------------
// 6. SWITCH ADVANCE MODE MODAL
// -------------------------------------------------------------
interface SwitchAdvanceModeModalProps {
  isOpen: boolean;
  onClose: () => void;
  spaceId: number;
  loan: Loan;
  onSuccess: () => void;
}

export const SwitchAdvanceModeModal: React.FC<SwitchAdvanceModeModalProps> = ({
  isOpen,
  onClose,
  spaceId,
  loan,
  onSuccess,
}) => {
  const queryClient = useQueryClient();
  const [serverError, setServerError] = useState<any>(null);

  const currentMode = loan.advance_payment_mode;
  const targetMode = currentMode === 'CARRY_FORWARD_CREDIT' ? 'RECALCULATE_SCHEDULE' : 'CARRY_FORWARD_CREDIT';
  
  const creditBalance = parseFloat(loan.advance_credit_balance || '0');
  const outstanding = parseFloat(loan.outstanding_balance || '0');

  const willRecalculateApply = currentMode === 'CARRY_FORWARD_CREDIT' && creditBalance > 0;
  const mightZeroInstallments = willRecalculateApply && outstanding <= creditBalance;

  const mutation = useMutation({
    mutationFn: () => changeAdvanceMode(spaceId, loan.id, targetMode),
    onSuccess: (res) => {
      toast.success(`Advance mode switched to ${res.advance_payment_mode}!`);
      if (res.credit_applied && parseFloat(res.credit_applied) > 0) {
        toast.info(`Applied ${formatCurrency(res.credit_applied, 'INR')} credit balance to outstanding principal.`);
      }
      queryClient.invalidateQueries({ queryKey: ['loan', spaceId, loan.id] });
      queryClient.invalidateQueries({ queryKey: ['schedule', spaceId, loan.id] });
      onSuccess();
      onClose();
    },
    onError: (err: any) => {
      setServerError(err);
    },
  });

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="max-w-sm bg-paper border border-slate/15 shadow-md">
        <DialogHeader>
          <DialogTitle className="font-serif text-lg text-ink font-bold">Switch Advance Payment Mode</DialogTitle>
          <DialogDescription className="text-xs text-slate">
            Change how payments exceeding current dues are treated.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-2 text-xs leading-relaxed text-ink/80">
          <ServerMessage error={serverError} />

          <div className="space-y-1.5 p-3 bg-slate/5 border border-slate/10 rounded-md">
            <div>
              <span className="text-[10px] text-slate block font-semibold uppercase">Current Mode</span>
              <span className="font-bold text-ink">{currentMode || 'NOT CONFIGURED'}</span>
            </div>
            <div className="pt-1.5 border-t border-slate/10">
              <span className="text-[10px] text-slate block font-semibold uppercase">Target Mode</span>
              <span className="font-bold text-brass">{targetMode}</span>
            </div>
          </div>

          <div className="space-y-2">
            {targetMode === 'CARRY_FORWARD_CREDIT' ? (
              <p>
                Switching to <strong>Carry Forward Credit</strong> keeps overpayments in a separate virtual credit vault, automatically settling future dues when they open up.
              </p>
            ) : (
              <p>
                Switching to <strong>Recalculate Schedule</strong> immediately offsets remaining principal with overpayments, shortening remaining installments or reducing EMI amounts.
              </p>
            )}

            {willRecalculateApply && (
              <div className="p-3 bg-receivable/5 border border-receivable/20 rounded-md text-ink text-xs space-y-1">
                <p>
                  ⚡ <strong>{formatCurrency(creditBalance, 'INR')}</strong> in virtual credit will be applied directly to outstanding principal and your schedule will regenerate.
                </p>
                {mightZeroInstallments && (
                  <p className="text-payable font-semibold mt-1">
                    ⚠️ Notice: This application completely satisfies remaining obligations and may close this contract as Fully Paid.
                  </p>
                )}
              </div>
            )}
          </div>
        </div>

        <DialogFooter>
          <Button
            type="button"
            variant="outline"
            onClick={onClose}
            className="text-xs border-slate/30 text-ink hover:bg-slate/5"
          >
            Cancel
          </Button>
          <Button
            type="button"
            onClick={() => mutation.mutate()}
            disabled={mutation.isPending}
            className="bg-brass hover:bg-brass/90 text-paper text-xs font-semibold"
          >
            {mutation.isPending ? 'Confirming...' : 'Switch Mode'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

// -------------------------------------------------------------
// 7. RESTRUCTURE MODAL
// -------------------------------------------------------------
interface RestructureModalProps {
  isOpen: boolean;
  onClose: () => void;
  spaceId: number;
  loan: Loan;
  mode: 'rate_change' | 'extend_tenure' | 'moratorium' | 'waive_interest' | 'waive_penalty';
  onSuccess: () => void;
}

export const RestructureModal: React.FC<RestructureModalProps> = ({
  isOpen,
  onClose,
  spaceId,
  loan,
  mode,
  onSuccess,
}) => {
  const queryClient = useQueryClient();
  const [serverError, setServerError] = useState<any>(null);

  // Form states
  const [effectiveFrom, setEffectiveFrom] = useState(new Date().toISOString().substring(0, 10));
  const [rateValue, setRateValue] = useState(0);
  const [ratePeriod, setRatePeriod] = useState('MONTH');
  const [addedPeriods, setAddedPeriods] = useState(1);
  const [pauseStart, setPauseStart] = useState(new Date().toISOString().substring(0, 10));
  const [pauseEnd, setPauseEnd] = useState(new Date().toISOString().substring(0, 10));
  const [interestFree, setInterestFree] = useState(false);
  const [waiveAmount, setWaiveAmount] = useState(0);
  const [reason, setReason] = useState('');

  useEffect(() => {
    if (isOpen) {
      setEffectiveFrom(new Date().toISOString().substring(0, 10));
      setRateValue(parseFloat(loan.rate_value || '0'));
      setRatePeriod(loan.rate_period || 'MONTH');
      setAddedPeriods(1);
      setPauseStart(new Date().toISOString().substring(0, 10));
      setPauseEnd(new Date().toISOString().substring(0, 10));
      setInterestFree(false);
      setWaiveAmount(0);
      setReason('');
      setServerError(null);
    }
  }, [isOpen, loan]);

  const mutation = useMutation({
    mutationFn: () => {
      const baseReason = reason.trim() || 'Moratorium Restructuring';
      switch (mode) {
        case 'rate_change':
          return restructureRateChange(spaceId, loan.id, {
            effective_from: effectiveFrom,
            rate_value: rateValue,
            rate_period: ratePeriod,
            reason: baseReason,
          });
        case 'extend_tenure':
          return restructureExtendTenure(spaceId, loan.id, {
            added_periods: addedPeriods,
            reason: baseReason,
          });
        case 'moratorium':
          return restructureMoratorium(spaceId, loan.id, {
            pause_start_date: pauseStart,
            pause_end_date: pauseEnd,
            interest_free: interestFree,
            reason: baseReason,
          });
        case 'waive_interest':
          return restructureWaiveInterest(spaceId, loan.id, {
            waived_amount: waiveAmount,
            reason: baseReason,
          });
        case 'waive_penalty':
          return restructureWaivePenalty(spaceId, loan.id, {
            waived_amount: waiveAmount,
            reason: baseReason,
          });
      }
    },
    onSuccess: () => {
      toast.success('Moratorium / restructuring completed!');
      queryClient.invalidateQueries({ queryKey: ['loan', spaceId, loan.id] });
      queryClient.invalidateQueries({ queryKey: ['schedule', spaceId, loan.id] });
      queryClient.invalidateQueries({ queryKey: ['restructuring', spaceId, loan.id] });
      onSuccess();
      onClose();
    },
    onError: (err: any) => {
      setServerError(err);
    },
  });

  const getTitle = () => {
    switch (mode) {
      case 'rate_change':
        return 'Restructure Interest Rate';
      case 'extend_tenure':
        return 'Extend Contract Tenure';
      case 'moratorium':
        return 'Apply Moratorium (Pause Payments)';
      case 'waive_interest':
        return 'Waive Outstanding Interest';
      case 'waive_penalty':
        return 'Waive Accrued Penalty';
    }
  };

  const isSubmitDisabled = !reason.trim() || (mode === 'waive_interest' || mode === 'waive_penalty' ? waiveAmount <= 0 : false);

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="max-w-sm bg-paper border border-slate/15 shadow-md">
        <DialogHeader>
          <DialogTitle className="font-serif text-lg text-ink font-bold">{getTitle()}</DialogTitle>
          <DialogDescription className="text-xs text-slate">
            Amends contract parameters and recalculates remaining schedules.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-2">
          <ServerMessage error={serverError} />

          {/* Rate Change fields */}
          {mode === 'rate_change' && (
            <div className="space-y-3">
              <div className="space-y-1">
                <Label htmlFor="effective_from" className="text-xs font-semibold text-ink">Effective From Date</Label>
                <Input
                  id="effective_from"
                  type="date"
                  min={new Date().toISOString().substring(0, 10)}
                  value={effectiveFrom}
                  onChange={(e) => setEffectiveFrom(e.target.value)}
                  className="bg-paper border-slate/30 text-ink text-xs h-9"
                />
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div className="space-y-1">
                  <Label htmlFor="new_rate" className="text-xs font-semibold text-ink">New Rate (%)</Label>
                  <Input
                    id="new_rate"
                    type="number"
                    step="0.01"
                    value={rateValue || ''}
                    onChange={(e) => setRateValue(parseFloat(e.target.value) || 0)}
                    className="bg-paper border-slate/30 text-ink text-xs h-9"
                  />
                </div>
                <div className="space-y-1">
                  <Label className="text-xs font-semibold text-ink">Period</Label>
                  <Select value={ratePeriod} onValueChange={setRatePeriod}>
                    <SelectTrigger className="bg-paper border-slate/30 text-ink text-xs h-9">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent className="bg-paper border-slate/15 text-ink text-xs">
                      <SelectItem value="DAY">Daily</SelectItem>
                      <SelectItem value="WEEK">Weekly</SelectItem>
                      <SelectItem value="MONTH">Monthly</SelectItem>
                      <SelectItem value="YEAR">Yearly</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
            </div>
          )}

          {/* Extend Tenure fields */}
          {mode === 'extend_tenure' && (
            <div className="space-y-1">
              <Label htmlFor="added_periods" className="text-xs font-semibold text-ink">Extend Tenure by (Periods Count)</Label>
              <Input
                id="added_periods"
                type="number"
                min="1"
                value={addedPeriods}
                onChange={(e) => setAddedPeriods(parseInt(e.target.value) || 1)}
                className="bg-paper border-slate/30 text-ink text-xs h-9"
              />
            </div>
          )}

          {/* Moratorium fields */}
          {mode === 'moratorium' && (
            <div className="space-y-3">
              <div className="grid grid-cols-2 gap-2">
                <div className="space-y-1">
                  <Label htmlFor="pause_start" className="text-xs font-semibold text-ink">Pause Start Date</Label>
                  <Input
                    id="pause_start"
                    type="date"
                    value={pauseStart}
                    onChange={(e) => setPauseStart(e.target.value)}
                    className="bg-paper border-slate/30 text-ink text-xs h-9"
                  />
                </div>
                <div className="space-y-1">
                  <Label htmlFor="pause_end" className="text-xs font-semibold text-ink">Pause End Date</Label>
                  <Input
                    id="pause_end"
                    type="date"
                    value={pauseEnd}
                    onChange={(e) => setPauseEnd(e.target.value)}
                    className="bg-paper border-slate/30 text-ink text-xs h-9"
                  />
                </div>
              </div>
              <div className="flex gap-2 items-center p-2 border border-slate/15 rounded bg-slate/5">
                <Checkbox
                  id="interest_free"
                  checked={interestFree}
                  onCheckedChange={(checked) => setInterestFree(!!checked)}
                  className="border-slate/30 text-brass focus:ring-brass"
                />
                <Label htmlFor="interest_free" className="text-[11px] text-ink font-semibold cursor-pointer">
                  Interest-free moratorium (skip interest accrual)
                </Label>
              </div>
            </div>
          )}

          {/* Waives fields */}
          {(mode === 'waive_interest' || mode === 'waive_penalty') && (
            <div className="space-y-1">
              <Label htmlFor="waive_amount" className="text-xs font-semibold text-ink">Waive Amount</Label>
              <Input
                id="waive_amount"
                type="number"
                step="0.01"
                placeholder="0.00"
                value={waiveAmount || ''}
                onChange={(e) => setWaiveAmount(parseFloat(e.target.value) || 0)}
                className="bg-paper border-slate/30 text-ink text-xs h-9"
              />
            </div>
          )}

          <div className="space-y-1">
            <Label htmlFor="restructure_reason" className="text-xs font-semibold text-ink">Reason / Justification</Label>
            <Input
              id="restructure_reason"
              placeholder="Audit log context..."
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              className="bg-paper border-slate/30 text-ink text-xs h-9"
            />
          </div>

          <p className="text-[9px] text-slate font-bold uppercase tracking-wider mt-1 text-center">
            This action is logged and visible in the loan's history.
          </p>
        </div>

        <DialogFooter>
          <Button
            type="button"
            variant="outline"
            onClick={onClose}
            className="text-xs border-slate/30 text-ink hover:bg-slate/5"
          >
            Cancel
          </Button>
          <Button
            type="button"
            onClick={() => mutation.mutate()}
            disabled={isSubmitDisabled || mutation.isPending}
            className="bg-brass hover:bg-brass/90 text-paper text-xs font-semibold"
          >
            {mutation.isPending ? 'Applying...' : 'Apply Adjustment'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

// -------------------------------------------------------------
// 8. RECORD DISBURSEMENT MODAL
// -------------------------------------------------------------
interface RecordDisbursementModalProps {
  isOpen: boolean;
  onClose: () => void;
  spaceId: number;
  loan: Loan;
  onSuccess: () => void;
}

export const RecordDisbursementModal: React.FC<RecordDisbursementModalProps> = ({
  isOpen,
  onClose,
  spaceId,
  loan,
  onSuccess,
}) => {
  const queryClient = useQueryClient();
  const [amount, setAmount] = useState(0);
  const [date, setDate] = useState(new Date().toISOString().substring(0, 10));
  const [label, setLabel] = useState<'TOP_UP' | 'ADDITIONAL_BORROWING'>('TOP_UP');
  const [serverError, setServerError] = useState<any>(null);

  const isSubmitDisabled = amount <= 0;

  useEffect(() => {
    if (isOpen) {
      setAmount(0);
      setDate(new Date().toISOString().substring(0, 10));
      setLabel('TOP_UP');
      setServerError(null);
    }
  }, [isOpen]);

  const mutation = useMutation({
    mutationFn: () =>
      recordDisbursement(spaceId, loan.id, {
        amount: amount.toString(),
        disbursement_date: date,
        label,
      }),
    onSuccess: () => {
      toast.success('Disbursement recorded successfully!');
      queryClient.invalidateQueries({ queryKey: ['loan', spaceId, loan.id] });
      queryClient.invalidateQueries({ queryKey: ['disbursements', spaceId, loan.id] });
      queryClient.invalidateQueries({ queryKey: ['schedule', spaceId, loan.id] });
      onSuccess();
      onClose();
    },
    onError: (err: any) => {
      setServerError(err);
    },
  });

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="max-w-sm bg-paper border border-slate/15 shadow-md">
        <DialogHeader>
          <DialogTitle className="font-serif text-lg text-ink font-bold">Record Disbursement Tranche</DialogTitle>
          <DialogDescription className="text-xs text-slate">
            Log subsequent pay-outs or top-up borrowing tranches under this contract.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-2">
          <ServerMessage error={serverError} />

          <div className="space-y-1">
            <Label htmlFor="disb_amount" className="text-xs font-semibold text-ink">Disbursement Amount</Label>
            <Input
              id="disb_amount"
              type="number"
              step="0.01"
              value={amount || ''}
              onChange={(e) => setAmount(parseFloat(e.target.value) || 0)}
              className="bg-paper border-slate/30 text-ink text-xs h-9"
            />
          </div>

          <div className="space-y-1">
            <Label htmlFor="disb_date" className="text-xs font-semibold text-ink">Disbursement Date</Label>
            <Input
              id="disb_date"
              type="date"
              value={date}
              onChange={(e) => setDate(e.target.value)}
              className="bg-paper border-slate/30 text-ink text-xs h-9"
            />
          </div>

          <div className="space-y-1">
            <Label className="text-xs font-semibold text-ink">Tranche Tag / Label</Label>
            <Select
              value={label}
              onValueChange={(val: any) => setLabel(val)}
            >
              <SelectTrigger className="bg-paper border-slate/30 text-ink text-xs h-9">
                <SelectValue />
              </SelectTrigger>
              <SelectContent className="bg-paper border-slate/15 text-ink text-xs">
                <SelectItem value="TOP_UP">Top Up tranche</SelectItem>
                <SelectItem value="ADDITIONAL_BORROWING">Additional Borrowing</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>

        <DialogFooter>
          <Button
            type="button"
            variant="outline"
            onClick={onClose}
            className="text-xs border-slate/30 text-ink hover:bg-slate/5"
          >
            Cancel
          </Button>
          <Button
            type="button"
            onClick={() => mutation.mutate()}
            disabled={isSubmitDisabled || mutation.isPending}
            className="bg-brass hover:bg-brass/90 text-paper text-xs font-semibold"
          >
            {mutation.isPending ? 'Saving...' : 'Record Disbursement'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};
