import React from 'react';
import { Users, UserPlus, Folder, PlusCircle, Box, Layers } from 'lucide-react';
const Sidebar: React.FC = () => {
  return (
    <aside className="w-1/3 max-w-[250px] min-w-[400px] bg-white border-r border-gray-200 p-6">
      <div className="mb-10 text-center font-bold text-[40px] text-[#0056b3]">ALL-BIM</div>
      
      <nav className="space-y-8">
  {/* Sección Administración */}
  <div>
    <h4 className="text-[25px] font-sans font-bold text-[#0056b3] mb-5 pl-6">Administración</h4>
    <ul className="space-y-2 text-[18px] font-sans text-gray-600 pl-6 pr-6">
      <li className="cursor-pointer group rounded-lg hover:bg-blue-100 transition-colors">
        <a href="#" className="flex items-center gap-3 p-3 rounded-lg group-hover:text-blue-700 transition-colors">
          <Users size={22} className="text-gray-400 group-hover:text-blue-600" />
          <span>Gestión de Usuarios</span>
        </a>
      </li>
      <li className="cursor-pointer group rounded-lg hover:bg-blue-100 transition-colors">
        <a href="#" className="flex items-center gap-3 p-3 rounded-lg group-hover:text-blue-700 transition-colors">
          <UserPlus size={22} className="text-gray-400 group-hover:text-blue-600" />
          <span>Gestión de Invitaciones</span>
        </a>
      </li>
    </ul>
  </div>

  <div>
    <h4 className="text-[25px] font-sans font-bold text-[#0056b3] mb-5 pl-6">Proyectos</h4>
    <ul className="space-y-2 text-[18px] font-sans text-gray-600 pl-6 pr-6">
     <li className="cursor-pointer group rounded-lg hover:bg-blue-100 transition-colors">
  <a href="#" className="flex items-center gap-3 p-3 rounded-lg group-hover:text-blue-700 text-gray-600 transition-colors">
    <Folder size={22} className="text-gray-400 group-hover:text-blue-600" />
    <span>Todos los Proyectos</span>
  </a>
</li>
      <li className="cursor-pointer group rounded-lg hover:bg-blue-100 transition-colors">
        <a href="#" className="flex items-center gap-3 p-3 rounded-lg group-hover:text-blue-700 transition-colors">
          <PlusCircle size={22} className="text-gray-400 group-hover:text-blue-600" />
          <span>Nuevo Proyecto</span>
        </a>
      </li>
    </ul>
  </div>

  
  <div>
    <h4 className="text-[25px] font-sans font-bold text-[#0056b3] mb-5 pl-6">Módulos BIM</h4>
    <ul className="space-y-2 text-[18px] font-sans text-gray-600 pl-6 pr-6">
      <li className="cursor-pointer group rounded-lg hover:bg-blue-100 transition-colors">
        <a href="#" className="flex items-center gap-3 p-3 rounded-lg group-hover:text-blue-700 transition-colors">
          <Layers size={22} className="text-gray-400 group-hover:text-blue-600" />
          <span>Visor 3D</span>
        </a>
      </li>
      
    </ul>
  </div>
</nav>
    </aside>
  );
};

export default Sidebar;