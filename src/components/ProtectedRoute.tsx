import React from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';

interface ProtectedRouteProps {
  children: React.ReactNode;
  allowedRoles?: string[];
  deniedRoles?: string[];
}

// Default landing page per role
const getDefaultPageForRole = (role: string | null): string => {
  if (role === 'sales') return '/pipeline';
  return '/dashboard';
};

const ProtectedRoute: React.FC<ProtectedRouteProps> = ({ children, allowedRoles, deniedRoles }) => {
  const { isAuthenticated, loading, role } = useAuth();
  const location = useLocation();

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background">
        <div className="flex flex-col items-center gap-4">
          <div className="h-12 w-12 animate-spin rounded-full border-4 border-muted border-t-accent" />
          <p className="text-muted-foreground">Loading...</p>
        </div>
      </div>
    );
  }

  if (!isAuthenticated) {
    return <Navigate to="/auth" state={{ from: location }} replace />;
  }

  // Role-based access check
  if (role) {
    if (deniedRoles && deniedRoles.includes(role)) {
      return <Navigate to={getDefaultPageForRole(role)} replace />;
    }
    if (allowedRoles && !allowedRoles.includes(role)) {
      return <Navigate to={getDefaultPageForRole(role)} replace />;
    }
  }

  return <>{children}</>;
};

export default ProtectedRoute;
