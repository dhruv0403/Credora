import { apiClient, setTokens, getRefreshToken } from '@/lib/apiClient';
import type { LoginInput, RegisterInput } from '@/schemas/auth.schema';

export interface UserProfile {
  id: number;
  email: string;
  display_name: string;
  last_active_space_id: number | null;
  notification_prefs: any;
}

export const login = async (data: LoginInput): Promise<UserProfile> => {
  const response = await apiClient.post('/auth/login/', data);
  const { access, refresh } = response.data;
  setTokens(access, refresh);
  
  return getMe();
};

export const register = async (data: RegisterInput): Promise<void> => {
  await apiClient.post('/auth/register/', data);
};

export const logout = async (): Promise<void> => {
  try {
    const refresh = getRefreshToken();
    if (refresh) {
      await apiClient.post('/auth/logout/', { refresh });
    }
  } catch (e) {
    // Fail silently on blacklist step during logout
  } finally {
    setTokens(null, null);
  }
};

export const getMe = async (): Promise<UserProfile> => {
  const response = await apiClient.get('/users/me/');
  return response.data;
};

export const updateMe = async (data: Partial<UserProfile>): Promise<UserProfile> => {
  const response = await apiClient.patch('/users/me/', data);
  return response.data;
};

export const changePassword = async (data: any): Promise<void> => {
  await apiClient.post('/users/me/change-password/', data);
};
