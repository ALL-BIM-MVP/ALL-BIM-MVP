// frontend/src/services/auth.service.ts
import { User } from '../types/user.types';
import { api } from './api';

export const getCurrentUser = async (): Promise<User> => {
  return await api.get('/api/users/me');
};

// LISTA DE USUARIOS
export const userService = {
  async getUsers(): Promise<User[]> {
    return await api.get("/api/users");
  },
  // DELETE /api/users/:userId — solo ADMINISTRADOR, nunca sobre uno
  // mismo (el backend lo rechaza igual, ver CANNOT_TARGET_SELF). Baja
  // directa (is_deleted=true), no reversible desde acá.
  async deleteUser(userId: number): Promise<void> {
    await api.delete(`/api/users/${userId}`);
  },
  // PATCH /api/users/:userId/active — solo ADMINISTRADOR, nunca sobre
  // uno mismo. A diferencia de deleteUser, es reversible: se puede
  // volver a togglear en cualquier sentido.
  async setUserActive(userId: number, active: boolean): Promise<void> {
    await api.patch(`/api/users/${userId}/active`, { active });
  },
};
// 1. Login
export const loginUser = async (credentials: {
  email: string;
  password: string;
}) => {
  return await api.post('/api/auth/login', credentials);

};

// 1b. Logout — revoca el refresh token del lado del backend (lo marca
// active=false en la tabla refresh_tokens). Sin esto, cerrar sesión solo
// borraba el token del localStorage: el refresh token seguía siendo
// válido hasta su expiración natural (7 días) aunque alguien lo hubiera
// robado y el usuario ya hubiera "cerrado sesión".
export const logoutUser = async (refreshToken: string): Promise<void> => {
  await api.post('/api/auth/logout', { refresh_token: refreshToken });
};

// 2. Registrar usuario con invitación
export const registerUser = async (data: {
  token: string;
  name: string;
  last_name?: string;
  password: string;
}) => {
  return await api.post('/api/users/register', data);
  
};
    // 3. Validar invitacion.
export const validateInvitation = async (token: string) => {
  console.log(' [auth.service] Validando token:', token);
  try {
    const result = await api.get(`/api/invitations/validate?token=${token}`);
    console.log(' [auth.service] Respuesta:', result);
    
    return result; 
    
  } catch (error) {
    console.error(' [auth.service] Error en validación:', error);
    throw error;  
  }
};

// 4. Crear invitación (solo admin)
export const createInvitation = async (data: { email: string; role_id: number}) => {  // rol_id
  return await api.post('/api/invitations', data);
};

// 5. Obtener roles disponibles
export const getRoles = async () => {
  return await api.get('/api/roles');
};

// 6. Historial de invitaciones enviadas (solo ADMINISTRADOR/SUPERVISOR
// — mismo criterio que createInvitation). "status" ya viene calculado
// del backend ("pendiente" | "usado" | "vencido"), no hace falta
// derivarlo de used/expires_at del lado del frontend.
export interface InvitationHistoryItem {
  invitation_id: number;
  email: string;
  created_at: string;
  expires_at: string;
  used: boolean;
  status: 'pendiente' | 'usado' | 'vencido';
  role: {
    role_id: number;
    role_name: string;
  };
}

export const getInvitations = async (limit?: number): Promise<InvitationHistoryItem[]> => {
  const qs = limit ? `?limit=${limit}` : '';
  const response = await api.get(`/api/invitations${qs}`);
  return response || [];
};