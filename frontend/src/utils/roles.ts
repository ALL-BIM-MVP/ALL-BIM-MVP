// src/utils/roles.ts
export const ROLES: Record<number, string> = {
  1: 'ADMINISTRADOR',
  2: 'SUPERVISOR',
  3: 'USUARIO'
};

export const getRoleName = (rolId: number): string => {
  return ROLES[rolId] || 'USUARIO';
};


export const INVITATION_ROLES = [
  { id: 2, name: 'SUPERVISOR' },
  { id: 3, name: 'USUARIO' }
];