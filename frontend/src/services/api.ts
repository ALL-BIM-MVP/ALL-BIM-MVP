// VITE_API_URL (.env del frontend) — mismo criterio que media.ts, que
// ya lo leía así. Sin la env var seteada (dev local de siempre), cae
// al mismo default de siempre.
export const BASE_URL = import.meta.env.VITE_API_URL || 'http://localhost:4000';

// Sin esto, un fetch colgado (servidor caído, red cortada) deja
// cualquier botón "cargando" para siempre, sin aviso. 30s para
// requests normales; 5min para subir/bajar archivos (pueden ser
// varios MB, no hay que cortarlos con el mismo límite).
const DEFAULT_TIMEOUT_MS = 30_000;
const FILE_TIMEOUT_MS = 5 * 60_000;

const fetchWithTimeout = async (url: string, options: RequestInit, timeoutMs: number): Promise<Response> => {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { ...options, signal: controller.signal });
  } catch (err) {
    if (err instanceof DOMException && err.name === 'AbortError') {
      throw new Error('Se perdió la conexión con el servidor. Probá de nuevo.');
    }
    throw err;
  } finally {
    clearTimeout(timer);
  }
};

// AppError del backend siempre manda { code, message } — antes acá se
// tiraba el "code" y solo quedaba el mensaje, así que ningún lado del
// frontend podía diferenciar errores puntuales (ej. IFC_INVALID_CONTENT
// vs cualquier otro 4xx) sin comparar el texto del mensaje a mano. Ahora
// el Error que se tira trae ambos: err.message de siempre, y err.code
// nuevo para quien lo necesite.
const parseResponse = async (response: Response) => {
  const contentType = response.headers.get('content-type') || '';
  if (!response.ok) {
    if (contentType.includes('application/json')) {
      const errorData = await response.json();
      const err: Error & { code?: string } = new Error(errorData.message || 'Error en la petición');
      err.code = errorData.code;
      throw err;
    }
    throw new Error('Error en la petición');
  }
  return contentType.includes('application/json') ? await response.json() : await response.text();
};

let refreshPromise: Promise<string | null> | null = null;

const refreshToken = async (): Promise<string | null> => {
  if (refreshPromise) return refreshPromise;

  refreshPromise = (async () => {
    try {
      const refresh = localStorage.getItem('refreshToken');
      const response = await fetchWithTimeout(`${BASE_URL}/api/auth/refresh`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ refresh_token: refresh }), // el backend espera "refresh_token", no "token" (ver auth.controller.ts)
      }, DEFAULT_TIMEOUT_MS);

      if (!response.ok) throw new Error();
      const data = await response.json();

      // OJO: el resto de la API (login, register) devuelve snake_case
      // (access_token, refresh_token) — ver AuthContext.tsx. Soportamos
      // ambos formatos acá por las dudas, pero lo esperable es snake_case.
      const newAccessToken = data.access_token ?? data.accessToken;
      const newRefreshToken = data.refresh_token ?? data.refreshToken;

      if (!newAccessToken) {
        // Si esto se dispara, el backend está devolviendo un campo con
        // otro nombre distinto — revisar la respuesta real de
        // /api/auth/refresh en Network antes de asumir cuál es.
        throw new Error('La respuesta de refresh no trae un access token reconocible.');
      }

      localStorage.setItem('accessToken', newAccessToken);

      // Si el backend rota el refresh token (práctica común de
      // seguridad: cada refresh invalida el anterior y entrega uno
      // nuevo), hay que guardar también el nuevo — si no, el PRÓXIMO
      // refresh usa un refresh token ya revocado y falla, forzando un
      // logout aunque el primer refresh haya funcionado bien. Este es
      // el bug que causaba pedir contraseña "cada cierto tiempo".
      if (newRefreshToken) {
        localStorage.setItem('refreshToken', newRefreshToken);
      }

      return newAccessToken;
    } catch {
      localStorage.clear();
      window.location.href = '/login';
      return null;
    } finally {
      refreshPromise = null;
    }
  })();

  return refreshPromise;
};

const request = async (endpoint: string, options: RequestInit = {}) => {
  let token = localStorage.getItem('accessToken');
  const isFormData = options.body instanceof FormData;
  const timeoutMs = isFormData ? FILE_TIMEOUT_MS : DEFAULT_TIMEOUT_MS;

  const headers = {
    ...options.headers,
    ...(isFormData ? {} : { 'Content-Type': 'application/json' }),
    'Authorization': token ? `Bearer ${token}` : '',
  };

  let response = await fetchWithTimeout(`${BASE_URL}${endpoint}`, { ...options, headers }, timeoutMs);

  if (!response.ok) {
    const errorData = await response.clone().json().catch(() => ({}));

    // AUTH_ACCESS_TOKEN_EXPIRED es el caso normal (jwt.TokenExpiredError,
    // ver verifyToken en jwt.ts del backend) — se refresca solo, en
    // silencio. Pero CUALQUIER otro rechazo del access token
    // (AUTH_ACCESS_TOKEN_INVALID: firma rara, token de otra sesión
    // vieja, reloj del navegador desalineado con el servidor, etc.) NO
    // se estaba tratando igual — se dejaba pasar como error real,
    // mostrando "Access Token inválido." en pantalla aunque un simple
    // refresh lo hubiera solucionado solo, igual que el caso normal
    // (bug real reportado por el usuario el 2026-08-30).
    if (errorData.code === "AUTH_ACCESS_TOKEN_EXPIRED" || errorData.code === "AUTH_ACCESS_TOKEN_INVALID") {
      token = await refreshToken();
      if (token) {
        const newHeaders = { ...headers, 'Authorization': `Bearer ${token}` };
        response = await fetchWithTimeout(`${BASE_URL}${endpoint}`, { ...options, headers: newHeaders }, timeoutMs);
      }
    }
  }

  return parseResponse(response);
};

export const api = {
  get: (endpoint: string) => request(endpoint, { method: 'GET' }),
  post: (endpoint: string, data: any) => request(endpoint, { method: 'POST', body: JSON.stringify(data) }),
  put: (endpoint: string, data: any) => request(endpoint, { method: 'PUT', body: JSON.stringify(data) }),
  patch: (endpoint: string, data: any) => request(endpoint, { method: 'PATCH', body: JSON.stringify(data) }),
  delete: (endpoint: string) => request(endpoint, { method: 'DELETE' }),

  // Para subir archivos IFC, usa este método
  postFormData: (endpoint: string, formData: FormData) => request(endpoint, {
    method: 'POST',
    body: formData,
  }),

  // Para fijar/reemplazar la portada de un proyecto (PUT + multipart)
  putFormData: (endpoint: string, formData: FormData) => request(endpoint, {
    method: 'PUT',
    body: formData,
  }),

  // Para descargar archivos binarios (IFC, Excel, etc.) que requieren
  // Authorization — un <a href> normal no puede mandar el header, así
  // que esto pide el archivo por fetch y devuelve el blob directo.
  getBlob: async (endpoint: string): Promise<Blob> => {
    const token = localStorage.getItem('accessToken');
    const response = await fetchWithTimeout(`${BASE_URL}${endpoint}`, {
      headers: { 'Authorization': token ? `Bearer ${token}` : '' },
    }, FILE_TIMEOUT_MS);
    if (!response.ok) {
      throw new Error('No se pudo descargar el archivo.');
    }
    return response.blob();
  },
};