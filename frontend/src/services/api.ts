const BASE_URL = 'http://localhost:4000';

const parseResponse = async (response: Response) => {
  const contentType = response.headers.get('content-type') || '';
  if (!response.ok) {
    if (contentType.includes('application/json')) {
      const errorData = await response.json();
      throw new Error(errorData.message || 'Error en la petición');
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
      const response = await fetch(`${BASE_URL}/api/auth/refresh`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token: refresh }),
      });

      if (!response.ok) throw new Error();
      const data = await response.json();
      localStorage.setItem('accessToken', data.accessToken);
      return data.accessToken;
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
  
  const headers = {
    ...options.headers,
    ...(isFormData ? {} : { 'Content-Type': 'application/json' }),
    'Authorization': token ? `Bearer ${token}` : '',
  };

  let response = await fetch(`${BASE_URL}${endpoint}`, { ...options, headers });

  if (!response.ok) {
  const errorData = await response.clone().json().catch(() => ({}));
  console.log('Error completo del backend:', errorData); // TEMPORAL

  if (errorData.code === "AUTH_ACCESS_TOKEN_EXPIRED") {
    token = await refreshToken();
    if (token) {
      const newHeaders = { ...headers, 'Authorization': `Bearer ${token}` };
      response = await fetch(`${BASE_URL}${endpoint}`, { ...options, headers: newHeaders });
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
  })
};