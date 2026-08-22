// frontend/src/components/LoginForm.tsx
import React, { useState } from 'react';
import { useAuth } from '../context/AuthContext';
import { useNavigate } from 'react-router-dom';
import { Eye, EyeOff } from 'lucide-react';

export default function LoginForm() {
  const { login } = useAuth();
  const navigate = useNavigate();

  const [formData, setFormData] = useState({ email: '', password: '' });
  const [loading, setLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setFormData({
      ...formData,
      [e.target.name]: e.target.value,
    });
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    try {
      await login(formData.email, formData.password);
      navigate('/dashboard/projects');
    } catch (error: any) {
      alert(error.message ?? 'Correo o contraseña incorrectos');
    } finally {
      setLoading(false);
    }
  };

  return (
    <>
      <h2 className="text-2xl font-bold text-black mb-1 text-center">Iniciar sesión</h2>
      <p className="text-sm text-gray-600 mb-8 text-center">Ingresa tus credenciales</p>

      <form className="space-y-5" onSubmit={handleSubmit}>
        <div>
          <label className="block text-[18px] font-sans text-gray-700 mb-1.5">
            Correo electrónico
          </label>
          <input
            name="email"       
            type="email"
            value={formData.email} 
            onChange={handleChange}
            className="w-full bg-white border border-gray-300 p-2 text-sm focus:outline-none focus:border-[#0056b3] transition-colors rounded-lg"
            required
          />
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
              className="w-full bg-white border border-gray-300 p-2 text-sm focus:outline-none focus:border-[#0056b3] transition-colors rounded-lg pr-10"
              required
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

        <button
          type="submit"
          disabled={loading}
          className="w-full bg-[#0056b3] text-white font-sans h-10 hover:bg-[#004494] transition-colors mt-2 rounded-lg font-semibold disabled:opacity-50"
        >
          {loading ? 'CARGANDO...' : 'INICIAR SESIÓN'}
        </button>
      </form>
    </>
  );
}