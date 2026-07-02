// src/pages/DashboardAdmin.tsx
import React from 'react';
import Sidebar from '../components/Sidebar';
import ProjectsTable from '../components/ProjectsTable';

const DashboardAdmin: React.FC = () => {
  return (
    <div className="min-h-screen flex bg-gray-50">
      {/* Barra lateral de navegación */}
      <Sidebar />

      {/* Área principal */}
      <div className="flex-1 flex flex-col">
      

        <main className="p-8">
          <div className="mb-8">
            <h1 className="text-3xl font-extrabold text-gray-900">Equipo de ALL-BIM</h1>
            <p className="text-gray-600 mt-1 text-lg">Visualiza proyectos en conjunto</p>
          </div>

          {/* Componente de la tabla de usuarios */}
          <ProjectsTable />
        </main>
      </div>
    </div>
  );
};

export default DashboardAdmin;