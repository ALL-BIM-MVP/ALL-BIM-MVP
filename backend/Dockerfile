# Imagen combinada Node + Python — a propósito, no son dos
# contenedores separados. El backend invoca Python como subprocess
# local (child_process.execFile, ver ifc-processing-runner.ts:
# REPO_ROOT se calcula subiendo desde backend/dist/services/ y de ahí
# resuelve processing/) — necesitan compartir filesystem, no red.
#
# Build context: la RAÍZ del repo (docker-compose.yml usa
# "context: .", no "context: ./backend") porque este Dockerfile
# también necesita copiar processing/, un hermano de backend/, no un
# hijo — ver docker-compose.yml.
#
# Base: imagen oficial de Python (trae la versión exacta que
# ifcopenshell ya probó localmente, 3.14) + Node 24 instalado encima
# vía NodeSource — al revés (Node como base + Python por apt) es más
# frágil: los repos de Debian no siempre traen la versión de Python
# más nueva.
FROM python:3.14-slim

RUN apt-get update && apt-get install -y --no-install-recommends \
        curl ca-certificates gnupg \
    && curl -fsSL https://deb.nodesource.com/setup_24.x | bash - \
    && apt-get install -y --no-install-recommends nodejs \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Dependencias de Python primero — cambian mucho menos seguido que el
# código, así el layer de pip install queda cacheado la mayoría de las
# veces que se reconstruye la imagen.
COPY processing/requirements.txt processing/requirements.txt
RUN pip install --no-cache-dir -r processing/requirements.txt

# Dependencias de Node — mismo criterio de cache.
COPY backend/package.json backend/package-lock.json backend/
RUN cd backend && npm ci

# Código real de las dos partes, DESPUÉS de instalar dependencias
# (así un cambio de código no invalida los dos layers de arriba).
COPY backend/ backend/
COPY processing/ processing/

RUN cd backend && npm run build

WORKDIR /app/backend
EXPOSE 4000

CMD ["node", "dist/index.js"]
