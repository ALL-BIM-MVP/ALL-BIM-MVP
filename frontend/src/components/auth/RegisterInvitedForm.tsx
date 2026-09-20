// src/components/RegisterInvitedForm.tsx
import React, { useState } from 'react';
import { useAuth } from '../../hooks/useAuth';
import { useAuth as useAuthContext } from '../../context/AuthContext';
import { useNavigate } from 'react-router-dom';
import { Eye, EyeOff } from 'lucide-react';

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
  const { loginWithResponse } = useAuthContext();
  const navigate = useNavigate();
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const response = await handleRegister(token);
      loginWithResponse(response);
      navigate('/dashboard/projects');
    } catch (error: any) {
      alert(error.message);
    }
  };

  return (
    <>
      <h2 className="text-2xl font-bold text-black mb-1 text-center">Completar registro</h2>
      <p className="text-sm text-gray-600 mb-5 text-center"> Crea tu cuenta para acceder a ALL-BIM como <strong>{invitationData.role_name}</strong></p>

      <form className="space-y-4" onSubmit={handleSubmit}>
        <div>
          <label className="block text-[18px] font-sans text-gray-700 mb-1.5">
            Correo electrónico
          </label>
          <input
            value={invitationData.email}
            disabled
            className="w-full bg-gray-100 border border-gray-300 p-2 text-sm cursor-not-allowed rounded-lg"
          />
        </div>

        {/* Nombre + Apellido en la misma fila — así el campo nuevo no
            agrega una fila extra de alto al formulario. */}
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="block text-[18px] font-sans text-gray-700 mb-1.5">
              Nombre
            </label>
            <input
              name="name"
              type="text"
              value={formData.name}
              onChange={handleChange}
              autoComplete="off"
              className="w-full bg-white border border-gray-300 p-2 text-sm focus:outline-none focus:border-[#0056b3] transition-colors rounded-lg"
              required
              placeholder="Ej: Juan"
            />
          </div>

          <div>
            <label className="block text-[18px] font-sans text-gray-700 mb-1.5">
              Apellido
            </label>
            <input
              name="last_name"
              type="text"
              value={formData.last_name}
              onChange={handleChange}
              autoComplete="off"
              className="w-full bg-white border border-gray-300 p-2 text-sm focus:outline-none focus:border-[#0056b3] transition-colors rounded-lg"
              placeholder="Ej: Pérez"
            />
          </div>
        </div>

        <div>
          <label className="block text-[18px] font-sans text-gray-700 mb-1.5">
            Contraseña
          </label>
          <div className="relative">
            <input
              name="password"
              type={showPassword ? "text" : "password"}
              value={formData.password}
              onChange={handleChange}
              autoComplete="new-password"
              className="w-full bg-white border border-gray-300 p-2 text-sm focus:outline-none focus:border-[#0056b3] transition-colors rounded-lg pr-10"
              required
              minLength={6}
            />
            <button
              type="button"
              onClick={() => setShowPassword(!showPassword)}
              className="absolute inset-y-0 right-0 pr-3 flex items-center text-gray-500 hover:text-gray-700"
            >
              {showPassword ? <EyeOff className="h-5 w-5" /> : <Eye className="h-5 w-5" />}
            </button>
          </div>
        </div>

        <div>
          <label className="block text-[18px] font-sans text-gray-700 mb-1.5">
            Confirmar contraseña
          </label>
          <div className="relative">
            <input
              name="confirmPassword"
              type={showConfirmPassword ? "text" : "password"}
              value={formData.confirmPassword}
              onChange={handleChange}
              className="w-full bg-white border border-gray-300 p-2 text-sm focus:outline-none focus:border-[#0056b3] transition-colors rounded-lg pr-10"
              required
              minLength={6}
            />
            <button
              type="button"
              onClick={() => setShowConfirmPassword(!showConfirmPassword)}
              className="absolute inset-y-0 right-0 pr-3 flex items-center text-gray-500 hover:text-gray-700"
            >
              {showConfirmPassword ? <EyeOff className="h-5 w-5" /> : <Eye className="h-5 w-5" />}
            </button>
          </div>
        </div>

        <button
          type="submit"
          disabled={loading}
          className="w-full bg-[#0056b3] text-white font-sans h-10 hover:bg-[#004494] transition-colors mt-2 rounded-lg font-semibold disabled:opacity-50"
        >
          {loading ? 'CARGANDO...' : 'CREAR CUENTA'}
        </button>
      </form>
    </>
  );
}