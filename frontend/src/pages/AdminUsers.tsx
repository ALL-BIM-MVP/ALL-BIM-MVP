import React, { useState } from "react";
import { useUsers } from "../hooks/useUsers";
import { useAuth } from "../context/AuthContext";

const AdminUsers: React.FC = () => {
  const { users, loading: usersLoading } = useUsers();
  const { user, logout } = useAuth();
  const [isMenuOpen, setIsMenuOpen] = useState(false);

  // Función para ver información del usuario (ahora con más detalles)
  const handleViewInfo = () => {
    if (user) {
      alert(`👤 Usuario: ${user.name}\n Email: ${user.email}\n Rol: ${user.role}\n ID: ${user.id}`);
    } else {
      alert("No hay usuario autenticado");
    }
  };

  return (
    <div className="min-h-screen bg-gray-50">
      <header className="-mt-8 -mx-8 bg-white border-b border-gray-200 px-8 py-4 flex justify-between items-center">
        <div>
          <h1 className="text-2xl font-bold">
            Gestión de Usuarios
          </h1>
          <p className="text-gray-500">
            Administra los usuarios del sistema
          </p>
        </div>
        
        <div className="relative">
          <button 
            onClick={() => setIsMenuOpen(!isMenuOpen)}
            className="flex items-center gap-2 px-4 py-2 bg-blue-50 hover:bg-blue-100 rounded-lg transition-colors duration-200 border border-blue-200"
          >
            <div className="w-8 h-8 bg-blue-500 rounded-full flex items-center justify-center text-white font-semibold">
              {user?.name?.charAt(0).toUpperCase() || 'U'}
            </div>
            <span className="font-medium text-gray-700">
              {user?.name || 'Usuario'}
            </span>
            <svg 
              className={`w-4 h-4 text-gray-500 transition-transform ${isMenuOpen ? 'rotate-180' : ''}`}
              fill="none" 
              stroke="currentColor" 
              viewBox="0 0 24 24"
            >
              <path 
                strokeLinecap="round" 
                strokeLinejoin="round" 
                strokeWidth={2} 
                d="M19 9l-7 7-7-7" 
              />
            </svg>
          </button>

          {isMenuOpen && (
            <div className="absolute right-0 mt-2 w-64 bg-white rounded-lg shadow-lg border border-gray-200 py-1 z-50">
              <div className="px-4 py-3 border-b border-gray-200">
                <div className="flex items-center gap-3">
                  <div className="w-12 h-12 bg-blue-500 rounded-full flex items-center justify-center text-white text-xl font-semibold">
                    {user?.name?.charAt(0).toUpperCase() || 'U'}
                  </div>
                  <div>
                    <p className="font-semibold text-gray-800">{user?.name || 'Usuario'}</p>
                    <p className="text-sm text-gray-500">{user?.email || 'Sin email'}</p>
                    <p className="text-xs text-blue-600 mt-1">Rol: {user?.role || 'Sin rol'}</p>
                  </div>
                </div>
              </div>

              <div className="py-1">
                <button 
                  onClick={() => {
                    setIsMenuOpen(false);
                    handleViewInfo();
                  }}
                  className="w-full text-left px-4 py-2 text-gray-700 hover:bg-gray-100 flex items-center gap-2"
                >
                  <span>👤</span> Mi Perfil
                </button>
                <button 
                  onClick={() => {
                    setIsMenuOpen(false);
                  }}
                  className="w-full text-left px-4 py-2 text-gray-700 hover:bg-gray-100 flex items-center gap-2"
                >
                  <span>⚙️</span> Configuración
                </button>
              </div>

              <div className="border-t border-gray-200 py-1">
                <button 
                  onClick={() => {
                    setIsMenuOpen(false);
                    logout();
                  }}
                  className="w-full text-left px-4 py-2 text-red-600 hover:bg-red-50 flex items-center gap-2"
                >
                  <span>🚪</span> Cerrar Sesión
                </button>
              </div>
            </div>
          )}
        </div>
      </header>
      
      <main className="p-8">
        <div className="bg-white rounded-xl shadow border border-gray-200 overflow-hidden">
          <table className="w-full">
            <thead className="bg-gray-100">
              <tr>
                <th className="text-left px-6 py-3">
                  Nombre
                </th>
                <th className="text-left px-6 py-3">
                  Correo
                </th>
                <th className="text-left px-6 py-3">
                  Rol
                </th>
              </tr>
            </thead>
            <tbody>
              {usersLoading ? (
                <tr>
                  <td colSpan={3} className="text-center py-8">
                    Cargando...
                  </td>
                </tr>
              ) : (
                users.map(u => (
                  <tr
                    key={u.user_id}
                    className="border-t hover:bg-gray-50"
                  >
                    <td className="px-6 py-4">
                      {u.name}
                    </td>
                    <td className="px-6 py-4">
                      {u.email}
                    </td>
                    <td className="px-6 py-4">
                      {u.role_name}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </main>
    </div>
  );
};

export default AdminUsers;