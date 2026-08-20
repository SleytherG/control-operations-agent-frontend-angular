# ============================================================
# Dockerfile — Frontend Angular 21 / Nginx
# Multi-stage: build con Node → serve con Nginx alpine
# ============================================================

# ── Stage 1: Build Angular ──────────────────────────────────
FROM node:22-alpine AS builder

WORKDIR /app

# Copiar package files primero (caché de capas)
COPY package.json package-lock.json ./

# Instalar dependencias (--legacy-peer-deps resuelve conflictos de versiones entre paquetes Angular)
RUN npm ci --ignore-scripts --legacy-peer-deps

# Copiar el resto del código
COPY . .

# Build de producción
RUN npm run build:prod

# ── Stage 2: Serve con Nginx ────────────────────────────────
FROM nginx:alpine AS runtime

# Eliminar configuración default de nginx
RUN rm /etc/nginx/conf.d/default.conf

# Copiar nuestra configuración nginx (SPA fallback + gzip + caché)
COPY nginx.conf /etc/nginx/conf.d/default.conf

# Copiar el build de Angular
# Angular 17+ con builder 'application' genera en dist/<nombre>/browser
COPY --from=builder /app/dist/control-operaciones-agente-frontend/browser /usr/share/nginx/html

# Puerto 80
EXPOSE 80

CMD ["nginx", "-g", "daemon off;"]
