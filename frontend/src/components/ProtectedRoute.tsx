// src/components/ProtectedRoute.tsx
import { Navigate } from 'react-router-dom';

interface ProtectedRouteProps {
  children: React.ReactNode;
  requiredRoleId?: number;
}

export const ProtectedRoute = ({ children, requiredRoleId }: ProtectedRouteProps) => {
  const token = localStorage.getItem('accessToken');
  const userRoleId = localStorage.getItem('userRoleId');

  // Si no hay token, redirigir a login
  if (!token) {
    return <Navigate to="/login" replace />;
  }

  // Si requiere un rol específico (ej: ADMIN = 1)
  if (requiredRoleId && Number(userRoleId) !== requiredRoleId) {
    return <Navigate to="/dashboard" replace />;
  }

  return <>{children}</>;
};