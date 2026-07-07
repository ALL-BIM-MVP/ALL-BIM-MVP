// src/components/LoginForm.tsx
import React from 'react';
import { useAuth } from '../hooks/useAuth';
import { useNavigate } from 'react-router-dom';

export default function LoginForm() {
  const { formData, handleChange, handleLogin, loading } = useAuth();
  const navigate = useNavigate();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const response = await handleLogin();
      
      if (response.rol_id === 1) {
        navigate('/dashboardadmin');
      } else {
        navigate('/dashboard');
      }
    } catch (error: any) {
      alert(error.message);
    }
  };

  return (
    <>
      <h2 className="text-2xl font-bold text-black mb-1">Iniciar sesión</h2>
      <p className="text-sm text-gray-600 mb-8">Ingresa tus credenciales</p>

      <form className="space-y-5" onSubmit={handleSubmit}>
        <div>
          <label className="block text-[18px] font-sans text-gray-700 mb-1.5">
            Correo electrónico
          </label>
          <input
            name="correo"       
            type="email"
            value={formData.correo} 
            onChange={handleChange}
            className="w-full bg-white border border-gray-300 p-2 text-sm focus:outline-none focus:border-[#0056b3] transition-colors"
            required
          />
        </div>

        <div>
          <label className="block text-[18px] font-sans text-gray-700 mb-1.5">
            Contraseña
          </label>
          <input
            name="contrasena"           
            type="password"
            value={formData.contrasena} 
            onChange={handleChange}
            className="w-full bg-white border border-gray-300 p-2 text-sm focus:outline-none focus:border-[#0056b3] transition-colors"
            required
          />
        </div>

        <button
          type="submit"
          disabled={loading}
          className="w-full bg-[#0056b3] text-white font-sans h-10 hover:bg-[#004494] transition-colors mt-2 rounded-md font-semibold disabled:opacity-50"
        >
          {loading ? 'CARGANDO...' : 'INICIAR SESIÓN'}
        </button>
      </form>
    </>
  );
}