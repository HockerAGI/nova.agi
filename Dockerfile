FROM node:20-slim

WORKDIR /app
COPY package.json package-lock.json* ./
RUN npm ci || npm i

COPY . .
RUN npm run build

ENV PORT=8080
EXPOSE 8080
CMD ["npm","start"]