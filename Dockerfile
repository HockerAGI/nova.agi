# Usa una imagen ligera de Node.js
FROM node:20-slim AS builder

WORKDIR /app

# Instalar dependencias
COPY package.json package-lock.json ./
RUN npm install

# Copiar el código y construir
COPY . .
RUN npm run build

# Imagen de producción
FROM node:20-slim

# Instalar dumb-init para un manejo correcto de señales y evitar procesos zombis
RUN apt-get update && apt-get install -y dumb-init && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Copiar artefactos construidos
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/node_modules ./node_modules
COPY package.json ./

# Seguridad Vertx: Crear usuario no-root
RUN useradd -m hocker
USER hocker

EXPOSE 8080

# Usar dumb-init como PID 1
ENTRYPOINT ["/usr/bin/dumb-init", "--"]
CMD ["node", "dist/index.js"]