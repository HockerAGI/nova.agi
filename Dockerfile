FROM node:20-alpine

WORKDIR /app
COPY package.json package-lock.json* ./
RUN npm i --omit=dev

COPY tsconfig.json ./
COPY src ./src

RUN npm i -D typescript tsx @types/node && npm run build && npm prune --omit=dev

ENV PORT=8080
EXPOSE 8080
CMD ["node", "dist/index.js"]