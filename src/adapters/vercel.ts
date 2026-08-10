import type { IncomingMessage, ServerResponse } from "node:http";
import { buildNovaApp } from "../app.js";
import { config } from "../config.js";

const app = buildNovaApp();

app.get("/api/health", async () => ({
  ok: true,
  service: "nova.agi.vercel",
  fabric_ready: true,
  hocker_one_api_url: config.hockerOneApiUrl,
  dispatch_path: "/api/commands/dispatch",
  ts: new Date().toISOString(),
}));

export default async function handler(req: IncomingMessage, res: ServerResponse): Promise<void> {
  await app.ready();
  app.server.emit("request", req, res);
}
