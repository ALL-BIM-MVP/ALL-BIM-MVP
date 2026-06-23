import { useState } from 'react';
import { User } from '../types/User';
import { authService } from '../services/auth.service';

export function useAuth() {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState<boolean>(false);

  const loginUser = async (email: string, password: string) => {
    setLoading(true);
    try {
      const data = await authService.login(email, password);
      // Aquí se guardará el usuario en el estado cuando el servicio responda
      setUser(data.user);
      return data;
    } catch (error) {
      console.error("Error al iniciar sesión en el hook:", error);
      throw error;
    } finally {
      setLoading(false);
    }
  };

  const logoutUser = () => {
    authService.logout();
    setUser(null);
  };

  return {
    user,
    loading,
    isAuthenticated: !!user,
    loginUser,
    logoutUser
  };
}