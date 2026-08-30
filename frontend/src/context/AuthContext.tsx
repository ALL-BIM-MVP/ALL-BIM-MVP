// frontend/src/context/AuthContext.tsx
import React, { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import { loginUser, getCurrentUser, logoutUser } from '../services/auth.service';
import { getRoleName, getRoleIdFromName } from '../utils/roles';
import { resolveMediaUrl } from '../utils/media';

interface AuthUser {
  id: number | null;
  name: string;
  last_name: string | null;
  email: string;
  role: string;      // texto, ej: "ADMINISTRADOR" (solo para mostrar en UI)
  rol_id: number;     // número, ej: 1 (fuente de verdad para comparar permisos)
  profile_picture_url: string | null;
}

// Forma común que devuelven TANTO /api/auth/login COMO /api/users/register
// (confirmado: registerUser trae access_token, refresh_token, rol_id, user)
interface AuthApiResponse {
  access_token: string;
  refresh_token: string;
  rol_id: number;
  user?: {
    id?: number;
    name?: string;
    last_name?: string | null;
    correo?: string;
    profile_picture_url?: string | null;
  };
}

interface AuthContextType {
  user: AuthUser | null;
  loading: boolean;
  login: (email: string, password: string) => Promise<AuthUser>;
  loginWithResponse: (response: AuthApiResponse) => AuthUser;
  logout: () => void;
  isAuthenticated: () => boolean;
  updateUser: (patch: Partial<AuthUser>) => void;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const AuthProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [loading, setLoading] = useState(true);

  // Al montar el Provider (por ejemplo al recargar la página con F5),
  // confirma la sesión contra el backend (/api/users/me) en vez de
  // confiar ciegamente en lo que quedó en localStorage.
  useEffect(() => {
    const token = localStorage.getItem('accessToken');
    if (!token) {
      setLoading(false);
      return;
    }

    const loadUser = async () => {
      try {
        const backendUser = await getCurrentUser(); // user_id, name, last_name, email, role_name, profile_picture_url, created_at

        setUser({
          id: backendUser.user_id,
          name: backendUser.name,
          last_name: backendUser.last_name ?? null,
          email: backendUser.email,
          role: backendUser.role_name,
          rol_id: getRoleIdFromName(backendUser.role_name), // texto -> número
          profile_picture_url: backendUser.profile_picture_url ? resolveMediaUrl(backendUser.profile_picture_url) : null,
        });
      } catch (err) {
        console.error('No se pudo obtener el usuario actual:', err);
        localStorage.removeItem('accessToken');
        localStorage.removeItem('refreshToken');
        setUser(null);
      } finally {
        setLoading(false);
      }
    };

    loadUser();
  }, []);

  // Función interna compartida: dada una respuesta de login/registro
  // (misma forma en ambos casos), guarda todo en localStorage y en el
  // estado del Context. La usan tanto login() como loginWithResponse().
  const persistSession = (response: AuthApiResponse): AuthUser => {
    localStorage.setItem('accessToken', response.access_token);
    localStorage.setItem('refreshToken', response.refresh_token);
    localStorage.setItem('userRoleId', String(response.rol_id));

    const roleName = getRoleName(response.rol_id);
    localStorage.setItem('userRole', roleName);

    if (response.user?.name) {
      localStorage.setItem('username', response.user.name);
    }
    if (response.user?.correo) {
      localStorage.setItem('userEmail', response.user.correo);
    }
    if (response.user?.id) {
      localStorage.setItem('userId', String(response.user.id));
    }

    const authUser: AuthUser = {
      id: response.user?.id ?? null,
      name: response.user?.name ?? '',
      last_name: response.user?.last_name ?? null,
      email: response.user?.correo ?? '',
      role: roleName,
      rol_id: response.rol_id,
      profile_picture_url: response.user?.profile_picture_url ? resolveMediaUrl(response.user.profile_picture_url) : null,
    };

    setUser(authUser);
    return authUser;
  };

  const login = async (email: string, password: string): Promise<AuthUser> => {
    const response = await loginUser({ email, password });
    return persistSession(response);
  };


  const loginWithResponse = (response: AuthApiResponse): AuthUser => {
    return persistSession(response);
  };

  const logout = () => {
    
    const refreshToken = localStorage.getItem('refreshToken');
    if (refreshToken) {
      logoutUser(refreshToken).catch((err) => {
        console.error('No se pudo revocar el refresh token en el backend:', err);
      });
    }

    localStorage.removeItem('accessToken');
    localStorage.removeItem('refreshToken');
    localStorage.removeItem('userRole');
    localStorage.removeItem('userRoleId');
    localStorage.removeItem('username');
    localStorage.removeItem('userEmail');
    localStorage.removeItem('userId');
    setUser(null);
    // Ya no hace falta window.location.href ni navigate() aquí:
    // al poner user en null, ProtectedRoute reacciona solo y redirige.
  };

  const isAuthenticated = () => !!user;

  // Actualiza campos puntuales del usuario en memoria (sin volver a
  // pedir /users/me) — se usa después de editar el perfil o cambiar la
  // foto, para que el nombre/avatar se refresquen en toda la app
  // (PageHeader incluido) sin recargar la página.
  const updateUser = (patch: Partial<AuthUser>) => {
    setUser((prev) => (prev ? { ...prev, ...patch } : prev));
  };

  return (
    <AuthContext.Provider value={{ user, loading, login, loginWithResponse, logout, isAuthenticated, updateUser }}>
      {children}
    </AuthContext.Provider>
  );
};

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth debe usarse dentro de un <AuthProvider>');
  }
  return context;
}