import React, { useState } from 'react';
import { Users, UserPlus, FolderKanban, Mail, ChevronLeft, ChevronRight, LogOut } from 'lucide-react';
import { Link, useNavigate, useLocation } from 'react-router-dom';
import logo from "../assets/logo3.png";
import { useAuth } from '../context/AuthContext';
import { usePermissions } from '../hooks/usePermissions';

const Sidebar: React.FC = () => {
  const { logout, user } = useAuth();
  const { canManageUsers, canInvite } = usePermissions();
  const navigate = useNavigate();
  const location = useLocation();
  const [isCollapsed, setIsCollapsed] = useState(false);

  const handleLogout = () => {
    logout();
    navigate('/login');
  };

  const showAdminSection = canManageUsers || canInvite;
  const isActive = (path: string) => location.pathname.startsWith(path);

  const linkClasses = (path: string) =>
    `group flex items-center gap-3 px-3 py-2.5 rounded-lg text-[14px] transition-colors ${
      isActive(path)
        ? 'bg-[#E6F0FA] text-[#0056b3] font-medium'
        : 'text-[#3F4756] font-normal hover:bg-[#EFF6FC] hover:text-[#0056b3]'
    }`;

  const iconClasses = (path: string) =>
    isActive(path) ? 'text-[#0056b3]' : 'text-[#8B93A1] group-hover:text-[#0056b3]';

  return (
    <>
      {/* Botón para volver a abrir, visible solo cuando está colapsado.
          top-20 (80px): el header (PageHeader.tsx) mide ~64px de alto —
          con top-6 (24px) el botón caía DENTRO de esa franja y tapaba el
          título. Lo bajamos para que quede claramente debajo del header,
          no superpuesto.
          z-50: el header usa z-40 — con el mismo z-index, el que está más
          abajo en el DOM (el header, renderizado después del sidebar)
          gana el empate y tapa el botón. z-50 lo deja garantizado por
          encima sin depender del orden en el DOM. */}
      {isCollapsed && (
        <button
          onClick={() => setIsCollapsed(false)}
          className="fixed top-20 left-0 z-50 bg-[#0056b3] text-white p-2 rounded-r-lg shadow-md hover:bg-[#004494] transition-colors"
          title="Mostrar menú"
        >
          <ChevronRight size={20} />
        </button>
      )}

      <aside
        className={`relative bg-white border-r border-[#E2E5EA] h-screen transition-all duration-300 ease-in-out overflow-hidden ${
          isCollapsed ? 'w-0 p-0 border-r-0' : 'w-[272px] p-5'
        }`}
      >
        {/* Contenedor flex de alto completo: nav arriba, usuario/logout siempre al fondo */}
        <div
          className={`h-full flex flex-col transition-opacity duration-200 ${
            isCollapsed ? 'opacity-0' : 'opacity-100'
          } w-[232px] shrink-0`}
        >
          {/* Logo */}
          <div className="-mt-5 -mx-1 flex items-center justify-between shrink-0">
            <div className="h-14 w-[190px] flex items-center">
              <img src={logo} alt="Logo ALL-BIM" className="max-h-full max-w-full object-contain" />
            </div>
            <button
              onClick={() => setIsCollapsed(true)}
              className="text-[#C2C7CF] hover:text-[#5B6472] transition-colors p-1"
              title="Ocultar menú"
            >
              <ChevronLeft size={20} />
            </button>
          </div>

          <div className="h-px bg-[#E2E5EA] mt-4 mb-6 shrink-0" />

          {/* Navegación */}
          <nav className="flex-1 min-h-0 overflow-y-auto">
            {showAdminSection && (
              <div className="mb-7">
                <h4 className="text-[13px] font-semibold uppercase tracking-wide text-[#3F7CB8] mb-3 pl-3">
                  Administración
                </h4>
                <ul className="space-y-3.5">
                  {canManageUsers && (
                    <li>
                      <Link to="/admin/usuarios" className={linkClasses('/admin/usuarios')}>
                        <Users size={18} className={iconClasses('/admin/usuarios')} />
                        <span>Gestión de Usuarios</span>
                      </Link>
                    </li>
                  )}
                  {canInvite && (
                    <li>
                      <Link to="/admin/invitaciones" className={linkClasses('/admin/invitaciones')}>
                        <UserPlus size={18} className={iconClasses('/admin/invitaciones')} />
                        <span>Gestión de Invitaciones</span>
                      </Link>
                    </li>
                  )}
                </ul>
              </div>
            )}

            <div>
              <h4 className="text-[13px] font-semibold uppercase tracking-wide text-[#3F7CB8] mb-3 pl-3">
                Proyectos
              </h4>
              <ul className="space-y-3.5">
                <li>
                  <Link to="/dashboard/projects" className={linkClasses('/dashboard/projects')}>
                    <FolderKanban size={18} className={iconClasses('/dashboard/projects')} />
                    <span>Proyectos</span>
                  </Link>
                </li>
                <li>
                  <Link to="/mis-invitaciones" className={linkClasses('/mis-invitaciones')}>
                    <Mail size={18} className={iconClasses('/mis-invitaciones')} />
                    <span>Mis invitaciones</span>
                  </Link>
                </li>
              </ul>
            </div>
          </nav>

          {/* Usuario + cerrar sesión: siempre pegado al fondo */}
          <div className="border-t border-[#E2E5EA] pt-3 mt-3 shrink-0">
            {user && (
  <div className="flex items-center gap-2.5 px-2 py-2 mb-1">
    {user.profile_picture_url ? (
      <img
        src={user.profile_picture_url}
        alt={user.name}
        className="w-8 h-8 rounded-full object-cover shrink-0"
      />
    ) : (
      <div className="w-8 h-8 rounded-full bg-[#0056b3] text-white flex items-center justify-center text-[13px] font-semibold shrink-0">
        {user?.name?.charAt(0).toUpperCase() || 'U'}
      </div>
    )}
    <div className="min-w-0">
      <p className="text-[13px] font-medium text-[#1C2430] truncate">{user?.name || 'Usuario'}</p>
      <p className="text-[12px] text-[#8B93A1] truncate">{user?.email || ''}</p>
    </div>
  </div>
)}
            <button
              onClick={handleLogout}
              className="w-full text-left text-[#5B6472] hover:text-red-600 text-[14px] px-3 py-2.5 rounded-lg hover:bg-red-50 transition-colors flex items-center gap-3"
            >
              <LogOut size={18} className="text-[#8B93A1]" />
              <span>Cerrar sesión</span>
            </button>
          </div>
        </div>
      </aside>
    </>
  );
};

export default Sidebar;