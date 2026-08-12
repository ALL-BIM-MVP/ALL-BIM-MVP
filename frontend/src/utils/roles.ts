// src/utils/roles.ts

export const ROLES: Record<number, string> = {
  1: 'ADMINISTRADOR',
  2: 'SUPERVISOR',
  3: 'MODERADOR',    
  4: 'USUARIO'       
};

export const ROLE_IDS = {
  ADMINISTRADOR: 1,
  SUPERVISOR: 2,
  MODERADOR: 3,
  USUARIO: 4,
} as const;

export const getRoleName = (rolId: number): string => {
  return ROLES[rolId] || 'USUARIO';
};

export const getRoleIdFromName = (roleName: string): number => {
  const normalized = roleName.trim().toUpperCase();
  const entry = Object.entries(ROLES).find(([, name]) => name === normalized);
  return entry ? Number(entry[0]) : 0;
};

export const INVITATION_ROLES = [
  { id: 2, name: 'SUPERVISOR' },
  { id: 3, name: 'MODERADOR' },   
  { id: 4, name: 'USUARIO' }      
];