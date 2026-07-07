// frontend/src/services/auth.service.ts
import { api } from './api';

// 1. Login
export const loginUser = async (credentials: { 
  correo: string;
  contrasena: string;
}) => {
  return await api.post('/auth/login', credentials);
};

// 2. Registrar usuario con invitación
export const registerUser = async (data: { 
  token: string; 
  nombre: string; 
  contrasena: string;
}) => {
  return await api.post('/auth/register', data);
};

export const validateInvitation = async (token: string) => {
  console.log(' [auth.service] Validando token:', token);
  try {
    const result = await api.get(`/auth/invitations/validate?token=${token}`);
    console.log(' [auth.service] Respuesta:', result);
    
    if (result && typeof result === 'object') {
      return {
        email: result.email || '',
        valid: result.valid === true,
        expires_at: result.expires_at || ''
      };
    }
    
    return { email: '', valid: false, expires_at: '' };
  } catch (error) {
    console.error(' [auth.service] Error en validación:', error);
    return { email: '', valid: false, expires_at: '' };
  }
};

// 4. Crear invitación (solo admin)
export const createInvitation = async (data: { email: string; rol: string }) => {
  return await api.post('/auth/invitations', data);
};

// 5. Obtener roles disponibles
export const getRoles = async () => {
  return await api.get('/roles');
};