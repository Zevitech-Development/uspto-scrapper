'use client';

import { useAuth } from "@/hooks/useAuth";

interface ProtectedRouteProps {
  children: React.ReactNode;
  requiredRole?: 'admin' | 'user';
  fallback?: React.ReactNode;
}

export const ProtectedRoute: React.FC<ProtectedRouteProps> = ({ 
  children, 
  requiredRole,
  fallback = <div>Access Denied</div>
}) => {
  const { user } = useAuth();

  if (!user) return <div>Loading...</div>;
  
  if (requiredRole && user.role !== requiredRole) {
    return fallback;
  }

  return <>{children}</>;
};