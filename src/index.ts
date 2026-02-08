import "dotenv/config";
import http from "http";
import { requireApiKey } from "./lib/security.js";
import { decide } from "./lib/decide.js";
import { logEvent } from "./lib/synapse.js";
import { remember } from "./lib/memory.js";

const PORT = Number(process.env.PORT || 8080);

async function readJson(req: http.IncomingMessage): Promise<any> {
  const chunks: Buffer[] = [];
  for await (const chunk of req) chunks.push(Buffer.from(chunk));
  const raw = Buffer.concat(chunks).toString("utf8");
  return raw ? JSON.parse(raw) : {};
}

function send(res: http.ServerResponse, status: number, body: any) {
  const json = JSON.stringify(body);
  res.writeHead(status, {
    "Content-Type": "application/json",
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers": "content-type,x-hocker-key"
  });
  res.end(json);
}

function handleCors(req: http.IncomingMessage, res: http.ServerResponse) {
  if (req.method === "OPTIONS") {
    res.writeHead(204, {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Headers": "content-type,x-hocker-key",
      "Access-Control-Allow-Methods": "GET,POST,OPTIONS"
    });
    res.end();
    return true;
  }
  return false;
}

const server = http.createServer(async (req, res) => {
  try {
    if (handleCors(req, res)) return;

    const url = new URL(req.url || "/", `http://${req.headers.host || "localhost"}`);

    if (req.method === "GET" && url.pathname === "/health") {
      return send(res, 200, { ok: true });
    }

    // Auth
    const reqAsFetch = new Request("http://local", { headers: new Headers(req.headers as any) });
    if (url.pathname.startsWith("/v1/")) requireApiKey(reqAsFetch);

    // /v1/chat
    if (req.method === "POST" && url.pathname === "/v1/chat") {
      const body = await readJson(req);
      const project_id = body.project_id;
      const text = String(body.text || "");
      if (!project_id || !text) return send(res, 400, { error: "Missing project_id or text" });

      await logEvent({ project_id, type: "chat.user", source: "hocker.one", message: text, meta: { channel: "chat" } });

      const actions = await decide({ project_id, node_id: body.node_id ?? null, text });
      const reply = actions.find(a => a.type === "reply") as any;

      if (reply?.text) {
        await logEvent({ project_id, type: "chat.nova", source: "nova.agi", message: reply.text });
        await remember({ project_id, kind: "chat", content: `USER: ${text}\nNOVA: ${reply.text}` }).catch(() => {});
      }

      return send(res, 200, { reply: reply?.text ?? "OK", actions });
    }

    // /v1/execute (instrucción → acciones + crea comandos)
    if (req.method === "POST" && url.pathname === "/v1/execute") {
      const body = await readJson(req);
      const project_id = body.project_id;
      const instruction = String(body.instruction || "");
      const node_id = body.node_id ?? null;

      if (!project_id || !instruction) return send(res, 400, { error: "Missing project_id or instruction" });

      await logEvent({ project_id, type: "execute.request", source: "hocker.one", node_id, message: instruction });

      const actions = await decide({ project_id, node_id, text: instruction });

      // crear comandos en DB (needs_approval por default)
      const created: any[] = [];
      for (const a of actions) {
        if (a.type !== "create_command") continue;

        // Inserta como needs_approval (tu panel ya tiene aprobación → queued)
        const { supabaseAdmin } = await import("./lib/supabase.js");
        const sb = supabaseAdmin();

        const { data, error } = await sb.from("commands").insert({
          project_id,
          node_id: a.node_id,
          command: a.command,
          payload: a.payload,
          status: a.needs_approval ? "needs_approval" : "queued"
        }).select("*").single();

        if (error) throw error;
        created.push(data);
      }

      const reply = actions.find(a => a.type === "reply") as any;
      await logEvent({
        project_id,
        type: "execute.plan",
        source: "nova.agi",
        node_id,
        message: reply?.text ?? "Plan generado",
        meta: { created_commands: created.map(c => c.id) }
      });

      return send(res, 200, { actions, created_commands: created });
    }

    // /v1/synapse (evento genérico)
    if (req.method === "POST" && url.pathname === "/v1/synapse") {
      const body = await readJson(req);
      const project_id = body.project_id;
      if (!project_id) return send(res, 400, { error: "Missing project_id" });

      await logEvent({
        project_id,
        type: String(body.type || "synapse.event"),
        source: String(body.source || "api"),
        node_id: body.node_id ?? null,
        severity: body.severity ?? "info",
        message: String(body.message || "event"),
        meta: body.meta ?? {}
      });

      return send(res, 200, { ok: true });
    }

    return send(res, 404, { error: "Not found" });
  } catch (e: any) {
    const status = e?.status || 500;
    return send(res, status, { error: e?.message || "Server error" });
  }
});

server.listen(PORT, () => console.log(`nova.agi listening on ${PORT}`));