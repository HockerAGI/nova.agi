# -------- Builder --------
FROM node:20-slim AS builder
WORKDIR /app

COPY package.json package-lock.json* tsconfig.json ./
COPY src ./src

RUN npm install --no-audit --no-fund
RUN npm run build

# -------- Runner --------
FROM node:20-slim AS runner
WORKDIR /app

ENV NODE_ENV=production
ENV PORT=8080

COPY package.json package-lock.json* ./
RUN npm install --omit=dev --no-audit --no-fund

COPY --from=builder /app/dist ./dist

EXPOSE 8080
CMD ["node","dist/index.js"]