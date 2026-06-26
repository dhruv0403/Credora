import React from 'react';
import { Navigate } from 'react-router-dom';
import { useSpace } from './SpaceContext';

interface RequireRoleProps {
  roles: Array<'OWNER' | 'ADMIN' | 'VIEWER' | 'FIELDMAN'>;
  children: React.ReactNode;
}

export const RequireRole: React.FC<RequireRoleProps> = ({ roles, children }) => {
  const { currentRole, currentSpaceId } = useSpace();

  if (!currentSpaceId) {
    return <Navigate to="/spaces" replace />;
  }

  if (currentRole && !roles.includes(currentRole)) {
    // Redirect unauthorized roles to their natural default landing page inside that space
    const fallbackRoute = currentRole === 'FIELDMAN' 
      ? `/spaces/${currentSpaceId}/loans` 
      : `/spaces/${currentSpaceId}/dashboard`;
    return <Navigate to={fallbackRoute} replace />;
  }

  return <>{children}</>;
};
