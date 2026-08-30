// src/components/PageHeader.tsx
import React, { useState, useRef, useEffect } from "react";
import { Search, HelpCircle, Bell, Mail, Check, X, Clock, RefreshCw, User, Settings, LogOut } from "lucide-react";
import { useAuth } from "../context/AuthContext";
import { useInvitations } from "../context/InvitationsContext";
import { useHelp } from "../context/HelpContext";
import MiPerfilModal from "./MiPerfilModal";
import { RoleSummary } from "./RoleSummary";

interface PageHeaderProps {
  title: string;
  subtitle?: string;
}

const PageHeader: React.FC<PageHeaderProps> = ({ title, subtitle }) => {
  const { user, logout } = useAuth();
  const { helpSection } = useHelp();
  const {
    invitations,
    loading: loadingNotifications,
    respondingId,
    loadInvitations,
    respondInvitation
  } = useInvitations();

  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const [isNotificationsOpen, setIsNotificationsOpen] = useState(false);
  const [isProfileModalOpen, setIsProfileModalOpen] = useState(false);

  
  const menuRef = useRef<HTMLDivElement>(null);
  const notificationsRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      const target = event.target as Node;
      if (menuRef.current && !menuRef.current.contains(target)) {
        setIsMenuOpen(false);
      }
      // El panel de detalle de RoleSummary (varios roles a la vez) vive
      // portado a document.body, NO como descendiente de esta lista —
      // sin este chequeo, abrirlo se veía como un clic "de afuera" y
      // cerraba toda la campanita antes de poder leerlo (mismo bug real
      // ya encontrado y arreglado en RoleDropdown, ColaboradoresTab.tsx).
      const insideRoleSummaryPanel = target instanceof Element && target.closest('[data-role-summary-panel]');
      if (notificationsRef.current && !notificationsRef.current.contains(target) && !insideRoleSummaryPanel) {
        setIsNotificationsOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const fullName = user ? `${user.name}${user.last_name ? ` ${user.last_name}` : ''}` : 'Usuario';

  return (
    <header className="sticky -top-8 -mt-8 -mx-8 z-40 w-[calc(100%+4rem)] bg-white border-b border-gray-200 px-8 py-2.5 flex justify-between items-center">
      <div>
        <h1 className="font-sans text-lg font-bold tracking-tight leading-tight text-slate-600">{title}</h1>
        {subtitle && <p className="text-xs text-gray-500 leading-tight">{subtitle}</p>}
      </div>

      <div className="flex items-center gap-4">
        <button className="text-gray-400 hover:text-gray-600 transition-colors" title="Buscar">
          <Search size={18} />
        </button>

        <button
          onClick={() => window.open(`/ayuda/${helpSection}`, '_blank', 'noopener')}
          className="text-gray-400 hover:text-gray-600 transition-colors"
          title="Ayuda (se abre en una pestaña nueva)"
          data-tour="header-help"
        >
          <HelpCircle size={18} />
        </button>

        {/* ========================== */}
        {/* NOTIFICACIONES */}
        {/* ========================== */}
        <div className="relative" ref={notificationsRef} data-tour="header-notifications">
          <button
            onClick={() => {
              setIsNotificationsOpen(!isNotificationsOpen);
              setIsMenuOpen(false);
            }}
            className="relative text-gray-400 hover:text-gray-600 transition-colors"
            title="Notificaciones"
          >
            <Bell size={18} />
            {invitations.length > 0 && (
              <span className="absolute -top-1.5 -right-1.5 bg-red-500 text-white text-[10px] font-bold rounded-full w-4 h-4 flex items-center justify-center">
                {invitations.length > 9 ? "9+" : invitations.length}
              </span>
            )}
          </button>

          {isNotificationsOpen && (
            <div className="absolute right-0 mt-3 w-96 bg-white border border-gray-200 rounded-xl shadow-xl z-50 overflow-hidden">
              <div className="flex items-center justify-between px-4 py-3 border-b border-gray-100">
                <div>
                  <h3 className="font-semibold text-gray-800">Notificaciones</h3>
                  <p className="text-xs text-gray-500">
                    {invitations.length === 0
                      ? "No tienes notificaciones"
                      : `${invitations.length} invitaciones pendientes`}
                  </p>
                </div>
                <button
                  onClick={loadInvitations}
                  className="text-gray-400 hover:text-[#0056b3] transition-colors"
                  title="Actualizar"
                >
                  <RefreshCw size={16} className={loadingNotifications ? "animate-spin" : ""} />
                </button>
              </div>

              <div className="max-h-[400px] overflow-y-auto">
                {loadingNotifications ? (
                  <div className="py-10 text-center text-gray-400">
                    <RefreshCw size={24} className="animate-spin mx-auto mb-2" />
                    <p className="text-sm">Cargando...</p>
                  </div>
                ) : invitations.length === 0 ? (
                  <div className="py-10 text-center text-gray-400">
                    <Bell size={32} className="mx-auto mb-2 opacity-40" />
                    <p className="text-sm">No tienes notificaciones nuevas</p>
                  </div>
                ) : (
                  invitations.map((inv) => (
                    <div key={inv.invitation_id} className="p-4 border-b border-gray-100 hover:bg-gray-50 transition-colors">
                      <div className="flex gap-3">
                        <div className="w-9 h-9 bg-blue-100 rounded-full flex items-center justify-center shrink-0">
                          <Mail size={17} className="text-[#0056b3]" />
                        </div>
                        <div className="flex-1">
                          <p className="text-sm font-semibold text-gray-800">Invitación a proyecto</p>
                          <p className="text-sm text-gray-600 mt-1">
                            <span className="font-medium">{inv.host_name}</span> te invitó al proyecto
                          </p>
                          <p className="text-sm font-semibold text-[#0056b3] mt-1">
                            {inv.project.project_name}
                          </p>
                          <p className="text-xs text-gray-500 mt-1">
                            Rol:{' '}
                            <RoleSummary
                              isAdmin={inv.is_admin}
                              moduleRoles={inv.module_roles}
                              adminLabel="Administrador del proyecto"
                            />
                          </p>
                          <p className="text-xs text-gray-400 mt-2 flex items-center gap-1">
                            <Clock size={12} />
                            Expira: {new Date(inv.expires_at).toLocaleDateString()}
                          </p>

                          <div className="flex gap-2 mt-3">
                            <button
                              onClick={() =>
                                respondInvitation(inv.project.project_id, inv.invitation_id, "rechazado")
                              }
                              disabled={respondingId === inv.invitation_id}
                              className="px-3 py-1.5 text-xs border border-gray-300 text-gray-600 rounded-lg hover:bg-gray-100 flex items-center gap-1 disabled:opacity-50"
                            >
                              <X size={14} /> Rechazar
                            </button>
                            <button
                              onClick={() =>
                                respondInvitation(inv.project.project_id, inv.invitation_id, "aceptado")
                              }
                              disabled={respondingId === inv.invitation_id}
                              className="px-3 py-1.5 text-xs bg-[#0056b3] text-white rounded-lg hover:bg-[#004494] flex items-center gap-1 disabled:opacity-50"
                            >
                              <Check size={14} /> Aceptar
                            </button>
                          </div>
                        </div>
                      </div>
                    </div>
                  ))
                )}
              </div>
            </div>
          )}
        </div>

        {/* ========================== */}
        {/* USUARIO */}
        {/* ========================== */}
        <div className="relative" ref={menuRef} data-tour="header-profile">
          <button
            onClick={() => {
              setIsMenuOpen(!isMenuOpen);
              setIsNotificationsOpen(false);
            }}
            className="flex items-center gap-2 pl-1.5 pr-3 py-1 bg-blue-50 hover:bg-blue-100 rounded-full transition-colors duration-200 border border-blue-200"
          >
            {user?.profile_picture_url ? (
              <img
                src={user.profile_picture_url}
                alt={fullName}
                className="w-7 h-7 rounded-full object-cover"
              />
            ) : (
              <div className="w-7 h-7 bg-blue-500 rounded-full flex items-center justify-center text-white text-sm font-semibold">
                {user?.name?.charAt(0).toUpperCase() || "U"}
              </div>
            )}
            <span className="text-sm font-medium text-gray-700">{fullName}</span>
            <svg
              className={`w-3.5 h-3.5 text-gray-500 transition-transform ${isMenuOpen ? "rotate-180" : ""}`}
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
            </svg>
          </button>

          {/* Mismo lenguaje visual que el resto de la app (Invitations,
              AdminUsers, el menú de perfil de DashboardProjects): card
              rounded-2xl con ring sutil, avatar con ring blanco, badge de
              rol, íconos de lucide en vez de emojis. */}
          {isMenuOpen && (
            <div className="absolute right-0 mt-2 w-72 bg-white rounded-2xl shadow-xl ring-1 ring-black/5 border border-gray-100 py-5 px-5 z-50 animate-fadeInUp">
              <div className="flex items-center gap-4 mb-4">
                {user?.profile_picture_url ? (
                  <img
                    src={user.profile_picture_url}
                    alt={fullName}
                    className="w-14 h-14 rounded-full object-cover ring-2 ring-white shadow-sm flex-shrink-0"
                  />
                ) : (
                  <div className="w-14 h-14 rounded-full bg-[#0056b3] text-white flex items-center justify-center text-xl font-bold ring-2 ring-white shadow-sm flex-shrink-0">
                    {user?.name?.charAt(0).toUpperCase() || "U"}
                  </div>
                )}
                <div className="min-w-0">
                  <p className="font-bold text-base text-gray-800 truncate">{user?.name || "Usuario"}</p>
                  <p className="text-xs text-gray-400 truncate">{user?.email || "Sin email"}</p>
                </div>
              </div>

              {user?.role && (
                <div className="mb-4">
                  <span className="inline-flex items-center px-2.5 py-1 rounded-full text-[11px] font-semibold bg-blue-50 text-[#0056b3] ring-1 ring-blue-200">
                    {user.role}
                  </span>
                </div>
              )}

              <div className="border-t border-gray-100 pt-2 space-y-0.5">
                <button
                  onClick={() => { setIsMenuOpen(false); setIsProfileModalOpen(true); }}
                  className="w-full text-left px-3 py-2.5 text-gray-700 hover:bg-gray-50 rounded-xl flex items-center gap-2.5 text-sm font-medium transition-colors"
                >
                  <User size={16} className="text-gray-400" />
                  Mi Perfil
                </button>
                <button
                  onClick={() => setIsMenuOpen(false)}
                  className="w-full text-left px-3 py-2.5 text-gray-700 hover:bg-gray-50 rounded-xl flex items-center gap-2.5 text-sm font-medium transition-colors"
                >
                  <Settings size={16} className="text-gray-400" />
                  Configuración
                </button>
              </div>

              <div className="border-t border-gray-100 pt-2 mt-2">
                <button
                  onClick={() => { setIsMenuOpen(false); logout(); }}
                  className="w-full text-left px-3 py-2.5 text-red-600 hover:bg-red-50 rounded-xl flex items-center gap-2.5 text-sm font-semibold transition-colors"
                >
                  <LogOut size={16} />
                  Cerrar sesión
                </button>
              </div>
            </div>
          )}
        </div>
      </div>

      <style>{`
        @keyframes fadeInUp {
          from { opacity: 0; transform: translateY(6px); }
          to { opacity: 1; transform: translateY(0); }
        }
        .animate-fadeInUp { animation: fadeInUp 0.18s ease-out; }
      `}</style>

      <MiPerfilModal isOpen={isProfileModalOpen} onClose={() => setIsProfileModalOpen(false)} />
    </header>
  );
};

export default PageHeader;