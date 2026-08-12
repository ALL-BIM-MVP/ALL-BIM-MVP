// src/hooks/usePermissions.ts
import { useAuth } from '../context/AuthContext';
import { ROLE_IDS } from '../utils/roles';

/*

 * 1: ADMINISTRADOR -> gestiona usuarios, invita, crea proyectos
 * 2: SUPERVISOR    -> invita, crea proyectos
 * 3: MODERADOR     -> crea proyectos
 * 4: USUARIO       -> se une a proyectos

 */
export function usePermissions() {
  const { user } = useAuth();
  const rolId = user?.rol_id;
    console.log('DEBUG rolId:', rolId); 
  return {
    // Gestión de usuarios del sistema (AdminUsers.tsx)
    canManageUsers: rolId === ROLE_IDS.ADMINISTRADOR,

    // Invitar colaboradores (Invitations.tsx, botón "+ Invitar")
    canInvite:
      rolId === ROLE_IDS.ADMINISTRADOR ||
      rolId === ROLE_IDS.SUPERVISOR,

    // Crear proyectos nuevos (NewProjectModal.tsx)
    canCreateProject:
      rolId === ROLE_IDS.ADMINISTRADOR ||
      rolId === ROLE_IDS.SUPERVISOR ||
      rolId === ROLE_IDS.MODERADOR,
    canEditProject:
      rolId === ROLE_IDS.ADMINISTRADOR ||
      rolId === ROLE_IDS.SUPERVISOR ||
      rolId === ROLE_IDS.MODERADOR,
    // Unirse a proyectos existentes -- todos los roles logueados pueden
    canJoinProject: !!user,

    rolId,
  };
}