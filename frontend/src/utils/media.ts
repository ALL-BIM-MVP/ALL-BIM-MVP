// src/utils/media.ts
// VITE_API_URL — mismo nombre que usan services/api.ts y utils/constants.ts,
// unificado al preparar la app para pruebas en red (antes eran 3 valores
// hardcodeados a localhost:4000 inconsistentes entre sí).
const API_BASE_URL = import.meta.env.VITE_API_URL || 'http://localhost:4000';

/**
 * Convierte una ruta relativa que devuelve el backend (ej. cover_image.url,
 * "/uploads/covers/2/xxxx.jpg") en una URL absoluta lista para <img src>.
 */
export function resolveMediaUrl(relativeUrl: string): string {
  if (!relativeUrl) return '';
  if (relativeUrl.startsWith('http://') || relativeUrl.startsWith('https://')) {
    return relativeUrl;
  }
  return `${API_BASE_URL}${relativeUrl}`;
}