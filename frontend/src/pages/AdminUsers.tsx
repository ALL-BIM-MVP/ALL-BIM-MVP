import React from "react";
import { useUsers } from "../hooks/useUsers";
import PageHeader from "../components/PageHeader";

const AdminUsers: React.FC = () => {
  const { users, loading: usersLoading } = useUsers();

  return (
    <div className="min-h-screen bg-gray-50">
      <PageHeader title="Gestión de Usuarios" subtitle="Administra los usuarios del sistema" />

      <main className="p-8">
        <div className="bg-white rounded-xl shadow border border-gray-200 overflow-hidden">
          <table className="w-full">
            <thead className="bg-gray-100">
              <tr>
                <th className="text-left px-6 py-3">Nombre</th>
                <th className="text-left px-6 py-3">Correo</th>
                <th className="text-left px-6 py-3">Rol</th>
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
                users.map((u) => (
                  <tr key={u.user_id} className="border-t hover:bg-gray-50">
                    <td className="px-6 py-4">{u.name}</td>
                    <td className="px-6 py-4">{u.email}</td>
                    <td className="px-6 py-4">{u.role_name}</td>
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