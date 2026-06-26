import { apiClient } from '@/lib/apiClient';

export interface Partner {
  id: number;
  space_member_id: number;
  member_display_name?: string;
  member_email?: string;
  initial_contribution_amount: string | null;
  profit_share_percent: string | null;
  created_at: string;
}

export interface PartnerDashboardRow {
  partner_id: number;
  partner_name: string;
  contribution: string; // Running capital contribution
  share_percent: string; // Profit share %
  profit_loss_allocated: string; // Allocated profit/loss for selected period
  net_position: string; // Current Net Position
}

export interface CapitalTransaction {
  id: number;
  type: 'CONTRIBUTION' | 'WITHDRAWAL';
  amount: string;
  transaction_date: string;
  note: string | null;
  created_at: string;
}

export const listPartners = async (spaceId: number): Promise<Partner[]> => {
  const response = await apiClient.get(`/spaces/${spaceId}/partners/`);
  return response.data;
};

export const createPartner = async (spaceId: number, data: Partial<Partner>): Promise<Partner> => {
  const response = await apiClient.post(`/spaces/${spaceId}/partners/`, data);
  return response.data;
};

export const updatePartner = async (
  spaceId: number,
  partnerId: number,
  data: Partial<Partner>
): Promise<Partner> => {
  const response = await apiClient.patch(`/spaces/${spaceId}/partners/${partnerId}/`, data);
  return response.data;
};

export const deletePartner = async (spaceId: number, partnerId: number): Promise<void> => {
  await apiClient.delete(`/spaces/${spaceId}/partners/${partnerId}/`);
};

export const getPartnerDashboard = async (
  spaceId: number,
  params?: { period_start?: string; period_end?: string }
): Promise<PartnerDashboardRow[]> => {
  const response = await apiClient.get(`/spaces/${spaceId}/partners/dashboard/`, { params });
  return response.data;
};

export const listCapitalTransactions = async (
  spaceId: number,
  partnerId: number
): Promise<CapitalTransaction[]> => {
  const response = await apiClient.get(`/spaces/${spaceId}/partners/${partnerId}/capital-transactions/`);
  return response.data;
};

export const createCapitalTransaction = async (
  spaceId: number,
  partnerId: number,
  data: { type: 'CONTRIBUTION' | 'WITHDRAWAL'; amount: number; transaction_date: string; note?: string }
): Promise<CapitalTransaction> => {
  const response = await apiClient.post(
    `/spaces/${spaceId}/partners/${partnerId}/capital-transactions/`,
    data
  );
  return response.data;
};
