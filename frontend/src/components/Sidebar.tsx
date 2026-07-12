import React from 'react';
import { Users, UserPlus, Folder, PlusCircle, Layers } from 'lucide-react';
import { Link, useNavigate } from 'react-router-dom';
 import logo from "../assets/logo.png";
const Sidebar: React.FC = () => {
  const navigate = useNavigate();
  const userRole = localStorage.getItem('userRole');

  const handleLogout = () => {
    localStorage.removeItem('accessToken');
    localStorage.removeItem('refreshToken');
    localStorage.removeItem('userRole');
    localStorage.removeItem('userRoleId');
    localStorage.removeItem('username');
    navigate('/login');
  };

  return (
    <aside className="w-1/3 max-w-[250px] min-w-[400px] bg-white border-r border-gray-200 p-6 flex flex-col justify-between h-screen">
      <div>
        <div className="mb-10 flex items-center justify-center gap-1">
  <img src={logo} alt="Logo ALL-BIM" className="h-[75px] w-[80px]" />
  <span className="font-bold text-[40px] text-blue-600">ALL-BIM</span>
</div>
        
        <nav className="space-y-8">
          {/* Sección Administración - Solo visible para admin */}
          {userRole === 'ADMINISTRADOR' && (
            <div>
              <h4 className="text-[25px] font-sans font-bold text-[#0056b3] mb-5 pl-6">Administración</h4>
              <ul className="space-y-2 text-[18px] font-sans text-gray-600 pl-6 pr-6">
                <li className="cursor-pointer group rounded-lg hover:bg-blue-100 transition-colors">
                  <Link 
                    to="/admin/usuarios" 
                    className="flex items-center gap-3 p-3 rounded-lg group-hover:text-blue-700 transition-colors"
                  >
                    <Users size={22} className="text-gray-400 group-hover:text-blue-600" />
                    <span>Gestión de Usuarios</span>
                  </Link>
                </li>
                <li className="cursor-pointer group rounded-lg hover:bg-blue-100 transition-colors">
                  <Link 
                    to="/admin/invitaciones" 
                    className="flex items-center gap-3 p-3 rounded-lg group-hover:text-blue-700 transition-colors"
                  >
                    <UserPlus size={22} className="text-gray-400 group-hover:text-blue-600" />
                    <span>Gestión de Invitaciones</span>
                  </Link>
                </li>
              </ul>
            </div>
          )}

          {/* Sección Proyectos */}
          <div>
            <h4 className="text-[25px] font-sans font-bold text-[#0056b3] mb-5 pl-6">Proyectos</h4>
            <ul className="space-y-2 text-[18px] font-sans text-gray-600 pl-6 pr-6">
              <li className="cursor-pointer group rounded-lg hover:bg-blue-100 transition-colors">
                <Link 
                  to="/projects" 
                  className="flex items-center gap-3 p-3 rounded-lg group-hover:text-blue-700 transition-colors"
                >
                  <Folder size={22} className="text-gray-400 group-hover:text-blue-600" />
                  <span>Todos los Proyectos</span>
                </Link>
              </li>
              <li className="cursor-pointer group rounded-lg hover:bg-blue-100 transition-colors">
                <Link 
                  to="/dashboard/nuevoproyecto" 
                  className="flex items-center gap-3 p-3 rounded-lg group-hover:text-blue-700 transition-colors"
                >
                  <PlusCircle size={22} className="text-gray-400 group-hover:text-blue-600" />
                  <span>Nuevo Proyecto</span>
                </Link>
              </li>
            </ul>
          </div>

          {/* Sección Módulos BIM */}
          <div>
            <h4 className="text-[25px] font-sans font-bold text-[#0056b3] mb-5 pl-6">Módulos BIM</h4>
            <ul className="space-y-2 text-[18px] font-sans text-gray-600 pl-6 pr-6">
              <li className="cursor-pointer group rounded-lg hover:bg-blue-100 transition-colors">
                <Link 
                  to="/viewer" 
                  className="flex items-center gap-3 p-3 rounded-lg group-hover:text-blue-700 transition-colors"
                >
                  <Layers size={22} className="text-gray-400 group-hover:text-blue-600" />
                  <span>Visor 3D</span>
                </Link>
              </li>
            </ul>
          </div>
        </nav>
      </div>

      {/* Footer con logout */}
      <div className="border-t border-gray-200 pt-4">
        <button 
          onClick={handleLogout}
          className="w-full text-left text-red-500 hover:text-red-700 font-medium p-3 rounded-lg hover:bg-red-50 transition-colors flex items-center gap-3"
        >
          <svg xmlns="http://www.w3.org/2000/svg" width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
            <polyline points="16 17 21 12 16 7" />
            <line x1="21" y1="12" x2="9" y2="12" />
          </svg>
          <span>Cerrar sesión</span>
        </button>
      </div>
    </aside>
  );
};

export default Sidebar;