import { apiClient } from '@/lib/apiClient';

export interface TransactionAllocation {
  schedule_line_id: number;
  principal_component: string;
  interest_component: string;
  penalty_component?: string | null;
}

export interface Transaction {
  id: number;
  loan_id: number;
  loan_contact_name?: string;
  type: 'PAYMENT_RECEIVED' | 'PAYMENT_MADE' | 'DISBURSEMENT' | 'MANUAL_ADJUSTMENT' | 'INTEREST_ACCRUED' | 'PENALTY_ACCRUED' | 'SETTLEMENT' | 'WRITE_OFF';
  amount: string;
  transaction_date: string;
  collection_method: 'UPI' | 'CASH' | 'BANK_TRANSFER' | 'ACH' | 'OTHER' | null;
  note: string | null;
  adjustment_reason: string | null;
  is_reversed: boolean;
  reverses_transaction_id: number | null;
  
  // Amortization allocation results
  principal_component: string;
  interest_component: string;
  penalty_component: string;
  
  created_at: string;
}

export interface TransactionCreateParams {
  loan_id: number;
  type: string;
  amount: number;
  transaction_date: string;
  collection_method?: string | null;
  note?: string | null;
  adjustment_reason?: string | null;
  allocations?: TransactionAllocation[] | null;
}

export interface TransactionListParams {
  loan_id?: number;
  type?: string;
  date_from?: string;
  date_to?: string;
  page?: number;
}

export const listTransactions = async (
  spaceId: number,
  params?: TransactionListParams
): Promise<{ count: number; results: Transaction[] }> => {
  const response = await apiClient.get(`/spaces/${spaceId}/transactions/`, { params });
  return response.data;
};

export const listLoanTransactions = async (
  spaceId: number,
  loanId: number
): Promise<Transaction[]> => {
  const response = await apiClient.get(`/spaces/${spaceId}/loans/${loanId}/transactions/`);
  return response.data;
};

export const createTransaction = async (
  spaceId: number,
  data: TransactionCreateParams
): Promise<{ transaction: Transaction; prompt?: string; status?: string }> => {
  const response = await apiClient.post(`/spaces/${spaceId}/transactions/`, data);
  return response.data;
};

export const getTransaction = async (spaceId: number, transactionId: number): Promise<Transaction> => {
  const response = await apiClient.get(`/spaces/${spaceId}/transactions/${transactionId}/`);
  return response.data;
};

export const reverseTransaction = async (
  spaceId: number,
  transactionId: number,
  reason?: string
): Promise<Transaction> => {
  const response = await apiClient.post(`/spaces/${spaceId}/transactions/${transactionId}/reverse/`, {
    reason,
  });
  return response.data;
};

// Settlement API (settle is a specialized transaction write)
export const settleLoan = async (
  spaceId: number,
  loanId: number,
  data: { settlement_amount: number; settlement_date: string; note?: string }
): Promise<void> => {
  await apiClient.post(`/spaces/${spaceId}/loans/${loanId}/settle/`, data);
};

// Write-off API (write-off is a specialized transaction write)
export const writeOffLoan = async (
  spaceId: number,
  loanId: number,
  data: { reason: string; confirm: boolean }
): Promise<void> => {
  await apiClient.post(`/spaces/${spaceId}/loans/${loanId}/write-off/`, data);
};
