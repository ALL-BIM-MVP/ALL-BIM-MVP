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
  }
};
// 1. Login
export const loginUser = async (credentials: { 
  email: string;
  password: string;   
}) => {
  return await api.post('/api/auth/login', credentials);
  
};

// 2. Registrar usuario con invitación
export const registerUser = async (data: {
  token: string;
  name: string;
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