import { apiClient } from '@/lib/apiClient';
import type { Loan } from './loans';

export interface Contact {
  id: number;
  name: string;
  relationship_tag: string;
  phone: string | null;
  email: string | null;
  address: string | null;
  notes: string | null;
  active_loans_count?: number; // Added client-side or serializer
  created_at: string;
}

export interface ContactLoansResponse {
  loans: Loan[];
  net_position: string; // receivable minus payable (edge case #48)
}

export const listContacts = async (
  spaceId: number,
  params?: { relationship_tag?: string; search?: string }
): Promise<Contact[]> => {
  const response = await apiClient.get(`/spaces/${spaceId}/contacts/`, { params });
  return response.data;
};

export const createContact = async (spaceId: number, data: Partial<Contact>): Promise<Contact> => {
  const response = await apiClient.post(`/spaces/${spaceId}/contacts/`, data);
  return response.data;
};

export const getContact = async (spaceId: number, contactId: number): Promise<Contact> => {
  const response = await apiClient.get(`/spaces/${spaceId}/contacts/${contactId}/`);
  return response.data;
};

export const updateContact = async (
  spaceId: number,
  contactId: number,
  data: Partial<Contact>
): Promise<Contact> => {
  const response = await apiClient.patch(`/spaces/${spaceId}/contacts/${contactId}/`, data);
  return response.data;
};

export const deleteContact = async (spaceId: number, contactId: number): Promise<void> => {
  await apiClient.delete(`/spaces/${spaceId}/contacts/${contactId}/`);
};

export const getContactLoans = async (spaceId: number, contactId: number): Promise<ContactLoansResponse> => {
  const response = await apiClient.get(`/spaces/${spaceId}/contacts/${contactId}/loans/`);
  return response.data;
};
