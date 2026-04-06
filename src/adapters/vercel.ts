import Fastify from "fastify";
import type { IncomingMessage, ServerResponse } from "node:http";
import { config } from "../config.js";
import { handleChat } from "../index.js";

const app = Fastify({ logger: false });

app.get("/api/health", async () => ({
  ok: true,
  service: "nova.agi.vercel",
  fabric_ready: true,
  hocker_one_api_url: config.hockerOneApiUrl,
  dispatch_path: "/api/commands/dispatch",
  ts: new Date().toISOString(),
}));

app.post("/api/chat", handleChat);
app.post("/api/v1/chat", handleChat);

export default async function handler(
  req: IncomingMessage,
  res: ServerResponse,
): Promise<void> {
  await app.ready();
  app.server.emit("request", req, res);
}