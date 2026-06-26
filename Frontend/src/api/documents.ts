import { apiClient } from '@/lib/apiClient';

export interface Document {
  id: number;
  entity_type: 'LOAN' | 'CONTACT';
  entity_id: number;
  document_type: string;
  file_name: string;
  file_url: string;
  uploaded_at: string;
}

export const listDocuments = async (
  spaceId: number,
  entityType: 'LOAN' | 'CONTACT',
  entityId: number
): Promise<Document[]> => {
  const response = await apiClient.get(`/spaces/${spaceId}/documents/`, {
    params: { entity_type: entityType, entity_id: entityId },
  });
  return response.data;
};

export const uploadDocument = async (spaceId: number, formData: FormData): Promise<Document> => {
  const response = await apiClient.post(`/spaces/${spaceId}/documents/`, formData, {
    headers: {
      'Content-Type': 'multipart/form-data',
    },
  });
  return response.data;
};

export const deleteDocument = async (spaceId: number, documentId: number): Promise<void> => {
  await apiClient.delete(`/spaces/${spaceId}/documents/${documentId}/`);
};
