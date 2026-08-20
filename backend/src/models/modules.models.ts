// modules.models.ts
//
// Fase 2 — ver docs/roadmap-modulos-y-permisos.md. Vocabulario único de
// permisos (view/upload/process/delete/export/configure), reusado entre
// TODOS los módulos — por eso el mapa de permisos siempre tiene las
// mismas claves, sea cual sea el módulo/rol.

export interface ModuleSummary {
    module_id: number;
    code: string;
    name: string;
    is_active: boolean;
}

// Mapa de permisos ya aplanado — SIEMPRE trae las 6 claves del
// catálogo (module_permissions), en false las que el rol no otorga.
// El frontend gatea SOLO contra esto, nunca comparando el nombre del
// rol como string (ver conversación de diseño).
export type PermissionMap = Record<string, boolean>;

export interface ModuleRoleCatalogEntry {
    module_role_id: number;
    module_id: number;
    name: string;
    description: string | null;
    permissions: PermissionMap;
}

// Respuesta de GET /projects/:id/modules/:moduleCode/access — el
// rol+permisos resueltos para EL USUARIO ACTUAL en ese módulo de ESE
// proyecto. role_name/module_role_id son null cuando el acceso viene
// del bypass de owner/admin (no hay ninguna fila real de la que salga
// un rol — ver resolveModuleAccess) o cuando el miembro no tiene un
// module_role asignado (cae al mínimo "solo ver" por defecto).
export interface ModuleAccess {
    module_code: string;
    is_owner: boolean;
    is_admin: boolean;
    module_role_id: number | null;
    role_name: string | null;
    permissions: PermissionMap;
}
