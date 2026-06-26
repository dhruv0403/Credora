import { apiClient } from '@/lib/apiClient';

export interface NetPositionAnalytics {
  net_position: string;
  total_receivable: string;
  total_payable: string;
  receivables_forecast_30_days: string;
  liabilities_forecast_30_days: string;
}

export interface TopContactAnalyticsRow {
  contact_id: number;
  contact_name: string;
  volume: string;
  loans_count: number;
}

export interface LoanRankingAnalyticsRow {
  loan_id: number;
  contact_name: string;
  principal_amount: string;
  outstanding_balance: string;
  metric_value: string;
}

export interface TrendAnalyticsRow {
  date: string;
  value: string;
}

export const getNetPositionAnalytics = async (spaceId: number): Promise<NetPositionAnalytics> => {
  const response = await apiClient.get(`/spaces/${spaceId}/analytics/net-position/`);
  return response.data;
};

export const getTopContactsAnalytics = async (
  spaceId: number,
  role: 'borrower' | 'lender'
): Promise<TopContactAnalyticsRow[]> => {
  const response = await apiClient.get(`/spaces/${spaceId}/analytics/top-contacts/`, {
    params: { role },
  });
  return response.data;
};

export const getLoanRankingsAnalytics = async (
  spaceId: number,
  by: 'profitable' | 'overdue'
): Promise<LoanRankingAnalyticsRow[]> => {
  const response = await apiClient.get(`/spaces/${spaceId}/analytics/loan-rankings/`, {
    params: { by },
  });
  return response.data;
};

export const getTrendsAnalytics = async (
  spaceId: number,
  params: { metric: 'lending' | 'borrowing' | 'interest'; granularity: 'month' }
): Promise<TrendAnalyticsRow[]> => {
  const response = await apiClient.get(`/spaces/${spaceId}/analytics/trends/`, { params });
  return response.data;
};
