// src/pages/Dashboard.tsx
import React from 'react';
import Sidebar from '../components/Sidebar';

const Dashboard: React.FC = () => {
  const username = localStorage.getItem('username') || 'Usuario';

  return (
    <div className="min-h-screen flex bg-gray-50">
      <Sidebar />
      <div className="flex-1 flex flex-col">
 
  <header className="bg-white border-b border-gray-200 px-8 py-4 flex justify-end items-center">
    <div className="flex items-center gap-3">
     
      <div className="text-right">
        <p className="text-sm text-gray-500">Bienvenido</p>
        <p className="font-semibold text-gray-900">{username}</p>
      </div>

      
      <div className="w-11 h-11 rounded-full bg-[#0056b3] text-white flex items-center justify-center font-bold text-lg shadow">
        {username.charAt(0).toUpperCase()}
      </div>
    </div>
  </header>

  <main className="p-8">
          <div className="mb-8">
            <h1 className="text-3xl font-extrabold text-gray-900">Dashboard</h1>
            <p className="text-gray-600 mt-1 text-lg">Bienvenido, {username}</p>
          </div>
          <div className="bg-white p-6 rounded-lg shadow">
            <p className="text-gray-600">Contenido del dashboard</p>
          </div>
        </main>
      </div>
    </div>
  );
};

export default Dashboard;