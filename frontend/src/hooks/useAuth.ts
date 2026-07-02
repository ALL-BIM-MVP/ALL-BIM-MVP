// src/hooks/useAuth.ts
import { useState } from 'react';
import { api } from '../services/auth.service';

const REGISTER_ENDPOINT = '/auth/register';

export const useAuth = () => {
  const [formData, setFormData] = useState({
    email: '', username: '', password: '', confirmPassword: ''
  });

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setFormData({ ...formData, [e.target.name]: e.target.value });
  };

  const handleRegister = async () => {
    if (formData.password !== formData.confirmPassword) {
      throw new Error("Las contraseñas no coinciden");
    }
    // Ahora usa fetch a través de nuestro servicio
    return await api.post(REGISTER_ENDPOINT, formData);
  };

  return { formData, handleChange, handleRegister };
};