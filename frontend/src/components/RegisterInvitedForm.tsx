// src/components/RegisterInvitedForm.tsx
import React from 'react';
import { useAuth } from '../hooks/useAuth';
import { useNavigate } from 'react-router-dom';

interface RegisterInvitedFormProps {
  invitationData: {
    email: string;
    role_id: number;
    role_name: string;
  };
  token: string;
}

export default function RegisterInvitedForm({ invitationData, token }: RegisterInvitedFormProps) {
  const { formData, handleChange, handleRegister, loading } = useAuth();
  const navigate = useNavigate();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const response = await handleRegister(token);
      alert(' Registro exitoso');
      
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
      <h2 className="text-2xl font-bold text-black mb-1">Completar registro</h2>
      <p className="text-sm text-gray-600 mb-8"> Crea tu cuenta para acceder a ALL-BIM como <strong>{invitationData.role_name}</strong></p>

      <form className="space-y-5" onSubmit={handleSubmit}>
       
        <div>
          <label className="block text-[18px] font-sans text-gray-700 mb-1.5">
            Correo electrónico
          </label>
          <input
            value={invitationData.email}
            disabled
            className="w-full bg-gray-100 border border-gray-300 p-2 text-sm cursor-not-allowed"
          />
        </div>

        {/* Nombre - Editable */}
        <div>
          <label className="block text-[18px] font-sans text-gray-700 mb-1.5">
            Nombre completo
          </label>
          <input
            name="name"
            type="text"
            value={formData.name}
            onChange={handleChange}
            autoComplete="off" 
            className="w-full bg-white border border-gray-300 p-2 text-sm focus:outline-none focus:border-[#0056b3] transition-colors"
            required
            placeholder="Ej: Juan Pérez"
          />
        </div>

        {/* Contraseña */}
        <div>
          <label className="block text-[18px] font-sans text-gray-700 mb-1.5">
            Contraseña
          </label>
          <input
            name="password"             
            type="password"
            value={formData.password}    
            onChange={handleChange}
             autoComplete="new-password"
            className="w-full bg-white border border-gray-300 p-2 text-sm focus:outline-none focus:border-[#0056b3] transition-colors"
            required
            minLength={6}
          />
        </div>

        {/* Confirmar contraseña */}
        <div>
          <label className="block text-[18px] font-sans text-gray-700 mb-1.5">
            Confirmar contraseña
          </label>
          <input
            name="confirmPassword"
            type="password"
            value={formData.confirmPassword}
            onChange={handleChange}
            className="w-full bg-white border border-gray-300 p-2 text-sm focus:outline-none focus:border-[#0056b3] transition-colors"
            required
            minLength={6}
          />
        </div>

        <button
          type="submit"
          disabled={loading}
          className="w-full bg-[#0056b3] text-white font-sans h-10 hover:bg-[#004494] transition-colors mt-2 rounded-md font-semibold disabled:opacity-50"
        >
          {loading ? 'CARGANDO...' : 'CREAR CUENTA'}
        </button>
      </form>
    </>
  );
}