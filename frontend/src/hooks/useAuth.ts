// frontend/src/hooks/useAuth.ts
import { useState } from 'react';
import { loginUser, registerUser, validateInvitation } from '../services/auth.service';
import { getRoleName } from '../utils/roles';

export const useAuth = () => {
  const [formData, setFormData] = useState({
    correo: '',
    name: '',
    contrasena: '',
    confirmPassword: ''
  });

  const [loading, setLoading] = useState(false);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setFormData({
      ...formData,
      [e.target.name]: e.target.value
    });
  };

  // 1. LOGIN
  const handleLogin = async () => {
    setLoading(true);
    try {
      const response = await loginUser({
        correo: formData.correo,
        contrasena: formData.contrasena
      });

      localStorage.setItem('accessToken', response.access_token);
      localStorage.setItem('refreshToken', response.refresh_token);
      localStorage.setItem('userRoleId', String(response.rol_id));
      const roleName = getRoleName(response.rol_id);
      localStorage.setItem('userRole', roleName);
      
      if (response.user?.name) {
        localStorage.setItem('username', response.user.name);
      }

      return response;
    } finally {
      setLoading(false);
    }
  };

  // 2. REGISTRO CON INVITACIÓN
  const handleRegister = async (token: string) => {
    setLoading(true);
    try {
      if (formData.contrasena !== formData.confirmPassword) {
        throw new Error("Las contraseñas no coinciden");
      }

      const response = await registerUser({
        token: token,
        nombre: formData.name,
        contrasena: formData.contrasena
      });

      localStorage.setItem('accessToken', response.access_token);
      localStorage.setItem('refreshToken', response.refresh_token);
      localStorage.setItem('userRoleId', String(response.rol_id));
      const roleName = getRoleName(response.rol_id);
      localStorage.setItem('userRole', roleName);
      localStorage.setItem('username', formData.name);

      return response;
    } finally {
      setLoading(false);
    }
  };

  const validateToken = async (token: string) => {
    setLoading(true);
    try {
      console.log(' [useAuth] Validando token:', token);
      const data = await validateInvitation(token);
      console.log(' [useAuth] Datos del backend:', data);
      
     
      if (data && typeof data === 'object') {
        return {
          email: data.email || '',
          valid: data.valid === true,
          expires_at: data.expires_at || ''
        };
      }
      
      return { email: '', valid: false, expires_at: '' };
    } catch (error) {
      console.error(' [useAuth] Error en validación:', error);
      return { email: '', valid: false, expires_at: '' };
    } finally {
      setLoading(false);
    }
  };

  // 4. LOGOUT
  const handleLogout = () => {
    localStorage.removeItem('accessToken');
    localStorage.removeItem('refreshToken');
    localStorage.removeItem('userRole');
    localStorage.removeItem('userRoleId');
    localStorage.removeItem('username');
    window.location.href = '/login';
  };

  return {
    formData,
    loading,
    handleChange,
    handleLogin,
    handleRegister,
    validateToken,
    handleLogout
  };
};