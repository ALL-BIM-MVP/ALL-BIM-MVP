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
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <div className="w-12 h-12 border-4 border-[#0056b3] border-t-transparent rounded-full animate-spin mx-auto"></div>
          <p className="mt-4 text-gray-600">Cargando sesión...</p>
        </div>
      </div>
    );
  }

  // Sin sesión -> a login
  if (!isAuthenticated()) {
    return <Navigate to="/login" replace />;
  }

  // Con sesión, pero el rol no está en la lista permitida -> a dashboard.
  // OJO: la ruta real registrada en App.tsx es "/dashboard/projects", NO
  // "/projects" (esa no existe — causaba "No routes matched location
  // '/projects'" en consola cada vez que alguien sin el rol correcto
  // entraba a una ruta protegida).
  if (allowedRoles && (!user || !allowedRoles.includes(user.rol_id))) {
    return <Navigate to="/dashboard/projects" replace />;
  }

  return <>{children}</>;
};