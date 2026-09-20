// frontend/src/pages/Login.tsx
import React from 'react';
import { Link } from 'react-router-dom';
import LoginForm from '../components/auth/LoginForm';
import fondo from '../assets/fondo.jpg';
import logo from '../assets/logo3.png';

export default function Login() {
  return (
    <div className="relative min-h-screen w-full flex items-center justify-end pr-[150px] p-4 font-sans"
      style={{
        backgroundImage: `url(${fondo})`,
        backgroundSize: '99%',
        backgroundPosition: 'left top',
        backgroundRepeat: 'no-repeat',
        backgroundColor: '#0a1a2f',
      }}>
      <div className="relative z-10 w-full max-w-[440px] bg-white/90 backdrop-blur-sm border border-gray-200 shadow-xl p-10 flex flex-col rounded-xl">
        <div className="mb-5 flex justify-center">
          <img src={logo} alt="Logo ALL-BIM" className="h-14 w-auto object-contain" />
        </div>

        <LoginForm />

       
      </div>
    </div>
  );
}