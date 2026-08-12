// frontend/src/pages/Login.tsx
import React from 'react';
import { Link } from 'react-router-dom';
import LoginForm from '../components/LoginForm';
import fondo from '../assets/fondo.png';

export default function Login() {
  return (
    <div className="relative min-h-screen w-full flex items-center justify-end pr-[150px] p-4 font-sans"
      style={{
        backgroundImage: `url(${fondo})`,
        backgroundSize: 'cover',
        backgroundPosition: 'center',
        backgroundRepeat: 'no-repeat',
      }}>
      <div className="relative z-10 w-full max-w-[440px] bg-white border border-gray-200 shadow-xl p-10 flex flex-col rounded-xl">
        <div className="mb-5 text-center">
          <span className="font-sans font-black tracking-tighter text-[41px] text-[#0056b3]">ALL-BIM</span>
        </div>

        <LoginForm />

        <div className="mt-6 text-center text-sm text-gray-600">
          <p>
            ¿No tienes una cuenta?{' '}
            <Link to="/register" className="text-[#0056b3] hover:underline font-semibold">
              Registrarse
            </Link>
          </p>
          <p className="mt-2 text-xs text-gray-500">
            (Solo disponible mediante invitación)
          </p>
        </div>
      </div>
    </div>
  );
}