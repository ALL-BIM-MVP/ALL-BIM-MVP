// src/services/api.ts
const BASE_URL = 'http://localhost:4000';

export const api = {
  post: async (endpoint: string, data: any) => {
    const token = localStorage.getItem("accessToken");

    const response = await fetch(`${BASE_URL}${endpoint}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: token ? `Bearer ${token}` : ""
      },
      body: JSON.stringify(data),
    });

    if (!response.ok) {
      const errorData = await response.json();
      throw new Error(errorData.message || 'Error en la petición');
    }

    return await response.json();
  },

  get: async (endpoint: string) => {
    const token = localStorage.getItem("accessToken");

    const response = await fetch(`${BASE_URL}${endpoint}`, {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
        Authorization: token ? `Bearer ${token}` : ""
      },
    });

    if (!response.ok) {
      const errorData = await response.json();
      throw new Error(errorData.message || 'Error en la petición');
    }

    return await response.json();
  }
};