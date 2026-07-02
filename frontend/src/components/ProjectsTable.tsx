import React from 'react';

const ProjectsTable: React.FC = () => {
  return (
    <div className="bg-white p-8 rounded-xl border border-gray-200 shadow-sm">
  {/* Título de sección */}
  <h2 className="text-[20px] font-bold text-blue-900 mb-2">GESTIÓN DE USUARIOS</h2>
  <p className="text-[14px] text-gray-500 mb-8">Entorno de desarrollo activo para visualización de componentes</p>
  
  {/* Botón de acción */}
  <button className="bg-blue-600 text-white px-6 py-2.5 rounded-lg text-[14px] font-bold mb-8 hover:bg-blue-700 transition-colors">
    + NUEVO PROYECTO
  </button>

  {/* Tabla */}
  <table className="w-full text-left">
    <thead>
      <tr className="text-[12px] font-bold text-gray-400 uppercase border-b border-gray-100">
        <th className="pb-4 pl-2">Nº</th>
        <th className="pb-4">Nombre</th>
        <th className="pb-4">Correo electrónico</th>
        <th className="pb-4">Rol</th>
      </tr>
    </thead>
    <tbody className="text-[15px] text-gray-700">
      <tr className="border-b border-gray-50 hover:bg-gray-50 transition-colors">
        <td className="py-5 pl-2">1</td>
        <td className="py-5 font-medium">Juan Pérez</td>
        <td className="py-5">juanperez@gmail.com</td>
        <td className="py-5">
          <span className="bg-blue-50 text-blue-600 px-3 py-1 rounded-md text-[12px] font-bold uppercase">
            Administrador
          </span>
        </td>
      </tr>
    </tbody>
  </table>
</div>
  );
};

export default ProjectsTable;