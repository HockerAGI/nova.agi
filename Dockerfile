FROM node:20-slim

WORKDIR /app
COPY package.json package-lock.json* ./
RUN npm install --omit=dev

COPY tsconfig.json ./tsconfig.json
COPY src ./src

RUN npm install --include=dev && npm run build && npm prune --omit=dev

ENV PORT=8080
EXPOSE 8080
CMD ["node", "dist/index.js"]