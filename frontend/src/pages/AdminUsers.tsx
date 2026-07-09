// src/pages/AdminUsers.tsx
import React from 'react';


const AdminUsers: React.FC = () => {
  return (
    <div className="min-h-screen flex bg-gray-50">
      <div className="flex-1 flex flex-col">
        <header className="bg-white border-b border-gray-200 px-8 py-4">
          <h1 className="text-2xl font-bold text-gray-900">Gestión de Usuarios</h1>
          <p className="text-gray-600 text-sm">Administra los usuarios del sistema</p>
        </header>
        <main className="p-8">
          <div className="bg-white p-6 rounded-lg shadow">
            <p className="text-gray-600">Lista de usuarios</p>
          </div>
        </main>
      </div>
    </div>
  );
};

export default AdminUsers;