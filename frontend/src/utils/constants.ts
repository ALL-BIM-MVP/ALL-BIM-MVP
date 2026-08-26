export const ROLES = {
  ADMIN: 'ADMIN',
  SUPERVISOR: 'SUPERVISOR',
  USER: 'USER',
} as const;

// No se usa en ningún lado hoy (queda sin exportar — dead code
// encontrado al preparar pruebas en red), pero se corrige igual para
// no dejar un valor hardcodeado inconsistente con api.ts/media.ts si
// algo empieza a importarlo más adelante.
const BASE_URL = `${import.meta.env.VITE_API_URL || 'http://localhost:4000'}/api`;