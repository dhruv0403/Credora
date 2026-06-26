import { apiClient } from '@/lib/apiClient';

export interface ActivityLog {
  id: number;
  description: string;
  actor_name: string;
  timestamp: string;
  entity_type: string;
  entity_id: number;
}

export interface ActivityFilterParams {
  date_from?: string;
  date_to?: string;
  entity_type?: string;
  entity_id?: number;
}

export const getActivityTimeline = async (
  spaceId: number,
  params?: ActivityFilterParams
): Promise<ActivityLog[]> => {
  const response = await apiClient.get(`/spaces/${spaceId}/activity/`, { params });
  return response.data;
};
