import http from "node:http";
import { randomUUID } from "node:crypto";
import { sbAdmin } from "./lib/supabase.js";
import { signCommand, timingSafeEqual } from "./lib/security.js";
import { registerDefaultAgis } from "./lib/register-agis.js";
import { interpretRules } from "./lib/intents.js";
import { geminiStructured } from "./lib/gemini.js";
import { vercelRedeploy } from "./adapters/vercel.js";

const PORT = Number(process.env.PORT ?? "8080");
const ORCH_KEY = process.env.NOVA_ORCHESTRATOR_KEY ?? "";
const SIGNING_SECRET = process.env.HOCKER_COMMAND_SIGNING_SECRET ?? "";
const GEMINI_API_KEY = process.env.GEMINI_API_KEY ?? "";
const GEMINI_MODEL = process.env.GEMINI_MODEL ?? "gemini-2.5-flash";

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

function requireKey(req: http.IncomingMessage): boolean {
  if (!ORCH_KEY) return false;
  const got = String(req.headers["x-hocker-key"] ?? "");
  if (!got) return false;
  return timingSafeEqual(got, ORCH_KEY);
}

async function killSwitch(project_id: string) {
  const sb = sbAdmin();
  const { data } = await sb
    .from("system_controls")
    .select("kill_switch")
    .eq("project_id", project_id)
    .eq("id", "global")
    .maybeSingle();

  return Boolean(data?.kill_switch);
}

type GeminiOut = {
  reply: string;
  action: { type: "reply" | "enqueue_command" | "redeploy_vercel" | "register_agis"; command?: string; payload?: any; needs_approval?: boolean };
};

const ACTION_SCHEMA = {
  type: "OBJECT",
  properties: {
    reply: { type: "STRING" },
    action: {
      type: "OBJECT",
      properties: {
        type: { type: "STRING" },
        command: { type: "STRING" },
        payload: { type: "OBJECT" },
        needs_approval: { type: "BOOLEAN" }
      },
      required: ["type"],
      propertyOrdering: ["type", "command", "payload", "needs_approval"]
    }
  },
  required: ["reply", "action"],
  propertyOrdering: ["reply", "action"]
};

async function decide(text: string): Promise<GeminiOut> {
  // si no hay Gemini key, usamos reglas
  if (!GEMINI_API_KEY) {
    const a = interpretRules(text);
    if (a.type === "reply") return { reply: a.message, action: { type: "reply" } };
    if (a.type === "redeploy_vercel") return { reply: "Ok. Voy a redeploy.", action: { type: "redeploy_vercel" } };
    if (a.type === "register_agis") return { reply: "Ok. Voy a registrar AGIs.", action: { type: "register_agis" } };
    return { reply: a.message ?? "Ok.", action: { type: "enqueue_command", command: a.command, payload: a.payload, needs_approval: a.needs_approval } };
  }

  const system =
    "Eres NOVA (orchestrator). Devuelve JSON válido exactamente con el schema. " +
    "action.type solo puede ser: reply, enqueue_command, redeploy_vercel, register_agis. " +
    "Si es enqueue_command, incluye command y payload.";

  return await geminiStructured<GeminiOut>({
    apiKey: GEMINI_API_KEY,
    model: GEMINI_MODEL,
    system,
    user: text,
    schema: ACTION_SCHEMA as any
  });
}

http
  .createServer(async (req, res) => {
    const url = new URL(req.url ?? "/", "http://localhost");

    if (url.pathname === "/health") return json(res, 200, { ok: true });

    if (!requireKey(req)) return json(res, 401, { ok: false, error: "Bad key" });

    if (req.method !== "POST") return json(res, 405, { ok: false, error: "Method not allowed" });

    const body = await readBody(req);
    const text = String(body.text ?? "");
    const node_id = String(body.node_id ?? "node-hocker-01");
    const project_id = String(body.project_id ?? "global");
    const user_id = body.user_id ? String(body.user_id) : null;

    if (!text) return json(res, 400, { ok: false, error: "Falta text" });

    if (await killSwitch(project_id)) {
      return json(res, 503, { ok: false, error: "Kill-switch activo (proyecto apagado)" });
    }

    // asegura AGIs registradas (no levanta servicios, solo las registra)
    await registerDefaultAgis(project_id);

    const out = await decide(text);

    // endpoints
    if (url.pathname === "/v1/chat") {
      if (out.action.type === "enqueue_command") {
        const sb = sbAdmin();
        const id = randomUUID();

        if (!SIGNING_SECRET) return json(res, 500, { ok: false, error: "Falta HOCKER_COMMAND_SIGNING_SECRET" });

        const command = String(out.action.command ?? "");
        const payload = out.action.payload ?? {};
        if (!command) return json(res, 400, { ok: false, error: "Falta command" });

        const signature = signCommand(SIGNING_SECRET, { id, node_id, command, payload });

        const status = out.action.needs_approval ? "needs_approval" : "queued";

        const { error } = await sb.from("commands").insert({
          id,
          project_id,
          node_id,
          command,
          payload,
          status,
          signature,
          created_by: user_id
        });

        if (error) return json(res, 500, { ok: false, error: error.message });

        return json(res, 200, { ok: true, reply: out.reply, enqueued: true, command_id: id, status });
      }

      if (out.action.type === "redeploy_vercel") {
        const hook = process.env.VERCEL_DEPLOY_HOOK ?? "";
        if (!hook) return json(res, 500, { ok: false, error: "Falta VERCEL_DEPLOY_HOOK" });
        const r = await vercelRedeploy(hook);
        return json(res, 200, { ok: true, reply: out.reply || "Redeploy enviado.", redeploy: r });
      }

      if (out.action.type === "register_agis") {
        await registerDefaultAgis(project_id);
        return json(res, 200, { ok: true, reply: out.reply || "AGIs registradas." });
      }

      return json(res, 200, { ok: true, reply: out.reply });
    }

    if (url.pathname === "/v1/execute") {
      // execute es para acciones rápidas (no chat), por ahora mismo motor:
      const out2 = await decide(text);
      return json(res, 200, { ok: true, decided: out2 });
    }

    return json(res, 404, { ok: false, error: "Not found" });
  })
  .listen(PORT, () => {
    console.log(`[nova.agi] listening on :${PORT}`);
  });