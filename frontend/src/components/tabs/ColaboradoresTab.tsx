// src/components/tabs/ColaboradoresTab.tsx

import React, { useState, useEffect, useLayoutEffect, useRef, useCallback, useMemo } from "react";
import { createPortal } from 'react-dom';
import {
  Plus, Trash2, X, Check, Users, CheckCircle,
  Mail, Send, RefreshCw, Search, AlertCircle,
  Crown, Shield, AtSign, Pencil, Save, ChevronDown, Info,
} from 'lucide-react';

// Texto de "Administrador del proyecto" — no es un rol de módulo (no
// vive en module_roles, es el flag is_admin), así que no sale de
// ninguna consulta — va como constante acá.
const ADMIN_PROJECT_DESCRIPTION =
  'Casi el mismo nivel de confianza que el dueño del proyecto: puede gestionar todo —incluido cambiar el rol de otros miembros— y tiene acceso completo a todos los módulos. Pensado para cuando el dueño no está disponible.';
import { useProjectInvitationsContext } from '../../context/ProjectInvitationsContext';
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

// Selector de rol con la descripción de cada opción a la vista al
// abrirlo (no un <select> nativo — ahí solo entra texto plano en una
// línea, no alcanza para mostrar nombre + descripción con jerarquía).
interface RoleDropdownProps {
  roles: ModuleRoleOption[];
  value: number;
  onChange: (roleId: number) => void;
  placeholderLabel: string;
}

const RoleDropdown: React.FC<RoleDropdownProps> = ({ roles, value, onChange, placeholderLabel }) => {
  const [open, setOpen] = useState(false);
  // wrapRef ancla el botón (para medir dónde está); panelRef es el
  // panel de verdad, portado a document.body — si se dejara adentro
  // del flujo normal, cualquier ancestro con overflow-y-auto (la lista
  // de módulos de "Cambiar rol", el body del modal de invitar) lo
  // recorta, dejando ver apenas una franja de la primera opción (bug
  // real encontrado el 2026-08-30, costó bastante encontrarlo).
  const wrapRef = useRef<HTMLDivElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState<{ top: number; left: number } | null>(null);

  useEffect(() => {
    const onClickOutside = (e: MouseEvent) => {
      const target = e.target as Node;
      if (wrapRef.current?.contains(target)) return;
      if (panelRef.current?.contains(target)) return;
      setOpen(false);
    };
    document.addEventListener('mousedown', onClickOutside);
    return () => document.removeEventListener('mousedown', onClickOutside);
  }, []);

  const PANEL_WIDTH = 288; // w-72

  const toggleOpen = () => {
    if (!open && wrapRef.current) {
      const rect = wrapRef.current.getBoundingClientRect();
      const margin = 4;
      const left = Math.min(rect.right - PANEL_WIDTH, window.innerWidth - PANEL_WIDTH - 8);
      setPos({ top: rect.bottom + margin, left: Math.max(8, left) });
    }
    setOpen((o) => !o);
  };

  const selected = roles.find((r) => r.module_role_id === value);

  return (
    <div className="relative flex-shrink-0" ref={wrapRef}>
      <button
        type="button"
        onClick={toggleOpen}
        className="flex items-center gap-1 px-2 py-1.5 border border-gray-200 rounded-md text-xs bg-white hover:border-gray-300 transition-colors whitespace-nowrap"
      >
        {selected ? selected.name : placeholderLabel}
        <ChevronDown size={12} className={`text-gray-400 transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>
      {open && pos && createPortal(
        <div
          ref={panelRef}
          data-role-dropdown-panel
          className="fixed z-[10200] w-72 bg-white border border-gray-200 rounded-lg shadow-xl py-1.5 max-h-80 overflow-y-auto"
          style={{ top: pos.top, left: pos.left }}
        >
          {roles.map((role) => (
            <button
              key={role.module_role_id}
              type="button"
              onClick={() => { onChange(role.module_role_id); setOpen(false); }}
              className="w-full text-left px-3 py-2 hover:bg-blue-50 transition-colors flex items-start justify-between gap-2"
            >
              <div className="min-w-0">
                <p className="text-sm font-semibold text-gray-800">{role.name}</p>
                {role.description && (
                  <p className="text-xs text-gray-500 mt-0.5 leading-snug">{role.description}</p>
                )}
              </div>
              {role.module_role_id === value && (
                <Check size={14} className="text-[#0056b3] shrink-0 mt-0.5" />
              )}
            </button>
          ))}
        </div>,
        document.body
      )}
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
    loadMembers,
    searchUsers,
    createInvitation,
    cancelInvitation,
    isOwner,
    isAdmin,
    checkingOwner,
    updateMemberAdmin,
    updateMemberModuleRole,
    removeMember,
  } = useProjectInvitationsContext();

  const canManage = (isOwner || isAdmin) && !checkingOwner;

  const [modules, setModules] = useState<ModuleCatalogItem[]>([]);
  const [modulesLoading, setModulesLoading] = useState(true);
  const [moduleRolesByCode, setModuleRolesByCode] = useState<Record<string, ModuleRoleOption[]>>({});

  // Trae el catálogo de módulos + el de roles de cada uno — consulta
  // real al backend (GET /api/modules, GET /api/modules/:code/roles),
  // no es un dato que se arma solo. La usan tanto el montaje de la
  // pestaña como el cuadro de "Cambiar rol" (ver handleStartEditRole),
  // que la vuelve a llamar cada vez que se abre, igual que el
  // formulario de invitar — así ninguno de los dos depende de que el
  // otro haya cargado bien primero.
  const loadModuleRolesCatalog = useCallback(async () => {
    setModulesLoading(true);
    try {
      const list = await getModules();
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
      setModuleRolesByCode(Object.fromEntries(rolesEntries));
    } catch (err) {
      console.error('Error cargando catálogo de módulos:', err);
    } finally {
      setModulesLoading(false);
    }
  }, []);

  useEffect(() => {
    loadModuleRolesCatalog();
  }, [loadModuleRolesCatalog]);

  // Formulario de invitar — ahora vive en un modal (antes estaba
  // siempre visible en la pantalla principal).
  const [showInviteModal, setShowInviteModal] = useState(false);
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
  // Panel de resultados del buscador — portado a document.body, mismo
  // motivo que RoleDropdown/RoleSummary: vive adentro del cuerpo del
  // modal, que tiene su propio overflow-y-auto.
  const searchAnchorRef = useRef<HTMLDivElement>(null);
  const searchResultsPanelRef = useRef<HTMLDivElement>(null);
  const [searchResultsPos, setSearchResultsPos] = useState<{ top: number; left: number; width: number } | null>(null);

  // Edición de rol de un miembro ya existente — ahora vía popover flotante
  // (portado a document.body) anclado al ícono de lápiz al lado del badge
  // de Rol, en vez de una fila expandida que empujaba toda la tabla.
  const [editingMemberId, setEditingMemberId] = useState<number | null>(null);
  const [editIsAdmin, setEditIsAdmin] = useState(false);
  const [editModuleRoles, setEditModuleRoles] = useState<Record<string, number>>({});
  const [editSubmitting, setEditSubmitting] = useState(false);
  const [removingMemberId, setRemovingMemberId] = useState<number | null>(null);
  const [cancelingInvitationId, setCancelingInvitationId] = useState<number | null>(null);
  const [editAnchorRect, setEditAnchorRect] = useState<DOMRect | null>(null);
  // Posición final ya corregida (puede "voltearse" hacia arriba si no
  // entra hacia abajo) — se calcula después de medir el alto real del
  // popover, ver los useLayoutEffect más abajo.
  const [popoverPos, setPopoverPos] = useState<{ top: number; left: number } | null>(null);
  const editPopoverRef = useRef<HTMLDivElement>(null);

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
      const target = event.target as Node;
      // El panel de resultados vive portado a document.body — sin este
      // chequeo, tocar un resultado se veía como un clic "de afuera" y
      // lo cerraba antes de poder elegirlo (mismo bug ya encontrado en
      // RoleDropdown/RoleSummary).
      if (target instanceof Element && target.closest('[data-search-results-panel]')) return;
      if (searchBoxRef.current && !searchBoxRef.current.contains(target)) {
        setShowUserSearch(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // Posición del panel de resultados — se recalcula cada vez que se
  // abre (el modal puede haberse desplazado si el usuario scrolleó
  // adentro de su propio overflow-y-auto antes de volver a buscar).
  useLayoutEffect(() => {
    if (!showUserSearch || !searchAnchorRef.current) {
      setSearchResultsPos(null);
      return;
    }
    const rect = searchAnchorRef.current.getBoundingClientRect();
    setSearchResultsPos({ top: rect.bottom + 8, left: rect.left, width: rect.width });
  }, [showUserSearch]);

  useEffect(() => {
    const handleEscape = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return;
      if (showUserSearch) setShowUserSearch(false);
    };
    document.addEventListener('keydown', handleEscape);
    return () => document.removeEventListener('keydown', handleEscape);
  }, [showUserSearch]);

  const handleSelectUser = (user: UserSearchResult) => {
    setSelectedUser(user);
    setInviteEmail(user.email);
    // El campo de búsqueda se queda con el email (lo que se buscó),
    // no con el nombre — quién es la persona elegida se muestra aparte,
    // en la tarjeta de confirmación de abajo, junto a los roles.
    setSearchUserQuery(user.email);
    setShowUserSearch(false);
    setSearchUserResults([]);
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

  const openInviteModal = () => {
    handleClearSelectedUser();
    setShowInviteModal(true);
  };

  const closeInviteModal = () => {
    setShowInviteModal(false);
    handleClearSelectedUser();
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
      closeInviteModal();
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
    setCancelingInvitationId(invitationId);
    try {
      await cancelInvitation(invitationId);
      showMessage('✅ Invitación cancelada', 'success');
    } catch (err: any) {
      showMessage(err.message || 'Error al cancelar invitación', 'error');
    } finally {
      setCancelingInvitationId(null);
    }
  };

  const handleStartEditRole = (member: ProjectMember, anchorEl: HTMLElement) => {
    if (member.project_member_id == null) return; // owner: no tiene fila propia editable
    setEditingMemberId(member.project_member_id);
    setEditIsAdmin(member.is_admin);
    setEditModuleRoles(
      Object.fromEntries(member.module_roles.map((r) => [r.module_code, r.module_role_id]))
    );
    setEditAnchorRect(anchorEl.getBoundingClientRect());
    // Consulta de nuevo el catálogo de roles al abrir el cuadro — no
    // se conforma con lo que ya se haya cargado al entrar a la
    // pestaña, igual que el formulario de invitar.
    void loadModuleRolesCatalog();
  };

  const handleCancelEditRole = () => {
    setEditingMemberId(null);
    setEditIsAdmin(false);
    setEditModuleRoles({});
    setEditAnchorRect(null);
    setPopoverPos(null);
  };

  const handleToggleEditRole = (member: ProjectMember, anchorEl: HTMLElement) => {
    if (editingMemberId === member.project_member_id) {
      handleCancelEditRole();
    } else {
      handleStartEditRole(member, anchorEl);
    }
  };

  // Cierra el popover al hacer click afuera, con Escape, o al scrollear
  // (evita que quede flotando en un lugar desactualizado de la pantalla).
  useEffect(() => {
    if (editingMemberId === null) return;

    const handleClickOutside = (event: MouseEvent) => {
      const target = event.target as Node;
      if (editPopoverRef.current?.contains(target)) return;
      // El panel de cada RoleDropdown vive portado a document.body, NO
      // como descendiente del cuadro grande — sin este chequeo, elegir
      // un rol se veía (correctamente, para el DOM) como un clic "de
      // afuera" y cerraba todo el cuadro antes de poder guardar (bug
      // real encontrado el 2026-08-30, efecto secundario de portar el
      // panel de roles para que no quedara recortado).
      if (target instanceof Element && target.closest('[data-role-dropdown-panel]')) return;
      handleCancelEditRole();
    };
    const handleEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') handleCancelEditRole();
    };
    const handleScroll = () => handleCancelEditRole();

    document.addEventListener('mousedown', handleClickOutside);
    document.addEventListener('keydown', handleEscape);
    window.addEventListener('scroll', handleScroll, true);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      document.removeEventListener('keydown', handleEscape);
      window.removeEventListener('scroll', handleScroll, true);
    };
  }, [editingMemberId]);

  // Paso 1: posición provisional apenas se abre (debajo del ícono), solo
  // para tener algo pintado que después podamos medir.
  useLayoutEffect(() => {
    if (!editAnchorRect) return;
    setPopoverPos({ top: editAnchorRect.bottom + 8, left: editAnchorRect.left });
  }, [editAnchorRect]);

  // Paso 2: una vez que el popover ya se pintó con la posición provisional,
  // medimos su alto REAL (varía según cuántos módulos tenga o si está en
  // modo Administrador) y decidimos si abrir hacia abajo o "voltearlo"
  // hacia arriba cuando no entra en el espacio restante de la pantalla.
  // Corre con useLayoutEffect (antes del paint) para que no se note un salto.
  useLayoutEffect(() => {
    if (!editAnchorRect || !popoverPos || !editPopoverRef.current) return;

    const rect = editPopoverRef.current.getBoundingClientRect();
    const margin = 8;
    const viewportHeight = window.innerHeight;
    const viewportWidth = window.innerWidth;
    const spaceBelow = viewportHeight - editAnchorRect.bottom;
    const spaceAbove = editAnchorRect.top;

    let top: number;
    if (rect.height + margin <= spaceBelow || spaceBelow >= spaceAbove) {
      // Entra hacia abajo (o hay más espacio abajo que arriba de todos
      // modos) — se abre debajo del ícono, sin pasarse del borde inferior.
      top = Math.min(editAnchorRect.bottom + margin, viewportHeight - rect.height - margin);
    } else {
      // No entra hacia abajo y hay más espacio arriba — se voltea.
      top = Math.max(margin, editAnchorRect.top - rect.height - margin);
    }
    const left = Math.min(editAnchorRect.left, viewportWidth - rect.width - margin);

    if (Math.abs(top - popoverPos.top) > 0.5 || Math.abs(left - popoverPos.left) > 0.5) {
      setPopoverPos({ top, left });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editAnchorRect, popoverPos, editIsAdmin]);

  const handleEditModuleRoleChange = (moduleCode: string, moduleRoleId: number) => {
    setEditModuleRoles((prev) => ({ ...prev, [moduleCode]: moduleRoleId }));
  };

  const handleSaveEditRole = async (member: ProjectMember) => {
    if (member.project_member_id == null) return;
    setEditSubmitting(true);
    try {
      if (editIsAdmin !== member.is_admin) {
        await updateMemberAdmin(member.project_member_id, editIsAdmin);
      }
      if (!editIsAdmin) {
        const originalRoles = Object.fromEntries(
          member.module_roles.map((r) => [r.module_code, r.module_role_id])
        );
        for (const m of activeModules) {
          const nextRoleId = editModuleRoles[m.code] ?? 0;
          const originalRoleId = originalRoles[m.code] ?? 0;
          if (nextRoleId > 0 && nextRoleId !== originalRoleId) {
            await updateMemberModuleRole(member.project_member_id, m.code, nextRoleId);
          }
        }
      }
      showMessage(' Rol actualizado', 'success');
      handleCancelEditRole();
    } catch (err: any) {
      showMessage(err.message || 'Error al actualizar el rol', 'error');
    } finally {
      setEditSubmitting(false);
    }
  };

  const handleRemoveMember = async (member: ProjectMember) => {
    if (!window.confirm(`¿Eliminar a ${fullName(member.user_name, member.user_last_name)} del proyecto?`)) return;
    setRemovingMemberId(member.user_id);
    try {
      await removeMember(member.user_id);
      showMessage(' Miembro eliminado', 'success');
      if (editingMemberId === member.project_member_id) handleCancelEditRole();
    } catch (err: any) {
      showMessage(err.message || 'Error al eliminar miembro', 'error');
    } finally {
      setRemovingMemberId(null);
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

  const editingMember = members?.find((m) => m.project_member_id === editingMemberId) ?? null;

  // Mismo freno que ya tiene el formulario de invitar (isInviteReady) —
  // acá faltaba, y por eso se podía guardar a alguien sin Administrador
  // y sin ningún rol de módulo, dejándolo con cero permisos explícitos
  // sin ningún aviso (bug real encontrado el 2026-08-30).
  const editHasAnyModuleRoleSelected = Object.values(editModuleRoles).some((id) => id > 0);
  const isEditReady = editIsAdmin || editHasAnyModuleRoleSelected;

  // Popover flotante para cambiar el rol de un miembro — portado a
  // document.body para no quedar recortado por el overflow-x-auto de la
  // tabla ni atrapado en algún contexto de apilamiento de un ancestro.
  const editRolePopover =
    editingMemberId !== null && editAnchorRect && editingMember && popoverPos
      ? createPortal(
          <div
            ref={editPopoverRef}
            className="fixed z-[10100] bg-white border border-gray-200 rounded-lg shadow-2xl p-4 w-96"
            style={{
              top: popoverPos.top,
              left: popoverPos.left,
            }}
          >
            {/* Misma tarjeta de identidad que el modal de invitar — acá
                no hace falta buscar a nadie (ya se sabe quién es), por
                eso este sigue siendo el cuadrito anclado al lápiz y no
                un modal aparte: sería más pesado de lo que la acción
                necesita. */}
            <div className="flex items-center gap-3 pb-3 mb-3 border-b border-dashed border-gray-200">
              <MemberAvatar
                name={fullName(editingMember.user_name, editingMember.user_last_name)}
                email={editingMember.email}
                photoUrl={editingMember.profile_picture_url}
                size="md"
              />
              <div className="min-w-0">
                <p className="text-sm font-semibold text-gray-800 truncate">
                  {fullName(editingMember.user_name, editingMember.user_last_name)}
                </p>
                <p className="text-xs text-gray-500">Cambiar rol en este proyecto</p>
              </div>
            </div>

            <div className="flex items-center gap-1.5 mb-3">
              <label className="flex items-center gap-2 px-1 py-1 cursor-pointer select-none">
                <input
                  type="checkbox"
                  checked={editIsAdmin}
                  onChange={(e) => setEditIsAdmin(e.target.checked)}
                  className="w-4 h-4 rounded border-gray-300 text-[#0056b3] focus:ring-[#0056b3]"
                />
                <span className="text-sm font-medium text-gray-700">Administrador del proyecto</span>
              </label>
              <span title={ADMIN_PROJECT_DESCRIPTION}>
                <Info size={12} className="text-gray-400 cursor-help" />
              </span>
            </div>

            {!editIsAdmin && modulesLoading && (
              <p className="text-sm text-gray-400 mb-3">Cargando roles...</p>
            )}

            {!editIsAdmin && !modulesLoading && (
              <div className="mb-3 space-y-2 max-h-80 overflow-y-auto pr-1">
                {activeModules.map((m) => {
                  const currentRole = editingMember.module_roles.find((r) => r.module_code === m.code);
                  return (
                    <div
                      key={m.code}
                      className="flex items-center justify-between gap-3 bg-white border border-gray-200 rounded-md px-3 py-2"
                    >
                      <span className="text-sm text-gray-700 font-medium truncate min-w-0">{m.name}</span>
                      <RoleDropdown
                        roles={moduleRolesByCode[m.code] ?? []}
                        value={editModuleRoles[m.code] || currentRole?.module_role_id || 0}
                        onChange={(roleId) => handleEditModuleRoleChange(m.code, roleId)}
                        placeholderLabel={currentRole ? currentRole.role_name : 'Sin rol'}
                      />
                    </div>
                  );
                })}
              </div>
            )}

            {!isEditReady && (
              <div className="flex items-center gap-1.5 text-xs text-amber-600 mb-2">
                <AlertCircle size={13} className="shrink-0" />
                Marcá "Administrador" o seleccioná al menos un rol de módulo
              </div>
            )}

            <div className="flex items-center justify-end gap-2 pt-2 border-t border-gray-100 mt-1">
              <button
                onClick={handleCancelEditRole}
                disabled={editSubmitting}
                className="px-3 py-1.5 rounded-md text-xs font-medium text-gray-600 hover:bg-gray-100 transition-colors disabled:opacity-50"
              >
                Cancelar
              </button>
              <button
                onClick={() => handleSaveEditRole(editingMember)}
                disabled={editSubmitting || !isEditReady}
                className="px-3 py-1.5 rounded-md text-xs font-semibold flex items-center gap-1.5 bg-[#0056b3] text-white shadow-sm hover:bg-[#004494] transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                <Save size={12} /> {editSubmitting ? 'Guardando...' : 'Guardar'}
              </button>
            </div>
          </div>,
          document.body
        )
      : null;

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
          .animate-fadeInUp { animation: fadeInUp 0.15s ease-out; }
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

        {/* MIEMBROS — arriba (punto 5: antes iba después de Invitaciones),
            visible para todos los miembros del proyecto; "Nuevo miembro"
            y las acciones de fila solo si canManage. Alto fijo con scroll
            interno en vez de crecer según cuántos haya. */}
        <div className="bg-white rounded-md overflow-hidden border border-gray-100 shadow-sm ring-1 ring-black/5 mb-6">
          <div className="px-6 py-4 border-b border-gray-100 flex items-center justify-between">
            <h3 className="font-semibold text-gray-800 flex items-center">
              Lista de Miembros
              <span className="ml-2 text-sm font-normal text-gray-400 bg-gray-100 px-2 py-0.5 rounded-md">
                {members?.length ?? 0}
              </span>
              <button
                onClick={loadMembers}
                aria-label="Actualizar miembros"
                className="text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-md p-1 ml-1 transition-colors"
                disabled={checkingOwner}
              >
                <RefreshCw size={14} className={checkingOwner ? 'animate-spin' : ''} />
              </button>
            </h3>
            {canManage && (
              <button
                onClick={openInviteModal}
                className="px-4 py-2 bg-[#0056b3] text-white rounded-md text-sm font-semibold flex items-center gap-1.5 hover:bg-[#004494] transition-colors"
              >
                <Plus size={16} />
                Nuevo miembro
              </button>
            )}
          </div>

          {!members || members.length === 0 ? (
            <div className="px-6 py-10 text-center text-gray-400 text-sm">
              No hay miembros registrados
            </div>
          ) : (
            <div
              className="overflow-y-auto divide-y divide-gray-100"
              style={{ minHeight: 168, maxHeight: 280 }}
            >
              {members.map((member: ProjectMember) => {
                const isEditing = editingMemberId !== null && editingMemberId === member.project_member_id;
                const canEditThisMember = canManage && !member.is_owner && member.project_member_id != null;
                return (
                  <div
                    key={member.project_member_id ?? `owner-${member.user_id}`}
                    className="flex items-center gap-3 px-6 py-2.5 hover:bg-blue-50/30 transition-colors"
                  >
                    <MemberAvatar
                      name={fullName(member.user_name, member.user_last_name)}
                      email={member.email}
                      photoUrl={member.profile_picture_url}
                      size="md"
                    />
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-medium text-gray-700 truncate">
                        {fullName(member.user_name, member.user_last_name)}
                      </p>
                      <p className="text-xs text-gray-400 truncate">{member.email}</p>
                    </div>
                    <span className={`px-2.5 py-1 rounded-md text-xs font-medium ring-1 ring-inset ring-black/5 flex-shrink-0 ${roleBadgeColor({ isOwner: member.is_owner, isAdmin: member.is_admin })}`}>
                      {roleLabel({ isOwner: member.is_owner, isAdmin: member.is_admin, moduleRoles: member.module_roles })}
                    </span>
                    {canEditThisMember && (
                      <button
                        onClick={(e) => handleToggleEditRole(member, e.currentTarget)}
                        title="Cambiar rol"
                        className={`w-6 h-6 flex items-center justify-center rounded-md transition-colors flex-shrink-0 ${
                          isEditing ? 'bg-[#0056b3] text-white' : 'text-gray-400 hover:text-[#0056b3] hover:bg-blue-50'
                        }`}
                      >
                        <Pencil size={12} />
                      </button>
                    )}
                    {canManage && (
                      canEditThisMember ? (
                        <button
                          onClick={() => handleRemoveMember(member)}
                          disabled={removingMemberId === member.user_id || member.is_me}
                          title={member.is_me ? 'No podés eliminarte a vos mismo' : undefined}
                          className="text-red-500 hover:text-red-700 hover:bg-red-50 text-sm font-medium flex items-center gap-1 px-2 py-1 rounded-md transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex-shrink-0"
                        >
                          <Trash2 size={14} /> {removingMemberId === member.user_id ? 'Eliminando...' : 'Eliminar'}
                        </button>
                      ) : (
                        <span className="text-xs text-gray-400 italic flex-shrink-0">
                          {member.is_owner ? 'Dueño del proyecto' : ''}
                        </span>
                      )
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* INVITACIONES — abajo, solo para quien puede gestionar */}
        {canManage && (
          <div className="bg-white rounded-md overflow-hidden border border-gray-100 shadow-sm ring-1 ring-black/5 mb-6">
            <div className="px-6 py-4 border-b border-gray-100 flex items-center justify-between">
              <h3 className="font-semibold text-gray-800">
                Invitaciones Pendientes
                <span className="ml-2 text-sm font-normal text-gray-400 bg-gray-100 px-2 py-0.5 rounded-md">
                  {invitationsPendientes?.length ?? 0}
                </span>
              </h3>
              <button
                onClick={loadInvitations}
                aria-label="Actualizar invitaciones"
                className="text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-md p-1.5 transition-colors"
                disabled={invitationsLoading}
              >
                <RefreshCw size={16} className={invitationsLoading ? 'animate-spin' : ''} />
              </button>
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
              <div className="divide-y divide-gray-100">
                {invitationsPendientes.map((inv) => (
                  <div key={inv.invitation_id} className="flex items-center gap-3 px-6 py-2.5 hover:bg-blue-50/30 transition-colors">
                    <MemberAvatar email={inv.email} />
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-medium text-gray-700 truncate">{inv.email}</p>
                      {/* Estado no se muestra acá aparte: esta lista es
                          solo de pendientes, así que siempre diría lo
                          mismo — no aporta nada nuevo. */}
                      <p className="text-xs text-gray-400 truncate">
                        Invitado por {fullName(inv.host?.user_name, inv.host?.user_last_name) || 'Desconocido'}
                        {' · Expira '}{new Date(inv.expires_at).toLocaleDateString()}
                      </p>
                    </div>
                    <span className={`px-2.5 py-1 rounded-md text-xs font-medium ring-1 ring-inset ring-black/5 flex-shrink-0 ${roleBadgeColor({ isAdmin: inv.is_admin })}`}>
                      {roleLabel({ isAdmin: inv.is_admin, moduleRoles: inv.module_roles })}
                    </span>
                    <button
                      onClick={() => handleCancelInvitation(inv.invitation_id)}
                      disabled={cancelingInvitationId === inv.invitation_id}
                      className="text-red-500 hover:text-red-700 hover:bg-red-50 text-sm font-medium flex items-center gap-1 px-2 py-1 rounded-md transition-colors disabled:opacity-50 flex-shrink-0"
                    >
                      <Trash2 size={14} /> {cancelingInvitationId === inv.invitation_id ? 'Cancelando...' : 'Cancelar'}
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>

      {/* Modal de invitar — mismo chrome que NewProjectModal.tsx */}
      {canManage && showInviteModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-white rounded-2xl w-[500px] max-h-[90vh] overflow-hidden shadow-2xl animate-fadeInUp flex flex-col">
            <div className="overflow-y-auto p-8">
              <div className="flex items-center justify-between mb-6">
                <h3 className="text-2xl font-bold text-gray-800">Invitar a un nuevo miembro</h3>
                <button
                  onClick={closeInviteModal}
                  disabled={submitting}
                  className="text-gray-400 hover:text-gray-600 text-2xl transition-colors disabled:opacity-50"
                >
                  ✕
                </button>
              </div>

              <div className="bg-gray-50/70 rounded-md p-5 border border-gray-100 shadow-sm">
                <div ref={searchBoxRef}>
                  <label className="block text-xs font-semibold text-gray-600 uppercase tracking-wide mb-1.5">
                    Buscar por email <span className="text-red-500">*</span>
                  </label>
                  <div className="relative" ref={searchAnchorRef}>
                    <div className="flex items-center border border-gray-200 rounded-md shadow-sm focus-within:ring-2 focus-within:ring-[#0056b3] focus-within:border-[#0056b3] bg-white transition-shadow">
                      <Search size={18} className="ml-3.5 text-gray-400" />
                      <input
                        type="text"
                        placeholder="nombre@empresa.com"
                        value={searchUserQuery}
                        onChange={(e) => setSearchUserQuery(e.target.value)}
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

                    {showUserSearch && searchResultsPos && createPortal(
                      <div
                        ref={searchResultsPanelRef}
                        data-search-results-panel
                        className="fixed z-[10200] border border-gray-100 rounded-md min-h-[112px] max-h-48 overflow-y-auto bg-white shadow-xl ring-1 ring-black/5 flex flex-col"
                        style={{ top: searchResultsPos.top, left: searchResultsPos.left, width: searchResultsPos.width }}
                      >
                        {searchUserResults.length === 0 ? (
                          <div className="p-4 text-center text-sm text-gray-400 m-auto">
                            {searchUserQuery.trim() ? 'No se encontraron usuarios' : 'Escribe para buscar por email'}
                          </div>
                        ) : (
                          searchUserResults.map((u) => (
                            <button
                              key={u.user_id}
                              onClick={() => handleSelectUser(u)}
                              className={`w-full text-left p-3 hover:bg-blue-50/70 transition-colors border-b border-gray-100 last:border-0 flex items-center gap-3 flex-shrink-0 ${
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
                      </div>,
                      document.body
                    )}
                  </div>
                </div>

                {/* Identidad elegida + roles, agrupados como un solo conjunto —
                    recién aparece una vez que se eligió a alguien de la lista. */}
                {selectedUser && (
                  <div className="mt-4 pt-4 border-t border-dashed border-gray-200 animate-slideDown">
                    <div className="flex items-center gap-3 mb-4">
                      <MemberAvatar name={fullName(selectedUser.name, selectedUser.last_name)} email={selectedUser.email} photoUrl={selectedUser.profile_picture_url} size="md" />
                      <div className="min-w-0">
                        <p className="text-sm font-semibold text-gray-800 truncate">{fullName(selectedUser.name, selectedUser.last_name)}</p>
                        <p className="text-xs text-gray-500">Se va a incorporar a este proyecto</p>
                      </div>
                    </div>

                    <div className="flex items-center gap-1.5 mb-3">
                      <label className="flex items-center gap-2 px-1 py-1 cursor-pointer select-none">
                        <input
                          type="checkbox"
                          checked={inviteIsAdmin}
                          onChange={(e) => setInviteIsAdmin(e.target.checked)}
                          className="w-4 h-4 rounded border-gray-300 text-[#0056b3] focus:ring-[#0056b3]"
                        />
                        <span className="text-sm font-medium text-gray-700">Administrador del proyecto</span>
                      </label>
                      <span title={ADMIN_PROJECT_DESCRIPTION}>
                        <Info size={12} className="text-gray-400 cursor-help" />
                      </span>
                    </div>

                    {!inviteIsAdmin && (
                      modulesLoading ? (
                        <p className="text-sm text-gray-400">Cargando módulos...</p>
                      ) : (
                        <div className="space-y-2">
                          {activeModules.map((m) => (
                            <div key={m.code} className="flex items-center justify-between gap-3 bg-white border border-gray-200 rounded-md px-3 py-2">
                              <span className="text-sm text-gray-700 font-medium truncate min-w-0">{m.name}</span>
                              {/* No es un 4to rol: "Visualizador" ya ES el mínimo
                                  "solo ver" (mismo permiso view-only que el default
                                  implícito del backend cuando no se asigna ningún
                                  rol, ver project-access.service.ts) — "Seleccionar
                                  rol..." es solo el placeholder inicial. */}
                              <RoleDropdown
                                roles={moduleRolesByCode[m.code] ?? []}
                                value={inviteModuleRoles[m.code] ?? 0}
                                onChange={(roleId) => handleModuleRoleChange(m.code, roleId)}
                                placeholderLabel="Seleccionar rol..."
                              />
                            </div>
                          ))}
                          {inactiveModules.map((m) => (
                            <div key={m.code} className="flex items-center justify-between gap-3 bg-gray-50 border border-gray-200 rounded-md px-3 py-2 opacity-60">
                              <span className="text-sm text-gray-500 font-medium">{m.name}</span>
                              <span className="text-xs text-gray-400 italic">módulo inactivo</span>
                            </div>
                          ))}
                        </div>
                      )
                    )}

                    <div className="flex items-center gap-1.5 text-xs text-gray-400 mt-3">
                      {!isInviteReady ? (
                        <>
                          <AlertCircle size={13} className="text-amber-500 shrink-0" />
                          Marcá "Administrador" o seleccioná al menos un rol de módulo
                        </>
                      ) : (
                        <>
                          <CheckCircle size={13} className="text-green-500 shrink-0" />
                          Listo para enviar la invitación
                        </>
                      )}
                    </div>
                  </div>
                )}
              </div>

              <div className="flex gap-3 pt-6">
                <button
                  onClick={closeInviteModal}
                  disabled={submitting}
                  className="flex-1 px-4 py-2.5 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 transition font-semibold disabled:opacity-50"
                >
                  Cancelar
                </button>
                <button
                  onClick={handleSendInvitation}
                  disabled={!isInviteButtonEnabled}
                  className="flex-1 px-4 py-2.5 bg-[#0056b3] text-white rounded-lg hover:bg-[#004494] transition font-semibold disabled:opacity-50 flex items-center justify-center gap-2"
                >
                  <Send size={16} />
                  {submitting ? 'Enviando...' : 'Enviar invitación'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {editRolePopover}
    </div>
  );
};

export default ColaboradoresTab;