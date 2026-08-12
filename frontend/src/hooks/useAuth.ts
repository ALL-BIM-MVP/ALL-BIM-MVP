// frontend/src/hooks/useAuth.ts
import { useState } from 'react';
import { registerUser, validateInvitation } from '../services/auth.service';

export const useAuth = () => {
  const [formData, setFormData] = useState({
    email: '',
    name: '',
    password: '',
    confirmPassword: ''
  });

  const [loading, setLoading] = useState(false);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setFormData({
      ...formData,
      [e.target.name]: e.target.value
    });
  };

  // REGISTRO CON INVITACIÓN
  // Nota: esto solo registra al usuario invitado. No inicia sesión por sí solo
  // (si tu flujo requiere loguear automáticamente tras registrarse, hay que
  // llamar a login() del AuthContext desde el componente que use este hook).
  const handleRegister = async (token: string) => {
    setLoading(true);
    try {
      if (formData.password !== formData.confirmPassword) {
        throw new Error("Las contraseñas no coinciden");
      }

      const response = await registerUser({
        token,
        name: formData.name,
        password: formData.password
      });

      return response;
    } catch (error) {
      console.error('Register error:', error);
      throw error;
    } finally {
      setLoading(false);
    }
  };

  // VALIDAR INVITACIÓN
  const validateToken = async (token: string) => {
    setLoading(true);
    try {
      console.log('[useAuth] Validando token:', token);
      const data = await validateInvitation(token);
      console.log('[useAuth] Datos del backend:', data);

      if (data?.email) {
        return {
          email: data.email,
          role_id: data.role_id || 0,
          role_name: data.role_name || ''
        };
      }

      return { email: '', role_id: 0, role_name: '' };
    } catch (error) {
      console.error('❌ [useAuth] Error:', error);
      return { email: '', role_id: 0, role_name: '' };
    } finally {
      setLoading(false);
    }
  };

  return {
    formData,
    loading,
    handleChange,
    handleRegister,
    validateToken,
  };
};