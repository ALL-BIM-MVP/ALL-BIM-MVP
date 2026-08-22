// src/components/tabs/ColaboradoresTab.tsx

import React, { useState, useEffect, useRef, useCallback, useMemo } from "react";
import {
  Plus, Trash2, X, Check, Users, CheckCircle,
  Mail, Send, RefreshCw, Clock, Search, AlertCircle,
  Crown, Shield, AtSign,
} from 'lucide-react';
import { useProjectInvitations } from '../../hooks/useProjectInvitations';
import { getModules, getModuleRoles } from '../../services/module.service';
import type { ModuleCatalogItem, ModuleRoleOption } from '../../services/module.service';
import type { UserSearchResult, ProjectMember } from '../../types/invitation.types';
import { resolveMediaUrl } from '../../utils/media';

interface ColaboradoresTabProps {
  onClose: () => void;
  projectId: number;
}

const AVATAR_PALETTE = [
  { bg: 'bg-blue-100', text: 'text-blue-600' },
  { bg: 'bg-purple-100', text: 'text-purple-600' },
  { bg: 'bg-emerald-100', text: 'text-emerald-600' },
  { bg: 'bg-amber-100', text: 'text-amber-600' },
  { bg: 'bg-pink-100', text: 'text-pink-600' },
  { bg: 'bg-cyan-100', text: 'text-cyan-600' },
  { bg: 'bg-indigo-100', text: 'text-indigo-600' },
  { bg: 'bg-teal-100', text: 'text-teal-600' },
];

function getInitial(name?: string, email?: string): string {
  const source = name?.trim() || email?.trim() || '?';
  return source.charAt(0).toUpperCase();
}

function getAvatarColor(seed: string): { bg: string; text: string } {
  let hash = 0;
  for (let i = 0; i < seed.length; i++) hash = (hash * 31 + seed.charCodeAt(i)) >>> 0;
  return AVATAR_PALETTE[hash % AVATAR_PALETTE.length];
}

function fullName(name?: string, lastName?: string | null): string {
  return `${name || ''}${lastName ? ` ${lastName}` : ''}`.trim();
}

const MemberAvatar: React.FC<{ name?: string; email?: string; photoUrl?: string | null; size?: 'sm' | 'md' }> = ({ name, email, photoUrl, size = 'sm' }) => {
  const dims = size === 'md' ? 'w-9 h-9 text-sm' : 'w-8 h-8 text-sm';
  if (photoUrl) {
    return (
      <img
        src={resolveMediaUrl(photoUrl)}
        alt={name || email}
        className={`${dims} rounded-full object-cover ring-2 ring-white shadow-sm flex-shrink-0`}
      />
    );
  }
  const colors = getAvatarColor(name || email || '?');
  return (
    <div className={`${dims} rounded-full ${colors.bg} ${colors.text} flex items-center justify-center font-semibold ring-2 ring-white shadow-sm flex-shrink-0`}>
      {getInitial(name, email)}
    </div>
  );
};

const ColaboradoresTab: React.FC<ColaboradoresTabProps> = ({ onClose, projectId }) => {
  const {
    invitations,
    members,
    loading: invitationsLoading,
    error: invitationsError,
    loadInvitations,
    searchUsers,
    createInvitation,
    cancelInvitation,
    isOwner,
    isAdmin,
    checkingOwner,
  } = useProjectInvitations(projectId);

  const canManage = (isOwner || isAdmin) && !checkingOwner;

  const [modules, setModules] = useState<ModuleCatalogItem[]>([]);
  const [modulesLoading, setModulesLoading] = useState(true);
  const [moduleRolesByCode, setModuleRolesByCode] = useState<Record<string, ModuleRoleOption[]>>({});

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setModulesLoading(true);
      try {
        const list = await getModules();
        if (cancelled) return;
        setModules(list);

        const activeModules = list.filter((m) => m.is_active);
        const rolesEntries = await Promise.all(
          activeModules.map(async (m) => {
            try {
              const roles = await getModuleRoles(m.code);
              return [m.code, roles] as const;
            } catch {
              return [m.code, []] as const;
            }
          })
        );
        if (cancelled) return;
        setModuleRolesByCode(Object.fromEntries(rolesEntries));
      } catch (err) {
        console.error('Error cargando catálogo de módulos:', err);
      } finally {
        if (!cancelled) setModulesLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, []);

  const [inviteEmail, setInviteEmail] = useState('');
  const [inviteIsAdmin, setInviteIsAdmin] = useState(false);
  const [inviteModuleRoles, setInviteModuleRoles] = useState<Record<string, number>>({});
  const [searchUserQuery, setSearchUserQuery] = useState('');
  const [searchUserResults, setSearchUserResults] = useState<UserSearchResult[]>([]);
  const [showUserSearch, setShowUserSearch] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [selectedUser, setSelectedUser] = useState<UserSearchResult | null>(null);
  const [isSearching, setIsSearching] = useState(false);
  const [showSuccessMessage, setShowSuccessMessage] = useState(false);
  const [successMessage, setSuccessMessage] = useState('');
  const [successType, setSuccessType] = useState<'success' | 'error' | 'info'>('success');
  const searchTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const messageTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const searchBoxRef = useRef<HTMLDivElement>(null);

  const showMessage = (message: string, type: 'success' | 'error' | 'info' = 'success') => {
    if (messageTimeoutRef.current) clearTimeout(messageTimeoutRef.current);
    setSuccessMessage(message);
    setSuccessType(type);
    setShowSuccessMessage(true);
    messageTimeoutRef.current = setTimeout(() => setShowSuccessMessage(false), 4000);
  };

  useEffect(() => {
    return () => {
      if (messageTimeoutRef.current) clearTimeout(messageTimeoutRef.current);
    };
  }, []);

  useEffect(() => {
    if (searchTimeoutRef.current) clearTimeout(searchTimeoutRef.current);

    if (!searchUserQuery.trim()) {
      setSearchUserResults([]);
      setShowUserSearch(false);
      setIsSearching(false);
      return;
    }

    setIsSearching(true);
    let cancelled = false;
    searchTimeoutRef.current = setTimeout(async () => {
      try {
        const results = await searchUsers('email', searchUserQuery);
        if (cancelled) return;
        setSearchUserResults(results);
        setShowUserSearch(true);
        setIsSearching(false);
      } catch (err: any) {
        if (cancelled) return;
        console.error('Error searching users:', err);
        setIsSearching(false);
        showMessage(err.message || 'Error al buscar usuarios', 'error');
      }
    }, 300);

    return () => {
      cancelled = true;
      if (searchTimeoutRef.current) clearTimeout(searchTimeoutRef.current);
    };
  }, [searchUserQuery, searchUsers]);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (searchBoxRef.current && !searchBoxRef.current.contains(event.target as Node)) {
        setShowUserSearch(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  useEffect(() => {
    const handleEscape = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return;
      if (showUserSearch) setShowUserSearch(false);
    };
    document.addEventListener('keydown', handleEscape);
    return () => document.removeEventListener('keydown', handleEscape);
  }, [showUserSearch]);

  const handleSearchFocus = async () => {
    if (!searchUserQuery.trim()) {
      setIsSearching(true);
      try {
        const results = await searchUsers('email', '');
        setSearchUserResults(results);
        setShowUserSearch(true);
        setIsSearching(false);
      } catch (err: any) {
        console.error('Error loading recommended users:', err);
        setIsSearching(false);
        showMessage(err.message || 'Error al cargar usuarios recomendados', 'error');
      }
    }
  };

  const handleSelectUser = (user: UserSearchResult) => {
    setSelectedUser(user);
    setInviteEmail(user.email);
    setSearchUserQuery(fullName(user.name, user.last_name));
    setShowUserSearch(false);
    setSearchUserResults([]);
    showMessage(`Usuario seleccionado: ${fullName(user.name, user.last_name)}`, 'success');
  };

  const handleClearSelectedUser = () => {
    setSelectedUser(null);
    setInviteEmail('');
    setSearchUserQuery('');
    setShowUserSearch(false);
    setSearchUserResults([]);
    setInviteModuleRoles({});
    setInviteIsAdmin(false);
  };

  const handleModuleRoleChange = (moduleCode: string, moduleRoleId: number) => {
    setInviteModuleRoles((prev) => ({ ...prev, [moduleCode]: moduleRoleId }));
  };

  const hasAnyModuleRoleSelected = Object.values(inviteModuleRoles).some((id) => id > 0);
  const isInviteReady = inviteIsAdmin || hasAnyModuleRoleSelected;
  const isInviteButtonEnabled = selectedUser !== null && isInviteReady && !submitting;

  const handleSendInvitation = async () => {
    if (!selectedUser) {
      showMessage('Por favor, selecciona un usuario de la lista', 'error');
      return;
    }
    if (!isInviteReady) {
      showMessage('Marcá "Administrador" o seleccioná al menos un rol de módulo', 'error');
      return;
    }

    const moduleRolesPayload = Object.entries(inviteModuleRoles)
      .filter(([, id]) => id > 0)
      .map(([module_code, module_role_id]) => ({ module_code, module_role_id }));

    setSubmitting(true);
    try {
      await createInvitation(inviteEmail, inviteIsAdmin, moduleRolesPayload);
      handleClearSelectedUser();
      setShowSuccessMessage(false);
      showMessage('✅ Invitación enviada exitosamente', 'success');
    } catch (err: any) {
      showMessage(err.message || 'Error al enviar invitación', 'error');
    } finally {
      setSubmitting(false);
    }
  };

  const handleCancelInvitation = async (invitationId: number) => {
    if (!window.confirm('¿Estás seguro de cancelar esta invitación?')) return;
    try {
      await cancelInvitation(invitationId);
      showMessage('✅ Invitación cancelada', 'success');
    } catch (err: any) {
      showMessage(err.message || 'Error al cancelar invitación', 'error');
    }
  };

  const getStatusBadge = (status: string) => {
    const styles: Record<string, string> = {
      pendiente: 'bg-yellow-100 text-yellow-700',
      aceptado: 'bg-green-100 text-green-700',
      rechazado: 'bg-red-100 text-red-700',
      cancelado: 'bg-gray-100 text-gray-700',
      expirado: 'bg-red-100 text-red-700'
    };
    return styles[status] || 'bg-gray-100 text-gray-700';
  };

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'pendiente': return <Clock size={14} className="text-yellow-600" />;
      case 'aceptado': return <Check size={14} className="text-green-600" />;
      case 'rechazado':
      case 'expirado': return <X size={14} className="text-red-600" />;
      default: return null;
    }
  };

  function roleLabel(opts: { isOwner?: boolean; isAdmin: boolean; moduleRoles: { module_name: string; role_name: string }[] }): string {
    if (opts.isOwner) return 'Owner';
    if (opts.isAdmin) return 'Administrador';
    if (opts.moduleRoles.length === 0) return 'Sin rol asignado';
    const [first, ...rest] = opts.moduleRoles;
    const base = `${first.module_name}: ${first.role_name}`;
    return rest.length > 0 ? `${base} +${rest.length}` : base;
  }

  function roleBadgeColor(opts: { isOwner?: boolean; isAdmin: boolean }): string {
    if (opts.isOwner) return 'text-amber-700 bg-amber-100';
    if (opts.isAdmin) return 'text-purple-700 bg-purple-100';
    return 'text-blue-700 bg-blue-100';
  }

  const invitationsPendientes = useMemo(
    () => invitations.filter((i) => i.status === 'pendiente'),
    [invitations]
  );

  const activeModules = modules.filter((m) => m.is_active);
  const inactiveModules = modules.filter((m) => !m.is_active);

  return (
    <div className="relative flex items-center justify-center min-h-[600px] w-full overflow-hidden">
      <div
        className="absolute inset-0 pointer-events-none"
        style={{
          backgroundImage:
            'linear-gradient(to right, rgba(0,86,179,0.06) 1px, transparent 1px), linear-gradient(to bottom, rgba(0,86,179,0.06) 1px, transparent 1px)',
          backgroundSize: '32px 32px',
        }}
      />

      <div className="relative z-10 bg-white/95 backdrop-blur-md rounded-md border border-gray-200/70 p-10 max-w-5xl w-full">

        <style>{`
          @keyframes fadeInUp {
            from { opacity: 0; transform: translateY(10px); }
            to { opacity: 1; transform: translateY(0); }
          }
          @keyframes spin {
            from { transform: rotate(0deg); }
            to { transform: rotate(360deg); }
          }
          @keyframes slideDown {
            from { opacity: 0; max-height: 0; }
            to { opacity: 1; max-height: 300px; }
          }
          .animate-fadeInUp { animation: fadeInUp 0.3s ease-out; }
          .animate-spin { animation: spin 1s linear infinite; }
          .animate-slideDown { animation: slideDown 0.3s ease-out; }
        `}</style>

        <div className="flex items-center justify-between mb-6 pb-5 border-b border-gray-100">
          <div className="flex items-start gap-3.5 border-l-[3px] border-[#0056b3] pl-4">
            <div className="w-10 h-10 rounded-md bg-[#0056b3] flex items-center justify-center flex-shrink-0 mt-0.5">
              <Users size={18} className="text-white" />
            </div>
            <div>
              <p className="text-[10px] font-bold text-[#0056b3] uppercase tracking-wider mb-0.5">
                Gestión de equipo
              </p>
              <div className="flex items-center gap-2.5">
                <h2 className="text-xl leading-none">
                  <span className="font-bold text-gray-800">Colaboradores</span>
                </h2>
                {isOwner && !checkingOwner && (
                  <span className="flex items-center gap-1.5 px-3 py-1 bg-amber-50 text-amber-700 ring-1 ring-inset ring-amber-200 rounded-md text-xs font-semibold">
                    <Crown size={13} />
                    Owner
                  </span>
                )}
                {!isOwner && isAdmin && !checkingOwner && (
                  <span className="flex items-center gap-1.5 px-3 py-1 bg-purple-50 text-purple-700 ring-1 ring-inset ring-purple-200 rounded-md text-xs font-semibold">
                    <Shield size={13} />
                    Administrador
                  </span>
                )}
              </div>
            </div>
          </div>
          <button
            onClick={onClose}
            aria-label="Cerrar panel de colaboradores"
            className="w-9 h-9 flex items-center justify-center text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-md transition-colors"
          >
            <X size={20} />
          </button>
        </div>

        {showSuccessMessage && (
          <div className={`mb-4 p-3.5 border rounded-md flex items-center gap-2.5 shadow-sm animate-slideDown ${
            successType === 'success' ? 'bg-green-50 border-green-200 text-green-700' :
            successType === 'error' ? 'bg-red-50 border-red-200 text-red-700' :
            'bg-blue-50 border-blue-200 text-blue-700'
          }`}>
            {successType === 'success' && <CheckCircle size={18} className="shrink-0" />}
            {successType === 'error' && <AlertCircle size={18} className="shrink-0" />}
            {successType === 'info' && <Users size={18} className="shrink-0" />}
            <span className="text-sm font-medium">{successMessage}</span>
          </div>
        )}

        {canManage && (
          <>
            <div className="bg-gray-50/70 rounded-md p-5 mb-6 border border-gray-100 shadow-sm">
              <div className="flex flex-wrap items-end gap-4">

                <div className="flex-1 min-w-[240px]" ref={searchBoxRef}>
                  <label className="block text-xs font-semibold text-gray-600 uppercase tracking-wide mb-1.5">
                    Buscar usuario <span className="text-red-500">*</span>
                  </label>
                  <div className="relative">
                    <div className="flex items-center border border-gray-200 rounded-md shadow-sm focus-within:ring-2 focus-within:ring-[#0056b3] focus-within:border-[#0056b3] bg-white transition-shadow">
                      <Search size={18} className="ml-3.5 text-gray-400" />
                      <input
                        type="text"
                        placeholder="Escribe para buscar por nombre o correo..."
                        value={searchUserQuery}
                        onChange={(e) => setSearchUserQuery(e.target.value)}
                        onFocus={handleSearchFocus}
                        className="flex-1 px-3 py-2.5 outline-none text-sm bg-transparent"
                      />
                      {isSearching && (
                        <RefreshCw size={16} className="mr-3 text-gray-400 animate-spin" />
                      )}
                      {selectedUser && (
                        <button
                          onClick={handleClearSelectedUser}
                          aria-label="Quitar usuario seleccionado"
                          className="mr-2 p-1 text-gray-400 hover:text-red-500 rounded-md hover:bg-gray-100"
                        >
                          <X size={16} />
                        </button>
                      )}
                    </div>

                    {showUserSearch && (
                      <div className="absolute left-0 right-0 mt-2 border border-gray-100 rounded-md max-h-48 overflow-y-auto bg-white shadow-xl ring-1 ring-black/5 z-20">
                        {searchUserResults.length === 0 ? (
                          <div className="p-4 text-center text-sm text-gray-400">
                            {searchUserQuery.trim() ? 'No se encontraron usuarios' : 'Escribe para buscar usuarios'}
                          </div>
                        ) : (
                          searchUserResults.map((u) => (
                            <button
                              key={u.user_id}
                              onClick={() => handleSelectUser(u)}
                              className={`w-full text-left p-3 hover:bg-blue-50/70 transition-colors border-b border-gray-100 last:border-0 flex items-center gap-3 ${
                                selectedUser?.user_id === u.user_id ? 'bg-blue-50/70' : ''
                              }`}
                            >
                              <MemberAvatar name={fullName(u.name, u.last_name)} email={u.email} photoUrl={u.profile_picture_url} />
                              <div className="flex-1">
                                <p className="text-sm font-medium text-gray-700">{fullName(u.name, u.last_name)}</p>
                                <p className="text-xs text-gray-400 flex items-center gap-1">
                                  <AtSign size={12} />
                                  {u.email}
                                </p>
                              </div>
                              {selectedUser?.user_id === u.user_id && (
                                <Check size={18} className="text-[#0056b3]" />
                              )}
                            </button>
                          ))
                        )}
                      </div>
                    )}
                  </div>
                </div>

                <div className="min-w-[180px]">
                  <label className="flex items-center gap-2 px-1 py-2.5 cursor-pointer select-none">
                    <input
                      type="checkbox"
                      checked={inviteIsAdmin}
                      onChange={(e) => setInviteIsAdmin(e.target.checked)}
                      className="w-4 h-4 rounded border-gray-300 text-[#0056b3] focus:ring-[#0056b3]"
                    />
                    <span className="text-sm font-medium text-gray-700">Administrador</span>
                  </label>
                </div>

                <div className="min-w-[180px]">
                  <button
                    onClick={handleSendInvitation}
                    disabled={!isInviteButtonEnabled}
                    className={`w-full px-6 py-2.5 rounded-md text-sm font-semibold flex items-center justify-center gap-2 transition-all ${
                      isInviteButtonEnabled
                        ? 'bg-[#0056b3] text-white shadow-md shadow-blue-900/15 hover:bg-[#004494] hover:-translate-y-0.5 hover:shadow-lg cursor-pointer'
                        : 'bg-gray-200 text-gray-400 cursor-not-allowed'
                    }`}
                  >
                    <Send size={16} />
                    {submitting ? 'Enviando...' : 'Invitar colaborador'}
                  </button>
                </div>
              </div>

              {!inviteIsAdmin && (
                <div className="mt-4 pt-4 border-t border-gray-100">
                  <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2.5">
                    Rol por módulo
                  </p>
                  {modulesLoading ? (
                    <p className="text-sm text-gray-400">Cargando módulos...</p>
                  ) : (
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                      {activeModules.map((m) => (
                        <div key={m.code} className="flex items-center justify-between gap-3 bg-white border border-gray-200 rounded-md px-3 py-2">
                          <span className="text-sm text-gray-700 font-medium">{m.name}</span>
                          <select
                            value={inviteModuleRoles[m.code] ?? 0}
                            onChange={(e) => handleModuleRoleChange(m.code, Number(e.target.value))}
                            className="px-2 py-1.5 border border-gray-200 rounded-md text-sm outline-none focus:ring-2 focus:ring-[#0056b3] bg-white"
                          >
                            <option value={0}>Solo ver (defecto)</option>
                            {(moduleRolesByCode[m.code] ?? []).map((role) => (
                              <option key={role.module_role_id} value={role.module_role_id}>
                                {role.name}
                              </option>
                            ))}
                          </select>
                        </div>
                      ))}
                      {inactiveModules.map((m) => (
                        <div key={m.code} className="flex items-center justify-between gap-3 bg-gray-50 border border-gray-200 rounded-md px-3 py-2 opacity-60">
                          <span className="text-sm text-gray-500 font-medium">{m.name}</span>
                          <span className="text-xs text-gray-400 italic">módulo inactivo</span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}

              {selectedUser && (
                <div className="mt-3 p-3 bg-gradient-to-r from-blue-50 to-blue-50/40 border border-blue-100 rounded-md flex items-center justify-between shadow-sm animate-slideDown">
                  <div className="flex items-center gap-3">
                    <MemberAvatar name={fullName(selectedUser.name, selectedUser.last_name)} email={selectedUser.email} photoUrl={selectedUser.profile_picture_url} />
                    <div>
                      <p className="text-sm font-medium text-gray-700">{fullName(selectedUser.name, selectedUser.last_name)}</p>
                      <p className="text-xs text-gray-500">{selectedUser.email}</p>
                    </div>
                  </div>
                  <Check size={20} className="text-green-500" />
                </div>
              )}

              <div className="flex items-center gap-1.5 text-xs text-gray-400 mt-2.5">
                {!selectedUser && (
                  <>
                    <AlertCircle size={13} className="text-gray-400 shrink-0" />
                    Selecciona un usuario para continuar
                  </>
                )}
                {selectedUser && !isInviteReady && (
                  <>
                    <AlertCircle size={13} className="text-amber-500 shrink-0" />
                    Marcá "Administrador" o seleccioná al menos un rol de módulo
                  </>
                )}
                {selectedUser && isInviteReady && (
                  <>
                    <CheckCircle size={13} className="text-green-500 shrink-0" />
                    Listo para enviar la invitación
                  </>
                )}
              </div>
            </div>

            <div className="bg-gray-50/70 rounded-md p-4 mb-6 border border-gray-100 shadow-sm">
              <div className="flex items-center gap-2">
                <span className="text-sm text-gray-500">
                  {invitationsPendientes?.length ?? 0} invitaciones pendientes
                </span>
                <button
                  onClick={loadInvitations}
                  aria-label="Actualizar invitaciones"
                  className="text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-md p-1 ml-1 transition-colors"
                  disabled={invitationsLoading}
                >
                  <RefreshCw size={16} className={invitationsLoading ? 'animate-spin' : ''} />
                </button>
              </div>
            </div>

            <div className="bg-white rounded-md overflow-hidden border border-gray-100 shadow-sm ring-1 ring-black/5 mb-6">
              <div className="px-6 py-4 border-b border-gray-100 flex items-center justify-between">
                <h3 className="font-semibold text-gray-800">
                  Invitaciones Pendientes
                  <span className="ml-2 text-sm font-normal text-gray-400 bg-gray-100 px-2 py-0.5 rounded-md">
                    {invitationsPendientes?.length ?? 0}
                  </span>
                </h3>
              </div>

              {invitationsLoading ? (
                <div className="text-center py-10">
                  <RefreshCw size={22} className="animate-spin mx-auto text-[#0056b3]" />
                  <p className="mt-2 text-sm text-gray-400">Cargando invitaciones...</p>
                </div>
              ) : invitationsError ? (
                <div className="text-center py-10 text-red-500">
                  <AlertCircle size={22} className="mx-auto mb-2" />
                  <p className="text-sm">{invitationsError}</p>
                  <button onClick={loadInvitations} className="mt-2 text-sm text-[#0056b3] hover:underline font-medium">
                    Reintentar
                  </button>
                </div>
              ) : invitationsPendientes?.length === 0 ? (
                <div className="text-center py-10 text-gray-400">
                  <span className="inline-flex items-center justify-center w-12 h-12 rounded-full bg-gray-50 mb-2">
                    <Mail size={22} className="opacity-50" />
                  </span>
                  <p className="text-sm">No hay invitaciones pendientes</p>
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead className="bg-gray-50 border-b border-gray-100">
                      <tr>
                        <th className="px-6 py-3 text-left text-[11px] font-semibold text-gray-500 uppercase tracking-wider">Correo</th>
                        <th className="px-6 py-3 text-left text-[11px] font-semibold text-gray-500 uppercase tracking-wider">Rol</th>
                        <th className="px-6 py-3 text-left text-[11px] font-semibold text-gray-500 uppercase tracking-wider">Estado</th>
                        <th className="px-6 py-3 text-left text-[11px] font-semibold text-gray-500 uppercase tracking-wider">Invitado por</th>
                        <th className="px-6 py-3 text-left text-[11px] font-semibold text-gray-500 uppercase tracking-wider">Expira</th>
                        <th className="px-6 py-3 text-right text-[11px] font-semibold text-gray-500 uppercase tracking-wider">Acciones</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-100">
                      {invitationsPendientes.map((inv) => (
                        <tr key={inv.invitation_id} className="hover:bg-blue-50/30 transition-colors">
                          <td className="px-6 py-3 font-medium text-gray-700">
                            <div className="flex items-center gap-2.5">
                              <MemberAvatar email={inv.email} />
                              {inv.email}
                            </div>
                          </td>
                          <td className="px-6 py-3">
                            <span className={`px-2.5 py-1 rounded-md text-xs font-medium ring-1 ring-inset ring-black/5 ${roleBadgeColor({ isAdmin: inv.is_admin })}`}>
                              {roleLabel({ isAdmin: inv.is_admin, moduleRoles: inv.module_roles })}
                            </span>
                          </td>
                          <td className="px-6 py-3">
                            <span className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-md text-xs font-medium ring-1 ring-inset ring-black/5 ${getStatusBadge(inv.status)}`}>
                              {getStatusIcon(inv.status)}
                              <span className="ml-1 capitalize">{inv.status}</span>
                            </span>
                          </td>
                          <td className="px-6 py-3 text-sm text-gray-600">
                            {fullName(inv.host?.user_name, inv.host?.user_last_name) || 'Desconocido'}
                          </td>
                          <td className="px-6 py-3 text-sm text-gray-600">
                            {new Date(inv.expires_at).toLocaleDateString()}
                          </td>
                          <td className="px-6 py-3 text-right">
                            <button
                              onClick={() => handleCancelInvitation(inv.invitation_id)}
                              className="text-red-500 hover:text-red-700 hover:bg-red-50 text-sm font-medium flex items-center gap-1 ml-auto px-2 py-1 rounded-md transition-colors"
                            >
                              <Trash2 size={14} /> Cancelar
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </>
        )}

        <div className="bg-white rounded-md overflow-hidden border border-gray-100 shadow-sm ring-1 ring-black/5">
          <div className="px-6 py-4 border-b border-gray-100">
            <h3 className="font-semibold text-gray-800">
              Lista de Miembros
              <span className="ml-2 text-sm font-normal text-gray-400 bg-gray-100 px-2 py-0.5 rounded-md">
                {members?.length ?? 0}
              </span>
            </h3>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 border-b border-gray-100">
                <tr>
                  <th className="px-6 py-3 text-left text-[11px] font-semibold text-gray-500 uppercase tracking-wider">Miembro</th>
                  <th className="px-6 py-3 text-left text-[11px] font-semibold text-gray-500 uppercase tracking-wider">Rol</th>
                  <th className="px-6 py-3 text-left text-[11px] font-semibold text-gray-500 uppercase tracking-wider">Email</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {!members || members.length === 0 ? (
                  <tr>
                    <td colSpan={3} className="px-6 py-10 text-center text-gray-400 text-sm">
                      No hay miembros registrados
                    </td>
                  </tr>
                ) : (
                  members.map((member: ProjectMember) => (
                    <tr key={member.project_member_id ?? `owner-${member.user_id}`} className="hover:bg-blue-50/30 transition-colors">
                      <td className="px-6 py-3 font-medium text-gray-700">
                        <div className="flex items-center gap-2.5">
                          <MemberAvatar
                            name={fullName(member.user_name, member.user_last_name)}
                            email={member.user_email}
                            photoUrl={member.profile_picture_url}
                            size="md"
                          />
                          {fullName(member.user_name, member.user_last_name)}
                          {member.is_me && <span className="text-xs text-gray-400 font-normal">(vos)</span>}
                        </div>
                      </td>
                      <td className="px-6 py-3">
                        <span className={`px-2.5 py-1 rounded-md text-xs font-medium ring-1 ring-inset ring-black/5 ${roleBadgeColor({ isOwner: member.is_owner, isAdmin: member.is_admin })}`}>
                          {roleLabel({ isOwner: member.is_owner, isAdmin: member.is_admin, moduleRoles: member.module_roles })}
                        </span>
                      </td>
                      <td className="px-6 py-3 text-sm text-gray-600">{member.user_email}</td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>

      </div>
    </div>
  );
};

export default ColaboradoresTab;