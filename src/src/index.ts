import http from "node:http";
import crypto from "node:crypto";
import { adminSupabase } from "./lib/supabase.js";
import { signCommand } from "./lib/security.js";
import { registerDefaultAgis } from "./lib/register-agis.js";
import { interpretRules, type Intent } from "./lib/intents.js";
import { vercelRedeploy } from "./adapters/vercel.js";
import { interpretWithGemini } from "./lib/gemini.js";

const PORT = Number(process.env.PORT ?? 8080);
const KEY = process.env.NOVA_ORCHESTRATOR_KEY ?? "";
const SIGN_SECRET = process.env.HOCKER_COMMAND_SIGNING_SECRET ?? "";
const VERCEL_HOOK = process.env.VERCEL_DEPLOY_HOOK ?? "";
const DEFAULT_PROJECT_ID = (process.env.DEFAULT_PROJECT_ID ?? "global").toLowerCase();

const GEMINI_API_KEY = process.env.GEMINI_API_KEY ?? "";
const GEMINI_MODEL = process.env.GEMINI_MODEL ?? "gemini-2.0-flash";

const ALLOWED_ACTIONS = new Set(["enqueue", "vercel.redeploy", "unknown"]);
const ALLOWED_COMMANDS = new Set(["ping", "status", "read_dir", "read_file_head"]);
const SENSITIVE_COMMANDS = new Set(["read_dir", "read_file_head"]);

function json(res: http.ServerResponse, status: number, body: any) {
  res.writeHead(status, { "content-type": "application/json" });
  res.end(JSON.stringify(body));
}

function requireKey(req: http.IncomingMessage) {
  return req.headers["x-hocker-key"] === KEY;
}

async function readBody(req: http.IncomingMessage) {
  const chunks: Buffer[] = [];
  for await (const c of req) chunks.push(Buffer.from(c));
  const raw = Buffer.concat(chunks).toString("utf8");
  return raw ? JSON.parse(raw) : {};
}

async function killSwitchEnabled(project_id: string) {
  const sb = adminSupabase();
  const { data } = await sb
    .from("system_controls")
    .select("kill_switch")
    .eq("id", "global")
    .eq("project_id", project_id)
    .single();
  return Boolean(data?.kill_switch);
}

function normalizeProjectId(v: any) {
  const s = String(v ?? "").trim().toLowerCase();
  const cleaned = s.replace(/[^a-z0-9_-]/g, "");
  return cleaned || DEFAULT_PROJECT_ID;
}

function intentFromGemini(g: any): { reply: string; intent: Intent } | null {
  if (!g?.action?.type || !ALLOWED_ACTIONS.has(g.action.type)) return null;

  const reply = String(g.reply ?? "").trim() || "Ok.";
  if (g.action.type === "vercel.redeploy") return { reply, intent: { type: "vercel.redeploy", payload: {} } };

  if (g.action.type === "enqueue") {
    const command = String(g.action.command ?? "");
    if (!ALLOWED_COMMANDS.has(command)) return null;
    return { reply, intent: { type: "enqueue", command: command as any, payload: g.action.payload ?? {} } };
  }

  return { reply, intent: { type: "unknown", reason: "Gemini no detectó acción clara." } };
}

async function enqueueSignedCommand(args: {
  project_id: string;
  node_id: string;
  command: string;
  payload: any;
  created_by: string | null;
}) {
  if (!SIGN_SECRET) throw new Error("Missing signing secret");

  const sb = adminSupabase();
  const commandId = crypto.randomUUID();
  const signature = signCommand(SIGN_SECRET, { id: commandId, node_id: args.node_id, command: args.command, payload: args.payload });

  const status = SENSITIVE_COMMANDS.has(args.command) ? "needs_approval" : "queued";

  await sb.from("nodes").upsert({ id: args.node_id, project_id: args.project_id, name: args.node_id, type: "local", status: "unknown" });

  const { error } = await sb.from("commands").insert({
    id: commandId,
    project_id: args.project_id,
    node_id: args.node_id,
    command: args.command,
    payload: args.payload ?? {},
    signature,
    status,
    created_by: args.created_by
  });

  if (error) throw new Error(error.message);

  await sb.from("events").insert({
    project_id: args.project_id,
    node_id: "cloud-nova",
    level: "info",
    type: "command",
    message: `Comando encolado: ${args.command} (${status})`,
    data: { node_id: args.node_id, commandId, status }
  });

  return { commandId, status };
}

const server = http.createServer(async (req, res) => {
  try {
    if (req.url === "/health") return json(res, 200, { ok: true });

    if (!requireKey(req)) return json(res, 401, { ok: false, error: "Bad key" });

    const body = await readBody(req);
    const text = String(body.text ?? "");
    const node_id = String(body.node_id ?? "node-hocker-01");
    const user_id = body.user_id ? String(body.user_id) : null;
    const project_id = normalizeProjectId(body.project_id);

    if (!text && (req.url === "/v1/execute" || req.url === "/v1/chat")) {
      return json(res, 400, { ok: false, error: "Missing text" });
    }

    if (await killSwitchEnabled(project_id)) {
      return json(res, 423, { ok: false, error: "Kill-switch activo. Ejecución bloqueada." });
    }

    const sb = adminSupabase();
    await registerDefaultAgis(project_id);

    // Intent: Gemini -> fallback rules
    let finalIntent: Intent = interpretRules(text);
    let reply = "";

    const gem = await interpretWithGemini({ apiKey: GEMINI_API_KEY, model: GEMINI_MODEL, text });
    const g2 = gem ? intentFromGemini(gem) : null;
    if (g2) {
      finalIntent = g2.intent;
      reply = g2.reply;
    }

    if (req.method === "POST" && req.url === "/v1/execute") {
      if (finalIntent.type === "vercel.redeploy") {
        const result = await vercelRedeploy(VERCEL_HOOK);

        await sb.from("events").insert({
          project_id,
          node_id: "cloud-nova",
          level: "info",
          type: "vercel",
          message: "Redeploy disparado desde NOVA (execute)",
          data: { result, user_id }
        });

        await sb.from("audit_logs").insert({
          project_id,
          actor_type: "agi",
          actor_id: "nova",
          action: "vercel_redeploy",
          target: "vercel",
          meta: { user_id }
        });

        return json(res, 200, { ok: true, intent: finalIntent, result });
      }

      if (finalIntent.type === "enqueue") {
        const { commandId, status } = await enqueueSignedCommand({
          project_id,
          node_id,
          command: finalIntent.command,
          payload: finalIntent.payload ?? {},
          created_by: user_id
        });

        return json(res, 200, { ok: true, intent: finalIntent, commandId, status });
      }

      await sb.from("audit_logs").insert({
        project_id,
        actor_type: "agi",
        actor_id: "nova",
        action: "execute_unknown",
        target: `node:${node_id}`,
        meta: { text, user_id, reason: (finalIntent as any).reason ?? "" }
      });

      return json(res, 200, { ok: true, intent: finalIntent });
    }

    if (req.method === "POST" && req.url === "/v1/chat") {
      if (finalIntent.type === "vercel.redeploy") {
        const result = await vercelRedeploy(VERCEL_HOOK);
        return json(res, 200, {
          ok: true,
          reply: reply || "Listo. Ya disparé un redeploy en Vercel desde cloud.",
          action: { type: "vercel.redeploy", result }
        });
      }

      if (finalIntent.type === "enqueue") {
        const { commandId, status } = await enqueueSignedCommand({
          project_id,
          node_id,
          command: finalIntent.command,
          payload: finalIntent.payload ?? {},
          created_by: user_id
        });

        return json(res, 200, {
          ok: true,
          reply: reply || `Listo. Encolé "${finalIntent.command}" al nodo ${node_id}. (status=${status})`,
          action: { type: "enqueue", command: finalIntent.command, node_id, status },
          commandId
        });
      }

      return json(res, 200, {
        ok: true,
        reply: reply || "Aún no tengo esa acción configurada. Dime exactamente qué quieres ejecutar.",
        action: { type: "unknown" }
      });
    }

    return json(res, 404, { ok: false, error: "Not found" });
  } catch (e: any) {
    return json(res, 500, { ok: false, error: e?.message ?? "Error" });
  }
});

server.listen(PORT, () => console.log(`NOVA Orchestrator on :${PORT}`));