import { apiClient } from '@/lib/apiClient';

export interface Expense {
  id: number;
  category: string;
  amount: string;
  date: string;
  note: string | null;
  loan_id: number | null;
  loan_contact_name?: string; // If populated
  created_at: string;
}

export const listExpenses = async (spaceId: number): Promise<Expense[]> => {
  const response = await apiClient.get(`/spaces/${spaceId}/expenses/`);
  return response.data;
};

export const createExpense = async (spaceId: number, data: Partial<Expense>): Promise<Expense> => {
  const response = await apiClient.post(`/spaces/${spaceId}/expenses/`, data);
  return response.data;
};

export const getExpense = async (spaceId: number, expenseId: number): Promise<Expense> => {
  const response = await apiClient.get(`/spaces/${spaceId}/expenses/${expenseId}/`);
  return response.data;
};

export const updateExpense = async (
  spaceId: number,
  expenseId: number,
  data: Partial<Expense>
): Promise<Expense> => {
  const response = await apiClient.patch(`/spaces/${spaceId}/expenses/${expenseId}/`, data);
  return response.data;
};

export const deleteExpense = async (spaceId: number, expenseId: number): Promise<void> => {
  await apiClient.delete(`/spaces/${spaceId}/expenses/${expenseId}/`);
};
