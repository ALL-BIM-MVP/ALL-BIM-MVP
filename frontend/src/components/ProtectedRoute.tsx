// frontend/src/components/ProtectedRoute.tsx
import { Navigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';

interface ProtectedRouteProps {
  children: React.ReactNode;
  allowedRoles?: number[];
}

export const ProtectedRoute = ({ children, allowedRoles }: ProtectedRouteProps) => {
  const { user, loading, isAuthenticated } = useAuth();

  // Mientras el AuthProvider todavía está leyendo localStorage (al recargar
  // la página con F5), no decidimos nada todavía, para no redirigir por error
  // a alguien que sí tenía sesión guardada.
  if (loading) {
    return <div>Cargando sesión...</div>;
  }

  // Sin sesión -> a login
  if (!isAuthenticated()) {
    return <Navigate to="/login" replace />;
  }

  // Con sesión, pero el rol no está en la lista permitida -> a dashboard
  if (allowedRoles && (!user || !allowedRoles.includes(user.rol_id))) {
    return <Navigate to="/projects" replace />;
  }

  return <>{children}</>;
};