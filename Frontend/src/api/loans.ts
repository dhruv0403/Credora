import { apiClient } from '@/lib/apiClient';

export interface Loan {
  id: number;
  contact_id: number;
  contact_name?: string; // Embedded by serializer (edge case #5)
  direction: 'GIVEN' | 'TAKEN';
  principal_amount: string;
  start_date: string;
  first_due_date: string | null;
  tenure_periods: number | null;

  interest_type: 'NONE' | 'FIXED' | 'FLAT' | 'REDUCING_BALANCE' | 'COMPOUND' | 'CUSTOM';
  rate_value: string | null;
  rate_period: 'DAY' | 'WEEK' | 'MONTH' | 'YEAR' | null;
  fixed_interest_amount: string | null;
  fixed_interest_frequency: string | null;
  interest_timing: 'UPFRONT' | 'DEDUCTED_FROM_DISBURSEMENT' | 'PAYABLE_PERIODICALLY' | 'AT_END';
  net_disbursed_amount: string | null;
  interest_rate_behavior: 'FIXED' | 'VARIABLE' | 'PROMOTIONAL';
  promo_rate: string | null;
  promo_period_days: number | null;

  repayment_type: 'ONE_TIME' | 'EMI' | 'INTEREST_ONLY' | 'PRINCIPAL_ONLY' | 'FLEXIBLE' | 'CUSTOM_INSTALLMENTS';
  payment_frequency: string | null;
  payment_timing_rule: 'SCHEDULED' | 'ANYTIME';

  advance_payment_mode: 'CARRY_FORWARD_CREDIT' | 'RECALCULATE_SCHEDULE' | null;
  penalty_type: 'NONE' | 'FIXED' | 'PERCENTAGE' | 'EXTRA_INTEREST';
  penalty_value: string | null;
  grace_period_days: number | null;

  status: 'DRAFT' | 'ACTIVE' | 'CLOSED';
  outstanding_balance: string;
  is_overdue: boolean;
  accrued_penalty_to_date: string;
  advance_credit_balance: string;
  written_off_amount?: string;
  closure_reason?: 'FULLY_PAID' | 'SETTLED' | 'WRITTEN_OFF' | 'MANUALLY_CLOSED' | null;
  closure_date?: string | null;
  created_at: string;
}

export interface Disbursement {
  id: number;
  sequence_no: number;
  amount: string;
  disbursement_date: string;
  label: 'ORIGINAL' | 'TOP_UP' | 'ADDITIONAL_BORROWING';
  created_at: string;
}

export interface ScheduleLine {
  id: number;
  due_date: string;
  principal_due: string;
  interest_due: string;
  principal_paid: string;
  interest_paid: string;
  penalty_paid: string;
  status: 'PAID' | 'PARTIALLY_PAID' | 'PENDING';
  schedule_version: number;
  is_current_version: boolean;
  is_overdue: boolean; // Computed client-side
}

export interface RestructureEvent {
  id: number;
  event_type: 'RATE_CHANGE' | 'TENURE_EXTENSION' | 'MORATORIUM' | 'WAIVER';
  description: string;
  actor_name: string;
  timestamp: string;
  reason: string;
  details: any;
}

export interface LoanListParams {
  direction?: 'GIVEN' | 'TAKEN';
  status?: 'DRAFT' | 'ACTIVE' | 'CLOSED';
  is_overdue?: boolean;
  closure_reason?: 'WRITTEN_OFF';
  page?: number;
}

// Loans List & CRUD
export const listLoans = async (
  spaceId: number,
  params?: LoanListParams
): Promise<{ count: number; results: Loan[] }> => {
  const response = await apiClient.get(`/spaces/${spaceId}/loans/`, { params });
  return response.data;
};

export const createLoan = async (spaceId: number, data: Partial<Loan>): Promise<Loan> => {
  const response = await apiClient.post(`/spaces/${spaceId}/loans/`, data);
  return response.data;
};

export const getLoan = async (spaceId: number, loanId: number): Promise<Loan> => {
  const response = await apiClient.get(`/spaces/${spaceId}/loans/${loanId}/`);
  return response.data;
};

export const updateLoan = async (spaceId: number, loanId: number, data: Partial<Loan>): Promise<Loan> => {
  const response = await apiClient.patch(`/spaces/${spaceId}/loans/${loanId}/`, data);
  return response.data;
};

// Lifecycle Actions
export const activateLoan = async (
  spaceId: number,
  loanId: number
): Promise<{ loan: Loan; warnings?: string[] }> => {
  const response = await apiClient.post(`/spaces/${spaceId}/loans/${loanId}/activate/`);
  return response.data;
};

export const closeLoan = async (
  spaceId: number,
  loanId: number,
  closureReason: 'FULLY_PAID' | 'MANUALLY_CLOSED',
  closureNote?: string
): Promise<Loan> => {
  const response = await apiClient.post(`/spaces/${spaceId}/loans/${loanId}/close/`, {
    closure_reason: closureReason,
    closure_note: closureNote,
  });
  return response.data;
};

export const closeEarlyLoan = async (
  spaceId: number,
  loanId: number,
  closureDate?: string
): Promise<Loan> => {
  const response = await apiClient.post(`/spaces/${spaceId}/loans/${loanId}/close-early/`, {
    closure_date: closureDate,
  });
  return response.data;
};

export const reopenLoan = async (spaceId: number, loanId: number, reason: string): Promise<Loan> => {
  const response = await apiClient.post(`/spaces/${spaceId}/loans/${loanId}/reopen/`, { reason });
  return response.data;
};

export const changeAdvanceMode = async (
  spaceId: number,
  loanId: number,
  mode: 'CARRY_FORWARD_CREDIT' | 'RECALCULATE_SCHEDULE'
): Promise<{
  advance_payment_mode: 'CARRY_FORWARD_CREDIT' | 'RECALCULATE_SCHEDULE';
  credit_applied: string;
  schedule_version: number;
  status: string;
}> => {
  const response = await apiClient.post(`/spaces/${spaceId}/loans/${loanId}/change-advance-mode/`, {
    advance_payment_mode: mode,
  });
  return response.data;
};

export const addFieldNote = async (spaceId: number, loanId: number, note: string): Promise<void> => {
  await apiClient.post(`/spaces/${spaceId}/loans/${loanId}/notes/`, { note });
};

// Disbursements
export const listDisbursements = async (spaceId: number, loanId: number): Promise<Disbursement[]> => {
  const response = await apiClient.get(`/spaces/${spaceId}/loans/${loanId}/disbursements/`);
  return response.data;
};

export const recordDisbursement = async (
  spaceId: number,
  loanId: number,
  data: { amount: string; disbursement_date: string; label: 'TOP_UP' | 'ADDITIONAL_BORROWING' }
): Promise<Disbursement> => {
  const response = await apiClient.post(`/spaces/${spaceId}/loans/${loanId}/disbursements/`, data);
  return response.data;
};

// Schedule
export const getSchedule = async (
  spaceId: number,
  loanId: number,
  includeSuperseded: boolean = false
): Promise<ScheduleLine[]> => {
  const response = await apiClient.get(`/spaces/${spaceId}/loans/${loanId}/schedule/`, {
    params: { include_superseded: includeSuperseded },
  });
  return response.data;
};

export const setCustomScheduleLines = async (
  spaceId: number,
  loanId: number,
  lines: Array<{ due_date: string; principal_due: number; interest_due: number }>
): Promise<{ warnings?: string[] }> => {
  const response = await apiClient.post(
    `/spaces/${spaceId}/loans/${loanId}/schedule/custom-lines/`,
    lines
  );
  return response.data;
};

// Restructuring Action APIs
export const restructureRateChange = async (
  spaceId: number,
  loanId: number,
  data: { effective_from: string; rate_value: number; rate_period: string; reason: string }
): Promise<void> => {
  await apiClient.post(`/spaces/${spaceId}/loans/${loanId}/restructure/rate-change/`, data);
};

export const restructureExtendTenure = async (
  spaceId: number,
  loanId: number,
  data: { added_periods: number; reason: string }
): Promise<void> => {
  await apiClient.post(`/spaces/${spaceId}/loans/${loanId}/restructure/extend-tenure/`, data);
};

export const restructureMoratorium = async (
  spaceId: number,
  loanId: number,
  data: { pause_start_date: string; pause_end_date: string; interest_free: boolean; reason: string }
): Promise<void> => {
  await apiClient.post(`/spaces/${spaceId}/loans/${loanId}/restructure/moratorium/`, data);
};

export const restructureWaiveInterest = async (
  spaceId: number,
  loanId: number,
  data: { waived_amount: number; reason: string }
): Promise<void> => {
  await apiClient.post(`/spaces/${spaceId}/loans/${loanId}/restructure/waive-interest/`, data);
};

export const restructureWaivePenalty = async (
  spaceId: number,
  loanId: number,
  data: { waived_amount: number; reason: string }
): Promise<void> => {
  await apiClient.post(`/spaces/${spaceId}/loans/${loanId}/restructure/waive-penalty/`, data);
};

export const getRestructuringHistory = async (spaceId: number, loanId: number): Promise<RestructureEvent[]> => {
  const response = await apiClient.get(`/spaces/${spaceId}/loans/${loanId}/restructure/history/`);
  return response.data;
};
