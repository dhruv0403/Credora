import React, { createContext, useContext, useState } from 'react';
import { listSpaces, listMembers } from '@/api/spaces';
import type { Space } from '@/api/spaces';
import { updateMe, getMe } from '@/api/auth';

interface SpaceContextType {
  currentSpaceId: number | null;
  currentRole: 'OWNER' | 'ADMIN' | 'VIEWER' | 'FIELDMAN' | null;
  currentSpace: Space | null;
  spaces: Space[];
  isLoadingSpaces: boolean;
  switchSpace: (spaceId: number) => Promise<void>;
  refreshSpaces: () => Promise<void>;
  setSpaceState: (spaceId: number | null, role: 'OWNER' | 'ADMIN' | 'VIEWER' | 'FIELDMAN' | null) => void;
}

const SpaceContext = createContext<SpaceContextType | undefined>(undefined);

export const SpaceProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [currentSpaceId, setCurrentSpaceId] = useState<number | null>(null);
  const [currentRole, setCurrentRole] = useState<'OWNER' | 'ADMIN' | 'VIEWER' | 'FIELDMAN' | null>(null);
  const [spaces, setSpaces] = useState<Space[]>([]);
  const [isLoadingSpaces, setIsLoadingSpaces] = useState(false);

  const currentSpace = spaces.find((s) => s.id === currentSpaceId) || null;

  const refreshSpaces = async () => {
    setIsLoadingSpaces(true);
    try {
      const data = await listSpaces();
      setSpaces(data);
    } catch (error) {
      console.error('Failed to load spaces:', error);
    } finally {
      setIsLoadingSpaces(false);
    }
  };

  const setSpaceState = (spaceId: number | null, role: 'OWNER' | 'ADMIN' | 'VIEWER' | 'FIELDMAN' | null) => {
    setCurrentSpaceId(spaceId);
    setCurrentRole(role);
  };

  const switchSpace = async (spaceId: number) => {
    try {
      // 1. Patch user profile last_active_space_id
      await updateMe({ last_active_space_id: spaceId });
      
      // 2. Fetch the members list for this space to determine the user's role
      const members = await listMembers(spaceId);
      const me = await getMe();
      
      // Look for a membership matching current user
      const myMembership = members.find((m) => m.user_email === me.email);
      
      if (myMembership) {
        setCurrentSpaceId(spaceId);
        setCurrentRole(myMembership.role);
      } else {
        setCurrentSpaceId(null);
        setCurrentRole(null);
      }
    } catch (error) {
      console.error('Error switching space:', error);
    }
  };

  return (
    <SpaceContext.Provider
      value={{
        currentSpaceId,
        currentRole,
        currentSpace,
        spaces,
        isLoadingSpaces,
        switchSpace,
        refreshSpaces,
        setSpaceState,
      }}
    >
      {children}
    </SpaceContext.Provider>
  );
};

export const useSpace = () => {
  const context = useContext(SpaceContext);
  if (!context) {
    throw new Error('useSpace must be used within a SpaceProvider');
  }
  return context;
};
