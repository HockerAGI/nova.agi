import type { IncomingMessage, ServerResponse } from "node:http";
import Fastify from "fastify";
import { handleChat } from "../app.js";
import { config } from "../config.js";
import { getNovaProviderStatus } from "../lib/provider-status.js";
import type { FastifyReply, FastifyRequest } from "fastify";

const app = Fastify({ logger: false });

function isAuthorized(req: FastifyRequest): boolean {
  if (!config.orchestratorKey) return true;
  return req.headers.authorization === `Bearer ${config.orchestratorKey}`;
}

async function handleProviderStatus(req: FastifyRequest, reply: FastifyReply) {
  if (!isAuthorized(req)) {
    return reply.code(401).send({ ok: false, error: "Unauthorized" });
  }

  return getNovaProviderStatus();
}


app.get("/api/health", async () => ({
  ok: true,
  service: "nova.agi.vercel",
  fabric_ready: true,
  hocker_one_api_url: config.hockerOneApiUrl,
  dispatch_path: "/api/commands/dispatch",
  ts: new Date().toISOString(),
}));

app.get("/api/providers/status", handleProviderStatus);
app.get("/api/v1/providers/status", handleProviderStatus);

app.post("/api/chat", handleChat);
app.post("/api/v1/chat", handleChat);
app.post("/api/v1/nova/interact", handleChat);

export default async function handler(req: IncomingMessage, res: ServerResponse): Promise<void> {
  await app.ready();
  app.server.emit("request", req, res);
}