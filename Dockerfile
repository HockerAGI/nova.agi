FROM node:20-slim

WORKDIR /app
COPY package.json tsconfig.json ./
COPY src ./src
COPY README.md ./

RUN npm install --omit=dev
RUN npm run build

ENV NODE_ENV=production
ENV PORT=8080

EXPOSE 8080
CMD ["node", "dist/index.js"]