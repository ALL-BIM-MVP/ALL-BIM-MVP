/*import { User } from '../types/User';
import { API_BASE_URL } from '../utils/constants';

export const authService = {
  login: async (email: string, password: string): Promise<{ token: string; user: User }> => {
    const response = await fetch(`${API_BASE_URL}/auth/login`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ email, password }),
    });

    if (!response.ok) {
      const errorData = await response.json();
      throw new Error(errorData.message || 'Error al iniciar sesión');
    }

    return await response.json();
  },

  logout: () => {
    localStorage.removeItem('token');
  }
}; */
import { User } from '../types/User';

export const authService = {
  login: async (email: string, password: string): Promise<{ token: string; user: User }> => {
    // Simulamos que el backend respondió con éxito al instante
    const fakeData = {
      token: 'token-falso-all-bim-2026',
      user: {
        id: '1',
        email: email || 'admin@allbim.com',
        role: 'ADMIN' as const
      }
    };

    localStorage.setItem('token', fakeData.token);
    return fakeData;
  },

  logout: () => {
    localStorage.removeItem('token');
  }
};