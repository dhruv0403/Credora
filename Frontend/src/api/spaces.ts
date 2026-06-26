import { apiClient } from '@/lib/apiClient';

export interface Space {
  id: number;
  name: string;
  space_type: 'PERSONAL' | 'BUSINESS';
  space_visibility: 'PRIVATE' | 'SHARED';
  currency_code: string;
  total_lent?: string;
  total_borrowed?: string;
  deleted_at?: string | null;
}

export interface Member {
  id: number;
  user_email?: string;
  user_display_name?: string;
  role: 'OWNER' | 'ADMIN' | 'VIEWER' | 'FIELDMAN';
  status: 'PENDING' | 'ACTIVE';
  invited_email?: string;
}

export interface SpaceSettings {
  default_interest_type: string;
  default_rate_value: string;
  default_rate_period: string;
  default_repayment_type: string;
  default_payment_frequency: string;
  default_advance_payment_mode: string;
  default_penalty_type: string;
  default_grace_period_days: number;
  deduct_expenses_from_reports: boolean;
}

export interface DashboardData {
  total_lent: string;
  total_borrowed: string;
  net_position: string;
  outstanding_receivable: string;
  outstanding_payable: string;
  active_loans_count: number;
  overdue_loans_count: number;
  interest_earned: string;
  interest_paid: string;
  upcoming_payments: Array<{
    loan_id: number;
    contact_name: string;
    amount_due: string;
    due_date: string;
  }>;
  recent_activity: Array<{
    id: number;
    description: string;
    actor_name: string;
    timestamp: string;
    entity_type: string;
    entity_id: number;
  }>;
}

// Spaces API
export const listSpaces = async (): Promise<Space[]> => {
  const response = await apiClient.get('/spaces/');
  return response.data;
};

export const createSpace = async (data: Partial<Space>): Promise<Space> => {
  const response = await apiClient.post('/spaces/', data);
  return response.data;
};

export const getSpace = async (spaceId: number): Promise<Space> => {
  const response = await apiClient.get(`/spaces/${spaceId}/`);
  return response.data;
};

export const updateSpace = async (spaceId: number, data: Partial<Space>): Promise<Space> => {
  const response = await apiClient.patch(`/spaces/${spaceId}/`, data);
  return response.data;
};

export const changeSpaceType = async (
  spaceId: number,
  targetType: 'PERSONAL' | 'BUSINESS',
  confirm: boolean
): Promise<void> => {
  await apiClient.post(`/spaces/${spaceId}/change-type/`, {
    target_type: targetType,
    confirm,
  });
};

export const changeSpaceVisibility = async (
  spaceId: number,
  targetVisibility: 'PRIVATE' | 'SHARED'
): Promise<void> => {
  await apiClient.post(`/spaces/${spaceId}/change-visibility/`, {
    target_visibility: targetVisibility,
  });
};

export const transferOwnership = async (spaceId: number, newOwnerMemberId: number): Promise<void> => {
  await apiClient.post(`/spaces/${spaceId}/transfer-ownership/`, {
    new_owner_member_id: newOwnerMemberId,
  });
};

export const deleteSpace = async (spaceId: number, confirmName: string): Promise<void> => {
  await apiClient.delete(`/spaces/${spaceId}/`, {
    data: { confirm_name: confirmName },
  });
};

export const getDashboard = async (spaceId: number): Promise<DashboardData> => {
  const response = await apiClient.get(`/spaces/${spaceId}/dashboard/`);
  return response.data;
};

// Members API
export const listMembers = async (spaceId: number): Promise<Member[]> => {
  const response = await apiClient.get(`/spaces/${spaceId}/members/`);
  return response.data;
};

export const inviteMember = async (
  spaceId: number,
  email: string,
  role: 'ADMIN' | 'VIEWER' | 'FIELDMAN'
): Promise<void> => {
  await apiClient.post(`/spaces/${spaceId}/members/invite/`, { email, role });
};

export const changeMemberRole = async (
  spaceId: number,
  memberId: number,
  role: 'OWNER' | 'ADMIN' | 'VIEWER' | 'FIELDMAN'
): Promise<void> => {
  await apiClient.patch(`/spaces/${spaceId}/members/${memberId}/`, { role });
};

export const removeMember = async (spaceId: number, memberId: number): Promise<void> => {
  await apiClient.delete(`/spaces/${spaceId}/members/${memberId}/`);
};

export const resendInvite = async (spaceId: number, memberId: number): Promise<void> => {
  await apiClient.post(`/spaces/${spaceId}/members/${memberId}/resend-invite/`);
};

// Accept invite (token is top-level)
export const acceptInvite = async (token: string): Promise<void> => {
  await apiClient.post(`/invites/${token}/accept/`);
};

// Settings API
export const getSpaceSettings = async (spaceId: number): Promise<SpaceSettings> => {
  const response = await apiClient.get(`/spaces/${spaceId}/settings/`);
  return response.data;
};

export const updateSpaceSettings = async (
  spaceId: number,
  data: Partial<SpaceSettings>
): Promise<SpaceSettings> => {
  const response = await apiClient.patch(`/spaces/${spaceId}/settings/`, data);
  return response.data;
};
