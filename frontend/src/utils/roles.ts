// src/utils/roles.ts

// ✅ DEFINIR TODOS LOS ROLES
export const ROLES: Record<number, string> = {
  1: 'ADMINISTRADOR',
  2: 'SUPERVISOR',
  3: 'MODERADOR',    // ← Cambiado de USUARIO a MODERADOR
  4: 'USUARIO'       // ← Nuevo
};

export const getRoleName = (rolId: number): string => {
  return ROLES[rolId] || 'USUARIO';
};

// ✅ ROLES QUE PUEDEN SER INVITADOS (excluye ADMINISTRADOR)
export const INVITATION_ROLES = [
  { id: 2, name: 'SUPERVISOR' },
  { id: 3, name: 'MODERADOR' },   // ← Cambiado
  { id: 4, name: 'USUARIO' }      // ← Nuevo
];