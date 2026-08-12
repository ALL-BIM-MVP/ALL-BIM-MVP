import React, { useState } from 'react';
import { Users, UserPlus, Folder, PlusCircle, Layers, ChevronLeft, ChevronRight, Mail } from 'lucide-react';
import { Link, useNavigate } from 'react-router-dom';
import logo from "../assets/logo.png";
import { useAuth } from '../context/AuthContext';
import { usePermissions } from '../hooks/usePermissions';

const Sidebar: React.FC = () => {
  const { logout } = useAuth();
  const { canManageUsers, canInvite } = usePermissions();
  const navigate = useNavigate();
  const [isCollapsed, setIsCollapsed] = useState(false);

  const handleLogout = () => {
    logout();
    navigate('/login');
  };

  const showAdminSection = canManageUsers || canInvite;

  return (
    <>
      {/* Botón para volver a abrir, visible solo cuando está colapsado */}
      {isCollapsed && (
        <button
          onClick={() => setIsCollapsed(false)}
          className="fixed top-6 left-0 z-40 bg-[#0056b3] text-white p-2 rounded-r-lg shadow-md hover:bg-[#004494] transition-colors"
          title="Mostrar menú"
        >
          <ChevronRight size={20} />
        </button>
      )}

      <aside
        className={`relative bg-white border-r border-gray-200 flex flex-col justify-between h-screen transition-all duration-300 ease-in-out overflow-hidden ${
          isCollapsed ? 'w-0 p-0 border-r-0' : 'w-[280px] p-6'
        }`}
      >
        {/* Envuelve el contenido para que no se "aplaste" feo mientras colapsa,
            solo se desvanece y el <aside> se encoge por fuera */}
        <div className={`transition-opacity duration-200 ${isCollapsed ? 'opacity-0' : 'opacity-100'} w-[232px] shrink-0`}>
          <div>
            <div className="mb-10 flex items-center justify-between gap-1">
              <div className="flex items-center gap-1">
                <img src={logo} alt="Logo ALL-BIM" className="h-[65px] w-[70px]" />
                <span className="font-bold text-[28px] text-[#0056b3]">ALL-BIM</span>
              </div>
              <button
                onClick={() => setIsCollapsed(true)}
                className="text-gray-400 hover:text-gray-600 transition-colors"
                title="Ocultar menú"
              >
                <ChevronLeft size={22} />
              </button>
            </div>

            <nav className="space-y-8">
              {showAdminSection && (
                <div>
                  <h4 className="text-[22px] font-sans font-bold text-[#0056b3] mb-5 pl-2">Administración</h4>
                  <ul className="space-y-2 text-[16px] font-sans text-gray-600 pl-2 pr-2">
                    {canManageUsers && (
                      <li className="cursor-pointer group rounded-lg hover:bg-blue-100 transition-colors">
                        <Link
                          to="/admin/usuarios"
                          className="flex items-center gap-3 p-3 rounded-lg group-hover:text-blue-700 transition-colors"
                        >
                          <Users size={20} className="text-gray-400 text-[#0056b3]" />
                          <span>Gestión de Usuarios</span>
                        </Link>
                      </li>
                    )}
                    {canInvite && (
                      <li className="cursor-pointer group rounded-lg hover:bg-blue-100 transition-colors">
                        <Link
                          to="/admin/invitaciones"
                          className="flex items-center gap-3 p-3 rounded-lg group-hover:text-blue-700 transition-colors"
                        >
                          <UserPlus size={20} className="text-gray-400 group-hover:text-blue-600" />
                          <span>Gestión de Invitaciones</span>
                        </Link>
                      </li>
                    )}
                  </ul>
                </div>
              )}

              <div>
                <h4 className="text-[22px] font-sans font-bold text-[#0056b3] mb-5 pl-2">Proyectos</h4>
                <ul className="space-y-2 text-[16px] font-sans text-gray-600 pl-2 pr-2">
                  <li className="cursor-pointer group rounded-lg hover:bg-blue-100 transition-colors">
                    <Link
                      to="/dashboard/projects"
                      className="flex items-center gap-3 p-3 rounded-lg group-hover:text-blue-700 transition-colors"
                    >
                      <PlusCircle size={20} className="text-gray-400 group-hover:text-blue-600" />
                      <span>proyectos</span>
                    </Link>
                  </li>
                  <li className="cursor-pointer group rounded-lg hover:bg-blue-100 transition-colors">
                    <Link
                      to="/mis-invitaciones"
                      className="flex items-center gap-3 p-3 rounded-lg group-hover:text-blue-700 transition-colors"
                    >
                      <Mail size={20} className="text-gray-400 group-hover:text-blue-600" />
                      <span>Mis invitaciones</span>
                    </Link>
                  </li>
                </ul>
              </div>

              
            </nav>
          </div>

          <div className="border-t border-gray-200 pt-4 mt-8">
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
        </div>
      </aside>
    </>
  );
};

export default Sidebar;