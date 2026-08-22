import { api } from './api';

// Mapa de permisos aplanado — SIEMPRE trae las mismas 6 claves (según la
// guía), en false las que el rol no otorga. El frontend gatea SOLO
// contra esto, nunca comparando el nombre del rol como string.
export interface ModulePermissions {
  view: boolean;
  upload: boolean;
  process: boolean;
  delete: boolean;
  export: boolean;
  configure: boolean;
}

// GET /api/modules — ojo: el campo es "code", NO "module_code" (ese
// nombre se usa recién en las respuestas de acceso/rol, no acá).
export interface ModuleCatalogItem {
  module_id: number;
  code: string;
  name: string;
  is_active: boolean;
}

// GET /api/modules/:moduleCode/roles — ojo: el nombre del rol viene en
// "name", NO en "role_name" (ese es el campo en ModuleAccess, distinto).
export interface ModuleRoleOption {
  module_role_id: number;
  module_id: number;
  name: string;
  description: string | null;
  permissions: ModulePermissions;
}

// Respuesta de .../modules/:moduleCode/access y .../my-modules —
// module_role_id y role_name pueden ser null: pasa cuando el acceso
// viene del bypass de owner/admin (no hay ningún rol real asignado), o
// cuando el miembro no tiene un module_role asignado y cae al mínimo
// "solo ver" por defecto.
export interface ModuleAccess {
  module_code: string;
  is_owner: boolean;
  is_admin: boolean;
  module_role_id: number | null;
  role_name: string | null;
  permissions: ModulePermissions;
}

// --- Catálogo (no dependen de ningún proyecto puntual) ---

export const getModules = (): Promise<ModuleCatalogItem[]> =>
  api.get('/api/modules');

export const getModuleRoles = (moduleCode: string): Promise<ModuleRoleOption[]> =>
  api.get(`/api/modules/${moduleCode}/roles`);

// --- Por proyecto ---

export const getMyModuleAccess = (projectId: number, moduleCode: string): Promise<ModuleAccess> =>
  api.get(`/api/projects/${projectId}/modules/${moduleCode}/access`);

export const getMyModulesAccess = (projectId: number): Promise<ModuleAccess[]> =>
  api.get(`/api/projects/${projectId}/my-modules`);