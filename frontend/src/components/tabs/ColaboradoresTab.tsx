// src/components/tabs/ColaboradoresTab.tsx

import React, { useState, useEffect, useRef, useCallback, useMemo } from "react";
import { 
  Plus, Pencil, Trash2, X, Check, Users, CheckCircle, Tag,
  Mail, Send, RefreshCw, Clock, Search, UserPlus, AlertCircle,
  Crown, Shield, AtSign
} from 'lucide-react';
import { useProjectInvitations } from '../../hooks/useProjectInvitations';
import { getProjectRoles, createProjectRole, updateProjectRole, deleteProjectRole } from '../../services/project-roles.service';
import { ProjectRole } from '../../types/project-role.types';

interface ColaboradoresTabProps {
  onClose: () => void;
  projectId: number;
}

interface SearchUserResult {
  user_id: number;
  name: string;
  email: string;
}

const ColaboradoresTab: React.FC<ColaboradoresTabProps> = ({ onClose, projectId }) => {
  // ============ HOOK DE INVITACIONES ============
  const {
    invitations,
     members,
    loading: invitationsLoading,
    error: invitationsError,
    loadInvitations,
    searchUsers,
    createInvitation,
    cancelInvitation,
    isOwner, checkingOwner,
  } = useProjectInvitations(projectId);

  // ============ ESTADOS GENERALES ============
  const [showRoleModal, setShowRoleModal] = useState(false);
  const [showTagsModal, setShowTagsModal] = useState(false);
  const [selectedRoleId, setSelectedRoleId] = useState<number | null>(null);

  // ============ ETIQUETAS = ROLES (ahora reales, vienen del backend) ============
  const [etiquetas, setEtiquetas] = useState<ProjectRole[]>([]);
  const [rolesLoading, setRolesLoading] = useState(true);
  const [rolesError, setRolesError] = useState<string | null>(null);

  const [nuevaEtiqueta, setNuevaEtiqueta] = useState('');
  const [editandoEtiqueta, setEditandoEtiqueta] = useState<number | null>(null);
  const [etiquetaEdit, setEtiquetaEdit] = useState('');
  const [showCreateEtiquetaInput, setShowCreateEtiquetaInput] = useState(false);

  // ============ ESTADOS PARA INVITACIONES ============
  const [inviteEmail, setInviteEmail] = useState('');
  const [inviteRoleId, setInviteRoleId] = useState<number>(0);
  const [searchUserQuery, setSearchUserQuery] = useState('');
  const [searchUserResults, setSearchUserResults] = useState<SearchUserResult[]>([]);
  const [showUserSearch, setShowUserSearch] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [selectedUser, setSelectedUser] = useState<SearchUserResult | null>(null);
  const [isSearching, setIsSearching] = useState(false);
  const [showSuccessMessage, setShowSuccessMessage] = useState(false);
  const [successMessage, setSuccessMessage] = useState('');
  const [successType, setSuccessType] = useState<'success' | 'error' | 'info'>('success');
  const searchTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const messageTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const searchBoxRef = useRef<HTMLDivElement>(null);

  // ============ FUNCIONES PARA MENSAJES ============
  const showMessage = (message: string, type: 'success' | 'error' | 'info' = 'success') => {
    if (messageTimeoutRef.current) clearTimeout(messageTimeoutRef.current);
    setSuccessMessage(message);
    setSuccessType(type);
    setShowSuccessMessage(true);
    messageTimeoutRef.current = setTimeout(() => setShowSuccessMessage(false), 4000);
  };

  // Limpieza de timeouts pendientes al desmontar el componente
  useEffect(() => {
    return () => {
      if (messageTimeoutRef.current) clearTimeout(messageTimeoutRef.current);
    };
  }, []);

  // ============ CARGA DE ROLES (reales, del backend) ============
  const loadRoles = useCallback(async () => {
    setRolesLoading(true);
    setRolesError(null);
    try {
      const roles = await getProjectRoles();
      setEtiquetas(roles);
    } catch (err: any) {
      setRolesError(err.message || 'Error al cargar roles');
      console.error('Error loading roles:', err);
    } finally {
      setRolesLoading(false);
    }
  }, []);

  useEffect(() => {
    loadRoles();
  }, [loadRoles]);

  // ============ FUNCIONES PARA ETIQUETAS (ahora contra el backend) ============
  const handleCrearEtiqueta = async () => {
    const nombre = nuevaEtiqueta.trim();
    if (nombre === '') return;
    const yaExiste = etiquetas.some((e) => e.name.toLowerCase() === nombre.toLowerCase());
    if (yaExiste) {
      showMessage('Ya existe una etiqueta con ese nombre', 'error');
      return;
    }
    try {
      await createProjectRole({ name: nombre });
      setNuevaEtiqueta('');
      setShowCreateEtiquetaInput(false);
      await loadRoles();
      showMessage('Rol creado exitosamente', 'success');
    } catch (err: any) {
      showMessage(err.message || 'Error al crear el rol', 'error');
    }
  };

  const handleEditarEtiqueta = (id: number) => {
    const etiqueta = etiquetas.find(e => e.project_role_id === id);
    if (etiqueta) {
      setEditandoEtiqueta(id);
      setEtiquetaEdit(etiqueta.name);
    }
  };

  const handleGuardarEdicionEtiqueta = async (id: number) => {
    if (etiquetaEdit.trim() === '') return;
    try {
      await updateProjectRole(id, { name: etiquetaEdit.trim() });
      setEditandoEtiqueta(null);
      setEtiquetaEdit('');
      await loadRoles();
      showMessage('Rol actualizado', 'success');
    } catch (err: any) {
      showMessage(err.message || 'Error al actualizar el rol', 'error');
    }
  };

  const handleCancelarEdicionEtiqueta = () => {
    setEditandoEtiqueta(null);
    setEtiquetaEdit('');
  };

  const handleEliminarEtiqueta = async (id: number) => {
    if (!window.confirm('¿Estás seguro de eliminar esta etiqueta/rol?')) return;
    try {
      await deleteProjectRole(id);
      if (selectedRoleId === id) setSelectedRoleId(null);
      await loadRoles();
      showMessage('Rol eliminado', 'info');
    } catch (err: any) {
      showMessage(err.message || 'Error al eliminar el rol', 'error');
    }
  };

  // ============ FUNCIONES PARA INVITACIONES ============

  // 🔍 BÚSQUEDA AUTOMÁTICA con debounce
  useEffect(() => {
    if (searchTimeoutRef.current) {
      clearTimeout(searchTimeoutRef.current);
    }

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
        if (cancelled) return; // una búsqueda más reciente ya tomó el control
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
      if (searchTimeoutRef.current) {
        clearTimeout(searchTimeoutRef.current);
      }
    };
  }, [searchUserQuery, searchUsers]);

  // Cierra el listado de resultados si se hace clic fuera del buscador
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (searchBoxRef.current && !searchBoxRef.current.contains(event.target as Node)) {
        setShowUserSearch(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // Cierra el modal de etiquetas y el dropdown de búsqueda con la tecla Escape
  useEffect(() => {
    const handleEscape = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return;
      if (showTagsModal) setShowTagsModal(false);
      if (showUserSearch) setShowUserSearch(false);
    };
    document.addEventListener('keydown', handleEscape);
    return () => document.removeEventListener('keydown', handleEscape);
  }, [showTagsModal, showUserSearch]);

  // 👥 USUARIOS RECOMENDADOS al hacer clic en el campo de búsqueda
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

  const handleSelectUser = (user: SearchUserResult) => {
    setSelectedUser(user);
    setInviteEmail(user.email);
    setSearchUserQuery(user.name);
    setShowUserSearch(false);
    setSearchUserResults([]);
    showMessage(`Usuario seleccionado: ${user.name}`, 'success');
  };

  const handleClearSelectedUser = () => {
    setSelectedUser(null);
    setInviteEmail('');
    setSearchUserQuery('');
    setShowUserSearch(false);
    setSearchUserResults([]);
    setInviteRoleId(0);
  };

  const handleSendInvitation = async () => {
    if (!selectedUser) {
      showMessage('Por favor, selecciona un usuario de la lista', 'error');
      return;
    }

    if (!inviteRoleId) {
      showMessage('Selecciona un rol para el usuario', 'error');
      return;
    }

    setSubmitting(true);
    try {
      await createInvitation(inviteEmail, inviteRoleId);
      setInviteEmail('');
      setInviteRoleId(0);
      setSelectedUser(null);
      setSearchUserQuery('');
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

  // ============ UTILITY: ESTADO DE INVITACIÓN ============
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
      case 'pendiente':
        return <Clock size={14} className="text-yellow-600" />;
      case 'aceptado':
        return <Check size={14} className="text-green-600" />;
      case 'rechazado':
      case 'expirado':
        return <X size={14} className="text-red-600" />;
      default:
        return null;
    }
  };

  const getRoleColor = (roleId: number) => {
    const colors: Record<number, string> = {
      1: 'text-purple-700 bg-purple-100',
      2: 'text-blue-700 bg-blue-100',
      3: 'text-indigo-700 bg-indigo-100',
      4: 'text-cyan-700 bg-cyan-100',
      5: 'text-emerald-700 bg-emerald-100',
      6: 'text-amber-700 bg-amber-100',
      7: 'text-orange-700 bg-orange-100',
      8: 'text-pink-700 bg-pink-100',
      9: 'text-teal-700 bg-teal-100',
      10: 'text-gray-700 bg-gray-100',
    };
    return colors[roleId] || 'text-gray-700 bg-gray-100';
  };

  const invitationsPendientes = useMemo(
    () => invitations.filter((i) => i.status === 'pendiente'),
    [invitations]
  );

  // ✅ Botón Invitar se activa SOLO cuando hay usuario seleccionado Y rol seleccionado
  const isInviteButtonEnabled = selectedUser !== null && inviteRoleId > 0 && !submitting;

  return (
    <div className="flex items-center justify-center min-h-[600px] w-full">
      <div className="relative z-10 bg-white/95 backdrop-blur-md rounded-lg shadow-2xl ring-1 ring-black/5 border border-gray-200/70 p-10 max-w-5xl w-full">

        {/* ============ ANIMACIONES BÁSICAS ============ */}
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
            to { opacity: 1; max-height: 200px; }
          }
          @keyframes fadeOut {
            from { opacity: 1; }
            to { opacity: 0; }
          }
          .animate-fadeInUp { animation: fadeInUp 0.3s ease-out; }
          .animate-spin { animation: spin 1s linear infinite; }
          .animate-slideDown { animation: slideDown 0.3s ease-out; }
          .hover-scale { transition: transform 0.2s; }
          .hover-scale:hover { transform: scale(1.02); }
        `}</style>

        {/* ============ HEADER ============ */}
        <div className="flex items-center justify-between mb-6 pb-5 border-b border-gray-100">
          <div className="flex items-center gap-3">
            <span className="hidden sm:flex items-center justify-center w-10 h-10 rounded-md bg-[#0056b3]/10 text-[#0056b3]">
              <Users size={20} />
            </span>
            <h2 className="text-2xl font-bold text-gray-900 tracking-tight">Colaboradores</h2>
            {isOwner && !checkingOwner && (
              <span className="flex items-center gap-1.5 px-3 py-1 bg-amber-50 text-amber-700 ring-1 ring-inset ring-amber-200 rounded-md text-xs font-semibold">
                <Crown size={13} />
                Owner
              </span>
            )}
          </div>
          <button
            onClick={onClose}
            aria-label="Cerrar panel de colaboradores"
            className="w-9 h-9 flex items-center justify-center text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-md transition-colors"
          >
            <X size={20} />
          </button>
        </div>

        {/* ============ MENSAJE DE ÉXITO ============ */}
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

        {/* ============ 🔍 BUSCADOR + ROL + BOTÓN - TODO EN UNA FILA ============ */}
        <div className="bg-gray-50/70 rounded-lg p-5 mb-6 border border-gray-100 shadow-sm">
          <div className="flex flex-wrap items-end gap-4">

            {/* Buscar usuario */}
            <div className="flex-1 min-w-[200px]" ref={searchBoxRef}>
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
              </div>
            </div>

            {/* Rol a asignar */}
            <div className="min-w-[180px]">
              <label className="block text-xs font-semibold text-gray-600 uppercase tracking-wide mb-1.5">
                Rol a asignar <span className="text-red-500">*</span>
              </label>
              <select
                value={inviteRoleId}
                onChange={(e) => setInviteRoleId(Number(e.target.value))}
                disabled={rolesLoading}
                className="w-full px-3 py-2.5 border border-gray-200 rounded-md shadow-sm text-sm focus:ring-2 focus:ring-[#0056b3] focus:border-[#0056b3] outline-none bg-white disabled:opacity-60 transition-shadow"
              >
                <option value={0}>{rolesLoading ? 'Cargando roles...' : 'Seleccionar rol...'}</option>
                {etiquetas.map((rol) => (
                  <option key={rol.project_role_id} value={rol.project_role_id}>
                    {rol.name}
                  </option>
                ))}
              </select>
            </div>

            {/* Botón Enviar invitación */}
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

          {/* 👥 Resultados de búsqueda - debajo de la fila */}
          {showUserSearch && (
            <div className="mt-2 border border-gray-100 rounded-md max-h-48 overflow-y-auto bg-white shadow-xl ring-1 ring-black/5">
              {searchUserResults.length === 0 ? (
                <div className="p-4 text-center text-sm text-gray-400">
                  {searchUserQuery.trim() ? 'No se encontraron usuarios' : 'Escribe para buscar usuarios'}
                </div>
              ) : (
                searchUserResults.map((user) => (
                  <button
                    key={user.user_id}
                    onClick={() => handleSelectUser(user)}
                    className={`w-full text-left p-3 hover:bg-blue-50/70 transition-colors border-b border-gray-100 last:border-0 flex items-center gap-3 ${
                      selectedUser?.user_id === user.user_id ? 'bg-blue-50/70' : ''
                    }`}
                  >
                    <div className="w-8 h-8 rounded-full bg-blue-100 text-blue-600 flex items-center justify-center font-semibold text-sm ring-2 ring-white shadow-sm">
                      {user.name?.charAt(0).toUpperCase() || '?'}
                    </div>
                    <div className="flex-1">
                      <p className="text-sm font-medium text-gray-700">{user.name}</p>
                      <p className="text-xs text-gray-400 flex items-center gap-1">
                        <AtSign size={12} />
                        {user.email}
                      </p>
                    </div>
                    {selectedUser?.user_id === user.user_id && (
                      <Check size={18} className="text-[#0056b3]" />
                    )}
                  </button>
                ))
              )}
            </div>
          )}

          {/* ✅ Usuario seleccionado */}
          {selectedUser && (
            <div className="mt-3 p-3 bg-gradient-to-r from-blue-50 to-blue-50/40 border border-blue-100 rounded-md flex items-center justify-between shadow-sm animate-slideDown">
              <div className="flex items-center gap-3">
                <div className="w-8 h-8 rounded-full bg-[#0056b3] text-white flex items-center justify-center font-semibold text-sm ring-2 ring-white shadow-sm">
                  {selectedUser.name?.charAt(0).toUpperCase() || '?'}
                </div>
                <div>
                  <p className="text-sm font-medium text-gray-700">{selectedUser.name}</p>
                  <p className="text-xs text-gray-500">{selectedUser.email}</p>
                </div>
              </div>
              <Check size={20} className="text-green-500" />
            </div>
          )}

          {/* 📋 Estado del botón */}
          <div className="flex items-center gap-1.5 text-xs text-gray-400 mt-2.5">
            {!selectedUser && (
              <>
                <AlertCircle size={13} className="text-gray-400 shrink-0" />
                Selecciona un usuario para continuar
              </>
            )}
            {selectedUser && !inviteRoleId && (
              <>
                <AlertCircle size={13} className="text-amber-500 shrink-0" />
                Selecciona un rol para el usuario
              </>
            )}
            {selectedUser && inviteRoleId > 0 && (
              <>
                <CheckCircle size={13} className="text-green-500 shrink-0" />
                Listo para enviar la invitación
              </>
            )}
          </div>
        </div>

        {/* ============ BARRA DE ACCIONES ============ */}
        <div className="bg-gray-50/70 rounded-lg p-4 mb-6 border border-gray-100 shadow-sm">
          <div className="flex flex-wrap items-center justify-between gap-3">
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

            <div className="flex gap-2 flex-wrap">
              
              <button
                onClick={() => setShowTagsModal(true)}
                className="px-4 py-2 bg-white hover:bg-gray-50 text-gray-700 rounded-md text-sm font-medium border border-gray-200 shadow-sm flex items-center gap-2 hover:-translate-y-0.5 hover:shadow-md transition-all"
              >
                <Tag size={16} />
                Etiquetas ({etiquetas.length ?? 0})
              </button>
            </div>
          </div>
        </div>

        {/* ============ TABLA DE INVITACIONES PENDIENTES ============ */}
        <div className="bg-white rounded-lg overflow-hidden border border-gray-100 shadow-sm ring-1 ring-black/5 mb-6">
          <div className="px-6 py-4 border-b border-gray-100 flex items-center justify-between">
            <h3 className="font-semibold text-gray-800">
              Invitaciones Pendientes
              <span className="ml-2 text-sm font-normal text-gray-400 bg-gray-100 px-2 py-0.5 rounded-md">
                {invitationsPendientes?.length ?? 0}
              </span>
            </h3>
            {!isOwner && !checkingOwner && invitationsPendientes?.length > 0 && (
              <span className="text-xs text-gray-400 flex items-center gap-1">
                <Shield size={14} />
                Solo el owner puede gestionar
              </span>
            )}
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
                    {isOwner && !checkingOwner && (
                      <th className="px-6 py-3 text-right text-[11px] font-semibold text-gray-500 uppercase tracking-wider">Acciones</th>
                    )}
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {invitationsPendientes.map((inv) => (
                    <tr key={inv.invitation_id} className="hover:bg-blue-50/30 transition-colors">
                      <td className="px-6 py-3 font-medium text-gray-700">{inv.email}</td>
                      <td className="px-6 py-3">
                        <span className={`px-2.5 py-1 rounded-md text-xs font-medium ring-1 ring-inset ring-black/5 ${getRoleColor(inv.project_role?.project_role_id || 10)}`}>
                          {inv.project_role?.project_role_name || 'Sin rol'}
                        </span>
                      </td>
                      <td className="px-6 py-3">
                        <span className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-md text-xs font-medium ring-1 ring-inset ring-black/5 ${getStatusBadge(inv.status)}`}>
                          {getStatusIcon(inv.status)}
                          <span className="ml-1 capitalize">{inv.status}</span>
                        </span>
                      </td>
                      <td className="px-6 py-3 text-sm text-gray-600">{inv.host?.user_name || 'Desconocido'}</td>
                      <td className="px-6 py-3 text-sm text-gray-600">
                        {new Date(inv.expires_at).toLocaleDateString()}
                      </td>
                      {isOwner && !checkingOwner && (
                        <td className="px-6 py-3 text-right">
                          <button
                            onClick={() => handleCancelInvitation(inv.invitation_id)}
                            className="text-red-500 hover:text-red-700 hover:bg-red-50 text-sm font-medium flex items-center gap-1 ml-auto px-2 py-1 rounded-md transition-colors"
                          >
                            <Trash2 size={14} /> Cancelar
                          </button>
                        </td>
                      )}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {/* ============ TABLA DE MIEMBROS ============ */}
        <div className="bg-white rounded-lg overflow-hidden border border-gray-100 shadow-sm ring-1 ring-black/5">
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
                  members.map((member: any) => (
                    <tr key={member.user_id} className="hover:bg-blue-50/30 transition-colors">
                      <td className="px-6 py-3 font-medium text-gray-700">{member.user_name}</td>
                      <td className="px-6 py-3">
                        <span className={`px-2.5 py-1 rounded-md text-xs font-medium ring-1 ring-inset ring-black/5 ${getRoleColor(member.project_role_id || 10)}`}>
                          {member.project_role_name}
                        </span>
                      </td>
                      <td className="px-6 py-3 text-sm text-gray-600">{member.email}</td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>

        {/* ============ MODAL: ETIQUETAS / ROLES ============ */}
        {showTagsModal && (
          <div className="fixed inset-0 bg-black/40 backdrop-blur-sm flex items-center justify-center z-50">
            <div className="bg-white rounded-lg w-[500px] max-h-[90vh] shadow-2xl ring-1 ring-black/5 border border-gray-100 overflow-hidden">
              <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
                <div className="flex items-center gap-3">
                  <span className="flex items-center justify-center w-9 h-9 rounded-md bg-[#0056b3]/10 text-[#0056b3]">
                    <Tag size={18} />
                  </span>
                  <h3 className="font-bold text-gray-800 text-lg">Administrar Etiquetas / Roles</h3>
                  <span className="text-sm font-normal text-gray-400 bg-gray-100 px-2 py-0.5 rounded-md">
                    {etiquetas?.length ?? 0}
                  </span>
                </div>
                <button
                  onClick={() => setShowTagsModal(false)}
                  aria-label="Cerrar modal de etiquetas"
                  className="w-9 h-9 flex items-center justify-center text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-md transition-colors"
                >
                  <X size={20} />
                </button>
              </div>

              <div className="p-6 overflow-y-auto max-h-[60vh]">
                <p className="text-sm text-gray-500 mb-4">
                  Las etiquetas creadas aquí aparecerán como roles disponibles.
                </p>

                {rolesError && (
                  <div className="mb-4 text-sm text-red-600 bg-red-50 border border-red-200 rounded-md px-3 py-2">
                    {rolesError}
                  </div>
                )}

                {showCreateEtiquetaInput ? (
                  <div className="flex items-center gap-2 mb-4">
                    <input
                      type="text"
                      value={nuevaEtiqueta}
                      onChange={(e) => setNuevaEtiqueta(e.target.value)}
                      placeholder="Nombre de la etiqueta/rol..."
                      className="flex-1 px-3 py-2 border border-gray-200 rounded-md shadow-sm outline-none text-sm focus:ring-2 focus:ring-[#0056b3] focus:border-[#0056b3]"
                      autoFocus
                      onKeyDown={(e) => e.key === 'Enter' && handleCrearEtiqueta()}
                    />
                    <button onClick={handleCrearEtiqueta} className="px-4 py-2 bg-[#0056b3] text-white rounded-md shadow-sm hover:bg-[#004494] hover:-translate-y-0.5 hover:shadow-md transition-all text-sm font-medium">
                      Guardar
                    </button>
                    <button onClick={() => { setShowCreateEtiquetaInput(false); setNuevaEtiqueta(''); }} aria-label="Cancelar creación de etiqueta" className="px-3 py-2 text-gray-500 hover:text-gray-700 hover:bg-gray-100 rounded-md transition-colors">
                      <X size={20} />
                    </button>
                  </div>
                ) : (
                  <button onClick={() => setShowCreateEtiquetaInput(true)} className="flex items-center gap-2 px-4 py-2.5 bg-gray-50 hover:bg-gray-100 rounded-md text-sm font-medium text-gray-700 mb-4 w-full justify-center border-2 border-dashed border-gray-200 transition-colors">
                    <Plus size={18} /> Crear nueva etiqueta/rol
                  </button>
                )}

                <div className="space-y-2">
                  {rolesLoading ? (
                    <div className="text-center py-8 text-gray-400">
                      <RefreshCw size={24} className="animate-spin mx-auto mb-2" />
                      <p>Cargando roles...</p>
                    </div>
                  ) : (
                    <>
                      {etiquetas.map((etiqueta) => (
                        <div key={etiqueta.project_role_id} className="flex items-center justify-between p-3 bg-gray-50 rounded-md border border-transparent hover:border-gray-200 hover:shadow-sm transition-all group">
                          {editandoEtiqueta === etiqueta.project_role_id ? (
                            <div className="flex items-center gap-2 flex-1">
                              <input
                                type="text"
                                value={etiquetaEdit}
                                onChange={(e) => setEtiquetaEdit(e.target.value)}
                                className="flex-1 px-3 py-1 border border-gray-200 rounded-md outline-none text-sm focus:ring-2 focus:ring-[#0056b3]"
                                autoFocus
                                onKeyDown={(e) => e.key === 'Enter' && handleGuardarEdicionEtiqueta(etiqueta.project_role_id)}
                              />
                              <button onClick={() => handleGuardarEdicionEtiqueta(etiqueta.project_role_id)} aria-label="Guardar cambios" className="p-1.5 text-green-600 hover:text-green-700 hover:bg-green-50 rounded-md transition-colors">
                                <Check size={18} />
                              </button>
                              <button onClick={handleCancelarEdicionEtiqueta} aria-label="Cancelar edición" className="p-1.5 text-gray-500 hover:text-gray-700 hover:bg-gray-100 rounded-md transition-colors">
                                <X size={18} />
                              </button>
                            </div>
                          ) : (
                            <>
                              <span className="font-medium text-gray-700">
                                {etiqueta.name}
                                {etiqueta.is_default && (
                                  <span className="ml-2 text-xs text-gray-400 font-normal">(rol del sistema)</span>
                                )}
                              </span>
                              {!etiqueta.is_default && (
                                <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100">
                                  <button onClick={() => handleEditarEtiqueta(etiqueta.project_role_id)} aria-label={`Editar etiqueta ${etiqueta.name}`} className="p-1.5 text-gray-500 hover:text-blue-600 rounded-md hover:bg-blue-50 transition-colors">
                                    <Pencil size={16} />
                                  </button>
                                  <button onClick={() => handleEliminarEtiqueta(etiqueta.project_role_id)} aria-label={`Eliminar etiqueta ${etiqueta.name}`} className="p-1.5 text-gray-500 hover:text-red-600 rounded-md hover:bg-red-50 transition-colors">
                                    <Trash2 size={16} />
                                  </button>
                                </div>
                              )}
                            </>
                          )}
                        </div>
                      ))}

                      {etiquetas?.length === 0 && (
                        <div className="text-center py-8 text-gray-400">
                          <p>No hay etiquetas/roles creados</p>
                        </div>
                      )}
                    </>
                  )}
                </div>
              </div>

              <div className="flex justify-end px-6 py-4 border-t border-gray-100 bg-gray-50/70">
                <button onClick={() => setShowTagsModal(false)} className="px-6 py-2 bg-[#0056b3] text-white rounded-md shadow-sm hover:bg-[#004494] hover:-translate-y-0.5 hover:shadow-md transition-all text-sm font-medium">
                  Cerrar
                </button>
              </div>
            </div>
          </div>
        )}

      </div>
    </div>
  );
};

export default ColaboradoresTab;