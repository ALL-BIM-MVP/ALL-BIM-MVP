// src/utils/media.ts
// Ajustá VITE_API_URL al nombre real de tu variable de entorno si es distinto.
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