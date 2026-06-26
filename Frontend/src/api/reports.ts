import { apiClient } from '@/lib/apiClient';

export interface ReportFilterParams {
  date_from?: string;
  date_to?: string;
  deduct_expenses?: boolean;
}

export interface ReceivablePayableReportRow {
  contact_id: number;
  contact_name: string;
  loans_count: number;
  total_principal: string;
  total_outstanding: string;
}

export interface InterestReportData {
  interest_earned: string;
  interest_paid: string;
  series: Array<{
    date: string;
    earned: string;
    paid: string;
  }>;
}

export interface OverdueReportRow {
  loan_id: number;
  contact_name: string;
  principal_amount: string;
  outstanding_balance: string;
  days_overdue: number;
  bucket: '0-30' | '31-60' | '61-90' | '90+';
}

export interface CashFlowReportRow {
  date: string;
  type: 'HISTORICAL' | 'PROJECTED';
  inflow: string;
  outflow: string;
}

export const getReceivableReport = async (
  spaceId: number,
  params?: ReportFilterParams
): Promise<ReceivablePayableReportRow[]> => {
  const response = await apiClient.get(`/spaces/${spaceId}/reports/receivable/`, { params });
  return response.data;
};

export const getPayableReport = async (
  spaceId: number,
  params?: ReportFilterParams
): Promise<ReceivablePayableReportRow[]> => {
  const response = await apiClient.get(`/spaces/${spaceId}/reports/payable/`, { params });
  return response.data;
};

export const getInterestReport = async (
  spaceId: number,
  params?: ReportFilterParams
): Promise<InterestReportData> => {
  const response = await apiClient.get(`/spaces/${spaceId}/reports/interest/`, { params });
  return response.data;
};

export const getOverdueReport = async (
  spaceId: number,
  params?: ReportFilterParams
): Promise<OverdueReportRow[]> => {
  const response = await apiClient.get(`/spaces/${spaceId}/reports/overdue/`, { params });
  return response.data;
};

export const getCashFlowReport = async (
  spaceId: number,
  params?: ReportFilterParams
): Promise<CashFlowReportRow[]> => {
  const response = await apiClient.get(`/spaces/${spaceId}/reports/cash-flow/`, { params });
  return response.data;
};
