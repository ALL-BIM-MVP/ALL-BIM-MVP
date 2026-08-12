import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  optimizeDeps: {
    include: ['jszip'],
    exclude: ['@ifc-lite/parser', '@ifc-lite/geometry', '@ifc-lite/renderer', 'web-ifc'],
  },
  build: {
    target: 'esnext',
  },
  assetsInclude: ['**/*.wasm'],
});