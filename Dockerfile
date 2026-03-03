FROM node:20-slim AS builder
WORKDIR /app

# No hay package-lock.json en tu repo actual, así que copiamos solo package.json
COPY package.json ./
RUN npm install

COPY . .
RUN npm run build

FROM node:20-slim

RUN apt-get update && apt-get install -y dumb-init && rm -rf /var/lib/apt/lists/*
WORKDIR /app

COPY --from=builder /app/dist ./dist
COPY --from=builder /app/node_modules ./node_modules
COPY package.json ./

# Opcional: reducir deps dev en runtime (no rompe si falla)
RUN npm prune --omit=dev || true

RUN useradd -m hocker
USER hocker

EXPOSE 8080
ENTRYPOINT ["/usr/bin/dumb-init", "--"]
CMD ["node", "dist/index.js"]