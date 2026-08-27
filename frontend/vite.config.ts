import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';

// Pruebas en red (túnel): el server de Vite por defecto solo escucha
// en localhost, y rechaza el Host header de cualquier hostname que no
// reconozca (protección anti DNS-rebinding de Vite). VITE_ALLOWED_HOSTS
// (.env del frontend, comma-separated) agrega el/los hostname(s)
// públicos detrás del túnel — sin setear nada, el comportamiento de
// siempre (solo localhost) no cambia. loadEnv (no import.meta.env,
// que solo existe del lado cliente) porque esto corre en el proceso
// Node de Vite, no en el browser.
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), 'VITE_');
  const allowedHosts = (env.VITE_ALLOWED_HOSTS ?? '')
    .split(',')
    .map((host) => host.trim())
    .filter((host) => host.length > 0);

  return {
    plugins: [react()],
    optimizeDeps: {
      include: ['jszip'],
      exclude: ['web-ifc'],
    },
    build: {
      target: 'esnext',
    },
    assetsInclude: ['**/*.wasm'],
    server: {
      // true = escuchar en todas las interfaces (0.0.0.0), no solo
      // localhost — necesario para que el túnel (o cualquier otra
      // máquina de la red) pueda llegar a este proceso.
      host: true,
      ...(allowedHosts.length > 0 ? { allowedHosts } : {}),
    },
  };
});