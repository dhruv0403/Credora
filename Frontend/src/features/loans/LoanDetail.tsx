import React, { useState } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { getLoan, activateLoan, getSchedule, listDisbursements, getRestructuringHistory } from '@/api/loans';
import { listLoanTransactions } from '@/api/transactions';
import { useSpace } from '@/app/SpaceContext';
import { StatusBadge } from '@/components/shared/StatusBadge';
import { DirectionBadge } from '@/components/shared/DirectionBadge';
import { EmptyState } from '@/components/shared/EmptyState';
import { formatCurrency } from '@/lib/formatCurrency';
import { formatDate } from '@/lib/formatDate';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { AlertCircle, Plus, ArrowDownUp, History, ChevronDown } from 'lucide-react';
import { toast } from 'sonner';
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuSub,
  DropdownMenuSubTrigger,
  DropdownMenuSubContent,
  DropdownMenuPortal,
} from '@/components/ui/dropdown-menu';
import {
  RecordPaymentModal,
  SettleModal,
  FullClosureModal,
  WriteOffModal,
  ManuallyCloseModal,
  SwitchAdvanceModeModal,
  RestructureModal,
  RecordDisbursementModal,
} from './LoanModals';

export const LoanDetail: React.FC = () => {
  const { spaceId, loanId } = useParams<{ spaceId: string; loanId: string }>();
  const parsedSpaceId = Number(spaceId);
  const parsedLoanId = Number(loanId);
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { currentRole, currentSpace } = useSpace();

  const [showSuperseded, setShowSuperseded] = useState(false);
  const [activeModal, setActiveModal] = useState<
    | null
    | 'payment'
    | 'settle'
    | 'close_early'
    | 'write_off'
    | 'manual_close'
    | 'switch_advance'
    | 'disbursement'
    | 'restructure_rate'
    | 'restructure_tenure'
    | 'restructure_moratorium'
    | 'restructure_waive_interest'
    | 'restructure_waive_penalty'
  >(null);

  // Fetch Loan Data
  const { data: loan, isLoading: isLoadingLoan, error: loanError } = useQuery({
    queryKey: ['loan', parsedSpaceId, parsedLoanId],
    queryFn: () => getLoan(parsedSpaceId, parsedLoanId),
    enabled: !isNaN(parsedSpaceId) && !isNaN(parsedLoanId),
  });

  // Fetch Schedule
  const { data: schedule, isLoading: isLoadingSchedule } = useQuery({
    queryKey: ['schedule', parsedSpaceId, parsedLoanId, showSuperseded],
    queryFn: () => getSchedule(parsedSpaceId, parsedLoanId, showSuperseded),
    enabled: !!loan && loan.status !== 'DRAFT',
  });

  // Fetch Transactions
  const { data: transactions } = useQuery({
    queryKey: ['loan-transactions', parsedSpaceId, parsedLoanId],
    queryFn: () => listLoanTransactions(parsedSpaceId, parsedLoanId),
    enabled: !!loan && loan.status !== 'DRAFT',
  });

  // Fetch Disbursements
  const { data: disbursements } = useQuery({
    queryKey: ['disbursements', parsedSpaceId, parsedLoanId],
    queryFn: () => listDisbursements(parsedSpaceId, parsedLoanId),
    enabled: !!loan,
  });

  // Fetch Restructuring
  const { data: restructureHistory } = useQuery({
    queryKey: ['restructuring', parsedSpaceId, parsedLoanId],
    queryFn: () => getRestructuringHistory(parsedSpaceId, parsedLoanId),
    enabled: !!loan && (currentRole === 'OWNER' || currentRole === 'ADMIN' || currentRole === 'VIEWER'),
  });

  // Activate Mutation
  const activateMutation = useMutation({
    mutationFn: () => activateLoan(parsedSpaceId, parsedLoanId),
    onSuccess: (res) => {
      toast.success('Loan activated successfully!');
      if (res.warnings && res.warnings.length > 0) {
        res.warnings.forEach((w) => toast.warning(w));
      }
      queryClient.invalidateQueries({ queryKey: ['loan', parsedSpaceId, parsedLoanId] });
    },
    onError: (err: any) => {
      toast.error(err.message || 'Failed to activate loan');
    },
  });

  if (isLoadingLoan) {
    return <div className="py-24 text-center text-xs font-semibold text-slate animate-pulse">Loading loan details...</div>;
  }

  if (loanError || !loan) {
    return (
      <EmptyState
        icon={<AlertCircle className="w-8 h-8 text-payable" />}
        title="Loan not found"
        description="This loan contract does not exist or has been deleted from this space ledger."
        action={{
          label: 'Back to Loans',
          onClick: () => navigate(`/spaces/${spaceId}/loans`),
        }}
      />
    );
  }

  const currencyCode = currentSpace?.currency_code || 'INR';

  return (
    <div className="space-y-6 animate-fadeIn">
      {/* Back button */}
      <Link
        to={`/spaces/${spaceId}/loans`}
        className="text-[11px] font-bold text-slate hover:text-ink flex items-center gap-1 w-fit"
      >
        <ArrowDownUp className="w-3.5 h-3.5 rotate-90" />
        Back to Loan Ledger
      </Link>

      {/* Draft Activation Banner */}
      {loan.status === 'DRAFT' && (
        <div className="bg-brass/5 border border-brass/25 rounded-md p-4 flex justify-between items-center flex-wrap gap-4">
          <div>
            <p className="text-xs font-bold text-ink">This loan is in DRAFT state</p>
            <p className="text-[10px] text-slate mt-0.5">Amortization schedules and disbursements will be generated upon activation.</p>
          </div>
          <div className="flex gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => navigate(`/spaces/${spaceId}/loans/new`)} // Stubs edit
              className="text-xs font-semibold border-slate/30 text-ink hover:bg-slate/5"
            >
              Edit Draft
            </Button>
            <Button
              size="sm"
              onClick={() => activateMutation.mutate()}
              disabled={activateMutation.isPending}
              className="bg-brass hover:bg-brass/95 text-paper text-xs font-semibold"
            >
              {activateMutation.isPending ? 'Activating...' : 'Activate Loan'}
            </Button>
          </div>
        </div>
      )}

      {/* Header Cards Summary */}
      <div className="border border-slate/15 rounded-md bg-paper p-6 space-y-4 shadow-sm">
        <div className="flex justify-between items-start flex-wrap gap-4">
          <div>
            <h2 className="font-serif text-2xl font-bold text-ink flex items-center gap-2.5">
              {loan.contact_name || `Contact #${loan.contact_id}`}
            </h2>
            <div className="flex gap-1.5 mt-2">
              <DirectionBadge direction={loan.direction} />
              <StatusBadge status={loan.status === 'CLOSED' && loan.closure_reason === 'WRITTEN_OFF' ? 'WRITTEN_OFF' : loan.status} isOverdue={loan.is_overdue} />
            </div>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-3 gap-6 text-right">
            <div>
              <p className="text-[10px] text-slate font-semibold uppercase tracking-wider">Principal</p>
              <p className="font-bold text-base text-ink font-figures mt-0.5">
                {formatCurrency(loan.principal_amount, currencyCode)}
              </p>
            </div>
            <div>
              <p className="text-[10px] text-slate font-semibold uppercase tracking-wider">Outstanding</p>
              <p className="font-bold text-base text-ink font-figures mt-0.5">
                {formatCurrency(loan.outstanding_balance, currencyCode)}
              </p>
            </div>
            {loan.advance_credit_balance && parseFloat(loan.advance_credit_balance) > 0 && (
              <div className="hidden sm:block">
                <p className="text-[10px] text-slate font-semibold uppercase tracking-wider">Advance Credit</p>
                <p className="font-bold text-base text-receivable font-figures mt-0.5">
                  {formatCurrency(loan.advance_credit_balance, currencyCode)}
                </p>
              </div>
            )}
          </div>
        </div>

        {loan.status === 'ACTIVE' && (
          <div className="flex gap-2 pt-4 border-t border-slate/10 justify-end">
            <Button
              size="sm"
              onClick={() => setActiveModal('payment')}
              className="bg-brass hover:bg-brass/90 text-paper text-xs font-semibold"
            >
              <Plus className="w-3.5 h-3.5 mr-1" />
              Record Payment
            </Button>
            
            {(currentRole === 'OWNER' || currentRole === 'ADMIN') && (
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button
                    variant="outline"
                    size="sm"
                    className="text-xs font-semibold border-slate/30 text-ink hover:bg-slate/5"
                  >
                    Actions
                    <ChevronDown className="w-3 h-3 ml-1.5" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent className="w-56 bg-paper border border-slate/15 shadow-md">
                  <DropdownMenuItem onClick={() => setActiveModal('disbursement')}>
                    Record Disbursement
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={() => setActiveModal('switch_advance')}>
                    Switch Advance Mode
                  </DropdownMenuItem>
                  
                  <DropdownMenuSeparator className="bg-slate/10" />
                  
                  {/* Close Loan Submenu */}
                  <DropdownMenuSub>
                    <DropdownMenuSubTrigger>Close Loan</DropdownMenuSubTrigger>
                    <DropdownMenuPortal>
                      <DropdownMenuSubContent className="bg-paper border border-slate/15 shadow-md">
                        <DropdownMenuItem onClick={() => setActiveModal('close_early')}>
                          Full Closure (Early Paid)
                        </DropdownMenuItem>
                        <DropdownMenuItem onClick={() => setActiveModal('settle')}>
                          Settle Contract
                        </DropdownMenuItem>
                        <DropdownMenuItem onClick={() => setActiveModal('write_off')}>
                          Write Off Bad Debt
                        </DropdownMenuItem>
                        <DropdownMenuItem onClick={() => setActiveModal('manual_close')}>
                          Force Manual Close
                        </DropdownMenuItem>
                      </DropdownMenuSubContent>
                    </DropdownMenuPortal>
                  </DropdownMenuSub>

                  {/* Restructure Submenu */}
                  <DropdownMenuSub>
                    <DropdownMenuSubTrigger>Restructure</DropdownMenuSubTrigger>
                    <DropdownMenuPortal>
                      <DropdownMenuSubContent className="bg-paper border border-slate/15 shadow-md">
                        <DropdownMenuItem onClick={() => setActiveModal('restructure_rate')}>
                          Change Interest Rate
                        </DropdownMenuItem>
                        <DropdownMenuItem onClick={() => setActiveModal('restructure_tenure')}>
                          Extend Tenure periods
                        </DropdownMenuItem>
                        <DropdownMenuItem onClick={() => setActiveModal('restructure_moratorium')}>
                          Moratorium (Pause Payments)
                        </DropdownMenuItem>
                        <DropdownMenuItem onClick={() => setActiveModal('restructure_waive_interest')}>
                          Waive Interest
                        </DropdownMenuItem>
                        <DropdownMenuItem onClick={() => setActiveModal('restructure_waive_penalty')}>
                          Waive Penalty
                        </DropdownMenuItem>
                      </DropdownMenuSubContent>
                    </DropdownMenuPortal>
                  </DropdownMenuSub>
                </DropdownMenuContent>
              </DropdownMenu>
            )}
          </div>
        )}
      </div>

      {/* Main tab panel layout */}
      <Tabs defaultValue="overview" className="space-y-4">
        <TabsList className="bg-slate/5 border border-slate/15 p-0.5 h-auto text-slate overflow-x-auto max-w-full flex justify-start rounded-md no-scrollbar">
          <TabsTrigger value="overview" className="text-xs font-semibold py-1.5 px-3 rounded-sm data-[state=active]:bg-paper data-[state=active]:text-brass">Overview</TabsTrigger>
          {loan.status !== 'DRAFT' && (
            <>
              <TabsTrigger value="schedule" className="text-xs font-semibold py-1.5 px-3 rounded-sm data-[state=active]:bg-paper data-[state=active]:text-brass">Schedule</TabsTrigger>
              <TabsTrigger value="transactions" className="text-xs font-semibold py-1.5 px-3 rounded-sm data-[state=active]:bg-paper data-[state=active]:text-brass">Transactions</TabsTrigger>
              <TabsTrigger value="disbursements" className="text-xs font-semibold py-1.5 px-3 rounded-sm data-[state=active]:bg-paper data-[state=active]:text-brass">Disbursements</TabsTrigger>
              {currentRole !== 'FIELDMAN' && (
                <TabsTrigger value="restructuring" className="text-xs font-semibold py-1.5 px-3 rounded-sm data-[state=active]:bg-paper data-[state=active]:text-brass">Restructuring</TabsTrigger>
              )}
            </>
          )}
        </TabsList>

        {/* Overview content */}
        <TabsContent value="overview">
          <Card className="bg-paper border-slate/15 shadow-none rounded-md">
            <CardContent className="p-6">
              <h3 className="font-bold text-xs uppercase tracking-wider border-b border-slate/10 pb-2 mb-4 text-ink">Contract Specifications</h3>
              <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-6 text-xs text-ink leading-relaxed">
                <div>
                  <span className="text-slate font-medium block">Interest Method</span>
                  <span className="font-bold">{loan.interest_type}</span>
                </div>
                <div>
                  <span className="text-slate font-medium block">Repayment Model</span>
                  <span className="font-bold">{loan.repayment_type}</span>
                </div>
                <div>
                  <span className="text-slate font-medium block">Interest Rate</span>
                  <span className="font-bold">
                    {loan.rate_value ? `${loan.rate_value}% per ${loan.rate_period?.toLowerCase()}` : '0.00%'}
                  </span>
                </div>
                <div>
                  <span className="text-slate font-medium block">Timing Rule</span>
                  <span className="font-bold">{loan.payment_timing_rule}</span>
                </div>
                <div>
                  <span className="text-slate font-medium block">Penalty Model</span>
                  <span className="font-bold">
                    {loan.penalty_type} {loan.penalty_value && `(${loan.penalty_value})`}
                  </span>
                </div>
                <div>
                  <span className="text-slate font-medium block">Grace Period</span>
                  <span className="font-bold">{loan.grace_period_days} Days</span>
                </div>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Schedule content */}
        {loan.status !== 'DRAFT' && (
          <TabsContent value="schedule">
            <Card className="bg-paper border-slate/15 shadow-none rounded-md">
              <CardContent className="p-6 space-y-4">
                <div className="flex justify-between items-center">
                  <h3 className="font-bold text-xs uppercase tracking-wider text-ink">Repayment Installments</h3>
                  <div className="flex items-center gap-2">
                    <span className="text-[10px] text-slate font-semibold">Show Superseded</span>
                    <input
                      type="checkbox"
                      checked={showSuperseded}
                      onChange={(e) => setShowSuperseded(e.target.checked)}
                      className="rounded border-slate/30 text-brass focus:ring-brass"
                    />
                  </div>
                </div>

                {isLoadingSchedule ? (
                  <div className="py-6 text-center animate-pulse text-xs text-slate">Loading schedule...</div>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="w-full text-left text-xs divide-y divide-slate/15">
                      <thead>
                        <tr className="text-slate uppercase tracking-wider text-[10px] font-semibold">
                          <th className="py-2.5">Due Date</th>
                          <th className="py-2.5 text-right">Principal Due</th>
                          <th className="py-2.5 text-right">Interest Due</th>
                          <th className="py-2.5 text-center">Status</th>
                          <th className="py-2.5 text-center font-figures">Ver</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate/10 text-ink leading-relaxed">
                        {schedule?.map((line, idx) => (
                          <tr key={idx} className={line.is_current_version ? '' : 'opacity-40 line-through bg-slate/5'}>
                            <td className="py-2.5">{formatDate(line.due_date)}</td>
                            <td className="py-2.5 text-right font-figures">{formatCurrency(line.principal_due, currencyCode)}</td>
                            <td className="py-2.5 text-right font-figures">{formatCurrency(line.interest_due, currencyCode)}</td>
                            <td className="py-2.5 text-center">
                              <span className={`px-1.5 py-0.5 rounded-full text-[9px] font-bold ${
                                line.status === 'PAID' ? 'bg-receivable/10 text-receivable' : 'bg-slate/10 text-slate'
                              }`}>
                                {line.status}
                              </span>
                            </td>
                            <td className="py-2.5 text-center font-figures">{line.schedule_version}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>
        )}

        {/* Transactions content */}
        {loan.status !== 'DRAFT' && (
          <TabsContent value="transactions">
            <Card className="bg-paper border-slate/15 shadow-none rounded-md">
              <CardContent className="p-6 space-y-4">
                <div className="flex justify-between items-center border-b border-slate/10 pb-2">
                  <h3 className="font-bold text-xs uppercase tracking-wider text-ink">Transactions Ledger</h3>
                  {/* Action buttons */}
                  {loan.status === 'ACTIVE' && (
                    <Button 
                      size="sm"
                      onClick={() => setActiveModal('payment')}
                      className="bg-brass hover:bg-brass/90 text-paper text-xs font-semibold py-1 h-8 px-3"
                    >
                      <Plus className="w-3.5 h-3.5 mr-1" />
                      Record Payment
                    </Button>
                  )}
                </div>

                <div className="overflow-x-auto">
                  <table className="w-full text-left text-xs divide-y divide-slate/15">
                    <thead>
                      <tr className="text-slate uppercase tracking-wider text-[10px] font-semibold">
                        <th className="py-2.5">Date</th>
                        <th className="py-2.5">Type</th>
                        <th className="py-2.5 text-right">Amount</th>
                        <th className="py-2.5">Method</th>
                        <th className="py-2.5">Notes</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate/10 text-ink leading-relaxed">
                      {transactions?.map((t, idx) => (
                        <tr key={idx} className={t.is_reversed ? 'opacity-40 line-through bg-slate/5' : ''}>
                          <td className="py-2.5">{formatDate(t.transaction_date)}</td>
                          <td className="py-2.5 font-semibold text-[10px]">{t.type}</td>
                          <td className="py-2.5 text-right font-figures">{formatCurrency(t.amount, currencyCode)}</td>
                          <td className="py-2.5">{t.collection_method || '—'}</td>
                          <td className="py-2.5 truncate max-w-xs">{t.note || t.adjustment_reason || '—'}</td>
                        </tr>
                      ))}
                      {(!transactions || transactions.length === 0) && (
                        <tr>
                          <td colSpan={5} className="py-12 text-center text-slate font-medium text-xs">
                            No transactions recorded on this loan.
                          </td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>
              </CardContent>
            </Card>
          </TabsContent>
        )}

        {/* Disbursements content */}
        {loan.status !== 'DRAFT' && (
          <TabsContent value="disbursements">
            <Card className="bg-paper border-slate/15 shadow-none rounded-md">
              <CardContent className="p-6 space-y-4">
                <h3 className="font-bold text-xs uppercase tracking-wider text-ink border-b border-slate/10 pb-2">Disbursement tranches</h3>
                <div className="overflow-x-auto">
                  <table className="w-full text-left text-xs divide-y divide-slate/15">
                    <thead>
                      <tr className="text-slate uppercase tracking-wider text-[10px] font-semibold">
                        <th className="py-2.5">Tranche No</th>
                        <th className="py-2.5">Date</th>
                        <th className="py-2.5 text-right">Amount</th>
                        <th className="py-2.5">Label</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate/10 text-ink leading-relaxed">
                      {disbursements?.map((d, idx) => (
                        <tr key={idx}>
                          <td className="py-2.5 font-bold font-figures">#{d.sequence_no}</td>
                          <td className="py-2.5">{formatDate(d.disbursement_date)}</td>
                          <td className="py-2.5 text-right font-figures">{formatCurrency(d.amount, currencyCode)}</td>
                          <td className="py-2.5">
                            <span className="px-1.5 py-0.5 rounded bg-slate/10 text-slate font-semibold text-[9px]">
                              {d.label}
                            </span>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </CardContent>
            </Card>
          </TabsContent>
        )}

        {/* Restructuring content */}
        {loan.status !== 'DRAFT' && currentRole !== 'FIELDMAN' && (
          <TabsContent value="restructuring">
            <Card className="bg-paper border-slate/15 shadow-none rounded-md">
              <CardContent className="p-6 space-y-4">
                <h3 className="font-bold text-xs uppercase tracking-wider text-ink border-b border-slate/10 pb-2">Restructuring Logs</h3>
                <div className="space-y-4">
                  {restructureHistory?.map((event, idx) => (
                    <div key={idx} className="flex gap-3 text-xs leading-relaxed">
                      <div className="p-1 rounded bg-slate/10 text-slate h-fit">
                        <History className="w-3.5 h-3.5" />
                      </div>
                      <div className="flex-1 border-b border-slate/10 pb-3 last:border-0">
                        <div className="flex justify-between items-start flex-wrap gap-2">
                          <p className="font-bold text-ink">{event.event_type.replace('_', ' ')}</p>
                          <span className="text-[9px] text-slate font-semibold">{formatDate(event.timestamp, 'dd MMM yyyy, hh:mm a')}</span>
                        </div>
                        <p className="text-slate mt-1">{event.description}</p>
                        <p className="text-[9px] text-slate font-bold mt-1">Reason: {event.reason}</p>
                      </div>
                    </div>
                  ))}
                  {(!restructureHistory || restructureHistory.length === 0) && (
                    <div className="py-12 text-center text-slate font-medium text-xs">
                      No restructuring amendments recorded.
                    </div>
                  )}
                </div>
              </CardContent>
            </Card>
          </TabsContent>
        )}
      </Tabs>

      {/* Modals Rendering */}
      {loan && (
        <>
          <RecordPaymentModal
            isOpen={activeModal === 'payment'}
            onClose={() => setActiveModal(null)}
            spaceId={parsedSpaceId}
            loan={loan}
            onSuccess={() => {
              queryClient.invalidateQueries({ queryKey: ['loan', parsedSpaceId, parsedLoanId] });
              queryClient.invalidateQueries({ queryKey: ['loan-transactions', parsedSpaceId, parsedLoanId] });
              queryClient.invalidateQueries({ queryKey: ['schedule', parsedSpaceId, parsedLoanId] });
            }}
          />
          <SettleModal
            isOpen={activeModal === 'settle'}
            onClose={() => setActiveModal(null)}
            spaceId={parsedSpaceId}
            loan={loan}
            onSuccess={() => {
              queryClient.invalidateQueries({ queryKey: ['loan', parsedSpaceId, parsedLoanId] });
              queryClient.invalidateQueries({ queryKey: ['loan-transactions', parsedSpaceId, parsedLoanId] });
              queryClient.invalidateQueries({ queryKey: ['schedule', parsedSpaceId, parsedLoanId] });
            }}
          />
          <FullClosureModal
            isOpen={activeModal === 'close_early'}
            onClose={() => setActiveModal(null)}
            spaceId={parsedSpaceId}
            loan={loan}
            onSuccess={() => {
              queryClient.invalidateQueries({ queryKey: ['loan', parsedSpaceId, parsedLoanId] });
              queryClient.invalidateQueries({ queryKey: ['schedule', parsedSpaceId, parsedLoanId] });
            }}
          />
          <WriteOffModal
            isOpen={activeModal === 'write_off'}
            onClose={() => setActiveModal(null)}
            spaceId={parsedSpaceId}
            loan={loan}
            onSuccess={() => {
              queryClient.invalidateQueries({ queryKey: ['loan', parsedSpaceId, parsedLoanId] });
              queryClient.invalidateQueries({ queryKey: ['loan-transactions', parsedSpaceId, parsedLoanId] });
              queryClient.invalidateQueries({ queryKey: ['schedule', parsedSpaceId, parsedLoanId] });
            }}
          />
          <ManuallyCloseModal
            isOpen={activeModal === 'manual_close'}
            onClose={() => setActiveModal(null)}
            spaceId={parsedSpaceId}
            loan={loan}
            onSuccess={() => {
              queryClient.invalidateQueries({ queryKey: ['loan', parsedSpaceId, parsedLoanId] });
              queryClient.invalidateQueries({ queryKey: ['schedule', parsedSpaceId, parsedLoanId] });
            }}
          />
          <SwitchAdvanceModeModal
            isOpen={activeModal === 'switch_advance'}
            onClose={() => setActiveModal(null)}
            spaceId={parsedSpaceId}
            loan={loan}
            onSuccess={() => {
              queryClient.invalidateQueries({ queryKey: ['loan', parsedSpaceId, parsedLoanId] });
              queryClient.invalidateQueries({ queryKey: ['schedule', parsedSpaceId, parsedLoanId] });
            }}
          />
          <RecordDisbursementModal
            isOpen={activeModal === 'disbursement'}
            onClose={() => setActiveModal(null)}
            spaceId={parsedSpaceId}
            loan={loan}
            onSuccess={() => {
              queryClient.invalidateQueries({ queryKey: ['loan', parsedSpaceId, parsedLoanId] });
              queryClient.invalidateQueries({ queryKey: ['disbursements', parsedSpaceId, parsedLoanId] });
              queryClient.invalidateQueries({ queryKey: ['schedule', parsedSpaceId, parsedLoanId] });
            }}
          />
          {activeModal && activeModal.startsWith('restructure_') && (
            <RestructureModal
              isOpen={true}
              onClose={() => setActiveModal(null)}
              spaceId={parsedSpaceId}
              loan={loan}
              mode={activeModal.replace('restructure_', '') as any}
              onSuccess={() => {
                queryClient.invalidateQueries({ queryKey: ['loan', parsedSpaceId, parsedLoanId] });
                queryClient.invalidateQueries({ queryKey: ['schedule', parsedSpaceId, parsedLoanId] });
                queryClient.invalidateQueries({ queryKey: ['restructuring', parsedSpaceId, parsedLoanId] });
              }}
            />
          )}
        </>
      )}
    </div>
  );
};
