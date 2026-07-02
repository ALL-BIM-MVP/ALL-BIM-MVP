import React from 'react';
import { useAuth } from '../hooks/useAuth';
import loginBgImage from '../assets/fondologin.png';

export default function Login() {
  const { formData, handleChange, handleRegister } = useAuth();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await handleRegister();
      alert("Registro exitoso");
    } catch (error: any) {
      alert(error.message);
    }
  };

  return (
    <div 
        className="relative min-h-screen w-full flex items-center justify-end pr-[150px] p-4 font-sans"  
        style={{
          backgroundImage: `url(${loginBgImage})`,
          backgroundSize: 'cover',
          backgroundPosition: 'center'
        }}
    >
      <div className="absolute inset-0 bg-black opacity-0 z-0"></div>

      <div className="relative z-10 w-full max-w-[440px] bg-white border border-gray-200 shadow-xl p-10 flex flex-col rounded-xl">
        <div className="mb-5 text-center">
          <span className="font-sans font-black tracking-tighter text-[41px] text-[#0056b3]">ALL-BIM</span>
        </div>
        <h2 className="text-2xl font-bold font-black text-black mb-1">Has sido invitado a ALL-BIM</h2>
        <p className="text-sm text-gray-600 mb-8">Creando cuenta como ADMINISTRADOR</p>

        <form className="space-y-5" onSubmit={handleSubmit}>
          {[
            { label: "Correo electrónico", name: "email", type: "email" },
            { label: "Nombre de usuario", name: "username", type: "text" },
            { label: "Contraseña", name: "password", type: "password" },
            { label: "Confirmar contraseña", name: "confirmPassword", type: "password" }
          ].map((field) => (
            <div key={field.name}>
              <label className="block text-[18px] font-sans text-gray-700 mb-1.5">
                {field.label}
              </label>
              <input 
                name={field.name}
                type={field.type} 
                value={formData[field.name as keyof typeof formData]}
                onChange={handleChange}
                className="w-full bg-white border border-gray-300 p-2 text-sm focus:outline-none focus:border-[#0056b3] transition-colors"
                required
              />
            </div>
          ))}

          <button 
            type="submit" 
            className="w-full bg-[#0056b3] text-white font-sans h-10 hover:bg-[#004494] transition-colors mt-2 rounded-md font-semibold"
          >
            CREAR CUENTA
          </button>
        </form>
      </div>
    </div>
  );
}