import http from "node:http";
import { sbAdmin } from "./lib/supabase";
import { defaultNodeId, defaultProjectId, normalizeProjectId } from "./lib/project";
import { interpretWithGemini } from "./lib/gemini";
import { ruleIntent, Intent } from "./lib/intents";
import { registerDefaultAgis } from "./lib/register-agis";
import { signCommand } from "./lib/security";
import { vercelRedeploy } from "./adapters/vercel";

function json(res: http.ServerResponse, status: number, body: any) {
  const b = Buffer.from(JSON.stringify(body));
  res.writeHead(status, {
    "content-type": "application/json",
    "content-length": String(b.length)
  });
  res.end(b);
}

function readBody(req: http.IncomingMessage): Promise<any> {
  return new Promise((resolve) => {
    let data = "";
    req.on("data", (c) => (data += c));
    req.on("end", () => {
      try {
        resolve(data ? JSON.parse(data) : {});
      } catch {
        resolve({});
      }
    });
  });
}

function requireKey(req: http.IncomingMessage): boolean {
  const want = process.env.NOVA_ORCHESTRATOR_KEY ?? "";
  const got = String(req.headers["x-hocker-key"] ?? "");
  return Boolean(want && got && got === want);
}

async function killSwitchEnabled(project_id: string) {
  const sb = sbAdmin();
  const r = await sb.from("system_controls").select("kill_switch").eq("project_id", project_id).single();
  if (r.error) return false;
  return Boolean(r.data?.kill_switch);
}

async function ensureSeed(project_id: string) {
  const sb = sbAdmin();

  // Ensure project exists
  await sb.from("projects").upsert({ id: project_id, name: project_id }, { onConflict: "id" });

  // Ensure system_controls exists
  await sb
    .from("system_controls")
    .upsert({ project_id, kill_switch: false, meta: {}, updated_at: new Date().toISOString() }, { onConflict: "project_id" });

  // Register AGIs (offline)
  await registerDefaultAgis(project_id);

  // Ensure default node exists
  const node_id = defaultNodeId();
  await sb.from("nodes").upsert(
    {
      id: node_id,
      project_id,
      name: node_id,
      kind: "agent",
      status: "offline",
      meta: {}
    },
    { onConflict: "id" }
  );
}

async function handleChat(body: any) {
  const sb = sbAdmin();

  const text = String(body.text ?? "");
  const project_id = normalizeProjectId(body.project_id ?? defaultProjectId());
  const node_id = String(body.node_id ?? defaultNodeId());

  if (!text) return { ok: false, error: "Missing text" };

  await ensureSeed(project_id);

  if (await killSwitchEnabled(project_id)) {
    return { ok: false, error: "Kill-switch activo en este proyecto" };
  }

  // Fast rules first
  let intent: Intent = ruleIntent(text);
  let reply = "";

  // If unknown, ask Gemini
  if (intent.action === "UNKNOWN") {
    const g = await interpretWithGemini({ text, project_id, node_id });
    intent = g.intent;
    reply = g.reply;
  }

  // Execute intent
  if (intent.action === "PING") {
    reply = reply || "pong";
    return { ok: true, reply, action: "PING" };
  }

  if (intent.action === "NODES_LIST") {
    const r = await sb.from("nodes").select("id,name,status,last_seen").eq("project_id", project_id).order("id");
    if (r.error) return { ok: false, error: r.error.message };
    reply = reply || `Nodos: ${r.data.map((n) => `${n.id}(${n.status})`).join(", ")}`;
    return { ok: true, reply, action: "NODES_LIST", data: r.data };
  }

  if (intent.action === "AGIS_LIST") {
    const r = await sb.from("agis").select("id,name,status").eq("project_id", project_id).order("id");
    if (r.error) return { ok: false, error: r.error.message };
    reply = reply || `AGIs: ${r.data.map((a) => `${a.id}(${a.status})`).join(", ")}`;
    return { ok: true, reply, action: "AGIS_LIST", data: r.data };
  }

  if (intent.action === "SUPPLY_PRODUCTS_LIST") {
    const r = await sb.from("supply_products").select("sku,name,price_cents,stock,active").eq("project_id", project_id).order("created_at", { ascending: false });
    if (r.error) return { ok: false, error: r.error.message };
    reply = reply || `Productos: ${r.data.length}`;
    return { ok: true, reply, action: "SUPPLY_PRODUCTS_LIST", data: r.data };
  }

  if (intent.action === "SUPPLY_ORDERS_LIST") {
    const r = await sb.from("supply_orders").select("id,customer_name,status,total_cents,created_at").eq("project_id", project_id).order("created_at", { ascending: false });
    if (r.error) return { ok: false, error: r.error.message };
    reply = reply || `Órdenes: ${r.data.length}`;
    return { ok: true, reply, action: "SUPPLY_ORDERS_LIST", data: r.data };
  }

  // Command send
  if (intent.action === "COMMAND_SEND") {
    const p = (intent as any).params ?? {};
    const node = String(p.node_id ?? node_id);
    const cmd = String(p.command ?? "");
    const payload = (p.payload ?? {}) as Record<string, unknown>;

    if (!cmd) {
      return { ok: true, reply: "Dime qué comando quieres enviar.", action: "UNKNOWN" };
    }

    const ts = new Date().toISOString();
    const signature = signCommand({ node_id: node, command: cmd, payload, project_id, ts });

    const ins = await sb.from("commands").insert({
      project_id,
      node_id: node,
      command: cmd,
      payload,
      signature,
      status: "queued"
    }).select("id").single();

    if (ins.error) return { ok: false, error: ins.error.message };

    reply = reply || `Listo: comando ${cmd} en cola.`;
    return { ok: true, reply, action: "COMMAND_SEND", commandId: ins.data.id };
  }

  if (intent.action === "DEPLOY_HOCKER_ONE") {
    const r = await vercelRedeploy();
    if (!r.ok) return { ok: false, error: r.error };
    reply = reply || "Deploy disparado en Vercel.";
    return { ok: true, reply, action: "DEPLOY_HOCKER_ONE" };
  }

  return { ok: true, reply: reply || "Dime exactamente qué quieres hacer.", action: "UNKNOWN" };
}

async function handleExecute(body: any) {
  // This endpoint is for explicit calls from hocker.one
  const sb = sbAdmin();
  const project_id = normalizeProjectId(body.project_id ?? defaultProjectId());
  const node_id = String(body.node_id ?? defaultNodeId());
  const action = String(body.action ?? "");
  const params = (body.params ?? {}) as Record<string, unknown>;

  await ensureSeed(project_id);

  if (await killSwitchEnabled(project_id)) {
    return { ok: false, error: "Kill-switch activo en este proyecto" };
  }

  if (action === "DEPLOY_HOCKER_ONE") {
    const r = await vercelRedeploy();
    if (!r.ok) return { ok: false, error: r.error };
    return { ok: true, action, result: "deploy_triggered" };
  }

  if (action === "COMMAND_SEND") {
    const node = String(params.node_id ?? node_id);
    const cmd = String(params.command ?? "");
    const payload = (params.payload ?? {}) as Record<string, unknown>;
    if (!cmd) return { ok: false, error: "Missing params.command" };

    const ts = new Date().toISOString();
    const signature = signCommand({ node_id: node, command: cmd, payload, project_id, ts });

    const ins = await sb.from("commands").insert({
      project_id,
      node_id: node,
      command: cmd,
      payload,
      signature,
      status: "queued"
    }).select("id").single();

    if (ins.error) return { ok: false, error: ins.error.message };
    return { ok: true, action, commandId: ins.data.id };
  }

  return { ok: false, error: `Unknown action: ${action}` };
}

async function bootstrap() {
  // Ensure default seed
  const pid = defaultProjectId();
  await ensureSeed(pid);
  console.log(`[nova.agi] seeded project=${pid}`);
}

const server = http.createServer(async (req, res) => {
  if (req.method === "GET" && req.url === "/health") return json(res, 200, { ok: true });

  if (!requireKey(req)) return json(res, 401, { ok: false, error: "Unauthorized" });

  if (req.method === "POST" && req.url === "/v1/chat") {
    const body = await readBody(req);
    const out = await handleChat(body);
    return json(res, out.ok ? 200 : 400, out);
  }

  if (req.method === "POST" && req.url === "/v1/execute") {
    const body = await readBody(req);
    const out = await handleExecute(body);
    return json(res, out.ok ? 200 : 400, out);
  }

  return json(res, 404, { ok: false, error: "Not found" });
});

bootstrap()
  .then(() => {
    const port = Number(process.env.PORT ?? 8080);
    server.listen(port, () => console.log(`[nova.agi] listening on :${port}`));
  })
  .catch((e) => {
    console.error(e);
    process.exit(1);
  });