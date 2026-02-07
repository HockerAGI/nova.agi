import http from "node:http";
import { timingSafeEqual } from "./lib/security.js";
import { decide } from "./lib/decide.js";

const PORT = Number(process.env.PORT ?? "8080");
const KEY = process.env.NOVA_ORCHESTRATOR_KEY ?? "";

function json(res: http.ServerResponse, status: number, data: any) {
  res.writeHead(status, { "content-type": "application/json; charset=utf-8" });
  res.end(JSON.stringify(data));
}

async function readBody(req: http.IncomingMessage) {
  const chunks: Buffer[] = [];
  for await (const c of req) chunks.push(Buffer.from(c));
  const raw = Buffer.concat(chunks).toString("utf8");
  try { return JSON.parse(raw || "{}"); } catch { return {}; }
}

function requireKey(req: http.IncomingMessage) {
  if (!KEY) return false;
  const got = String(req.headers["x-hocker-key"] ?? "");
  if (!got) return false;
  return timingSafeEqual(got, KEY);
}

http.createServer(async (req, res) => {
  const url = new URL(req.url ?? "/", "http://localhost");

  if (req.method === "GET" && url.pathname === "/health") {
    return json(res, 200, { ok: true, service: "nova.agi" });
  }

  if (req.method !== "POST") return json(res, 405, { ok: false, error: "Method not allowed" });
  if (!requireKey(req)) return json(res, 401, { ok: false, error: "Bad key" });

  if (url.pathname === "/v1/chat") {
    const body = await readBody(req);
    const project_id = String(body.project_id ?? "global");
    const thread_id = String(body.thread_id ?? "");
    const user_id = String(body.user_id ?? "");
    const node_id = String(body.node_id ?? "node-cloudrun-01");
    const text = String(body.text ?? "");

    if (!thread_id || !user_id || !text) {
      return json(res, 400, { ok: false, error: "Faltan campos (thread_id, user_id, text)" });
    }

    const out = await decide({ project_id, thread_id, user_id, node_id, text });
    return json(res, 200, { ok: true, ...out });
  }

  return json(res, 404, { ok: false, error: "Not found" });
}).listen(PORT, () => {
  console.log(`[nova.agi] listening on :${PORT}`);
});