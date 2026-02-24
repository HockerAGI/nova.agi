import Fastify from "fastify";
import { handleChat } from "../index.js"; // Asegúrate de exportar handleChat en index.ts

const app = Fastify({ logger: false });

// Replicamos la ruta de health para el load balancer de Vercel
app.get("/api/health", async () => ({
  ok: true,
  service: "nova.agi.vercel",
  fabric_ready: true,
  ts: new Date().toISOString()
}));

// Endpoints principales
app.post("/api/chat", handleChat);
app.post("/api/v1/chat", handleChat);

// Adaptador para Vercel Serverless Functions
export default async function handler(req: any, res: any) {
  await app.ready();
  app.server.emit("request", req, res);
}