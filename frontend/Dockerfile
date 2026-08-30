# Build de producción de verdad (no "npm run dev" corriendo para
# siempre) — antes el frontend corría nativo específicamente por esto:
# VITE_API_URL queda GRABADO adentro de los archivos ya compilados, no
# es una variable de entorno que se lea en tiempo de ejecución como en
# el backend. Por eso entra acá como ARG (tiempo de build), no ENV del
# contenedor final — cambiar el dominio público implica reconstruir
# esta imagen, mismo criterio que ya se usa con el backend
# (docker compose up -d --build backend después de tocar el .env).
#
# npx vite build (NO "npm run build"): el script de package.json es
# "tsc && vite build", pero este frontend no tiene tsconfig.json
# propio — tsc fallaría solo. vite build (esbuild) ya hace el
# transpile/bundle real sin necesitar eso.
FROM node:24-slim AS build
WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci

COPY . .

ARG VITE_API_URL
ENV VITE_API_URL=${VITE_API_URL}
RUN npx vite build

# Server final — liviano, solo sirve los archivos estáticos ya
# armados. nginx.conf de al lado resuelve el fallback de rutas de
# React Router (/dashboard/projects/5 recargado con F5 tiene que
# devolver index.html, no un 404 de nginx).
FROM nginx:alpine
COPY --from=build /app/dist /usr/share/nginx/html
COPY nginx.conf /etc/nginx/conf.d/default.conf

EXPOSE 80
