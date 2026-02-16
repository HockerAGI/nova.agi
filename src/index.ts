import Fastify from "fastify";
import crypto from "node:crypto";

import { config } from "./config.js";
import { requireAuth } from "./lib/http.js";
import { chooseRoute } from "./lib/router.js";
import { upsertThread, appendMessage, loadThread } from "./lib/memory.js";
import { executeActions } from "./lib/actions.js";

import { openaiChat } from "./providers/openai.js";
import { geminiChat } from "./providers/gemini.js";

import type { ChatRequest, ChatResponse, Action } from "./types.js";

function isUuid(v: string) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(v);
}

function safeJsonParse<T>(s: string): { ok: true; value: T } | { ok: false; error: string } {
  try {
    return { ok: true, value: JSON.parse(s) };
  } catch (e: any) {
    return { ok: false, error: e?.message ?? "JSON inválido" };
  }
}

function extractJsonLoose(text: string) {
  const start = text.indexOf("{");
  const end = text.lastIndexOf("}");
  if (start === -1 || end === -1 || end <= start) return null;
  return text.slice(start, end + 1);
}

const app = Fastify({ logger: true });

const SYSTEM_PROMPT = [
  "Tu nombre es NOVA. Eres la IA central del ecosistema HOCKER.",
  "Hablas claro, directo y profesional. Sin jerga técnica. Nada de humo.",
  "",
  "Reglas no negociables:",
  "- No ayudas con espionaje, bypass, hacking, malware, fingerprint spoofing, ni automatización encubierta.",
  "- Si algo depende de credenciales/infra, lo dices y dejas el sistema listo para conectar (sin inventar resultados).",
  "",
  "Modo chat:",
  "- Responde en texto normal, útil y accionable.",
  "",
  "Modo planner/actions:",
  "- Responde SOLO JSON válido con este formato:",
  '  { "text": "mensaje", "actions": [ { "node_id":"...", "command":"ping|status|read_dir|read_file_head", "payload": { } , "reason":"..." } ] }',
  "- Si no estás seguro, deja actions como [].",
  "- Nunca inventes salidas de comandos. Solo propones acciones; los resultados vienen del agente real."
].join("\n");

app.get("/health", async () => ({ ok: true }));

app.post("/", async (req, reply) => {
  return reply.code(404).send({ ok: false, error: "Usa POST /chat" });
});

app.post("/chat", async (req, reply) => {
  try {
    requireAuth(req.headers.authorization, config.orchestratorKey);

    const body = (req.body ?? {}) as ChatRequest;

    const project_id = String(body.project_id ?? config.commands.projectId).trim() || config.commands.projectId;

    const rawThread = body.thread_id ? String(body.thread_id).trim() : "";
    const thread_id = rawThread && isUuid(rawThread) ? rawThread : crypto.randomUUID();

    const message = String(body.message ?? "").trim();
    if (!message) return reply.code(400).send({ ok: false, error: "Falta message." });

    const prefer = (body.prefer ?? "openai") as "openai" | "gemini";
    const mode = (body.mode ?? "chat") as any;

    const wantJson = mode === "planner" || mode === "actions";
    const allowActionsHeader = req.headers["x-allow-actions"] as string | undefined;
    const allowActionsBody = Boolean(body.allow_actions);

    // Thread: best-effort (si aún no migras tablas, no tumba)
    await upsertThread(project_id, thread_id);

    const prev = await loadThread(project_id, thread_id, 30);
    const messages = [
      ...prev.map((m) => ({ role: m.role, content: m.content })),
      { role: "user" as const, content: message }
    ];

    // Guardamos el user message (best-effort)
    await appendMessage(project_id, thread_id, "user", message);

    // Route / AGI selection real (si tu router decide)
    const route = chooseRoute({ message, prefer });
    const modelPrefer = route.prefer ?? prefer;

    let assistantText = "";
    let provider = modelPrefer;
    let model = modelPrefer === "gemini" ? config.gemini.model : config.openai.model;
    let raw: any = null;
    let usage: any = null;

    if (modelPrefer === "gemini") {
      if (!config.gemini.apiKey) {
        return reply.code(500).send({ ok: false, error: "Falta GEMINI_API_KEY." });
      }
      const res = await geminiChat({
        apiKey: config.gemini.apiKey,
        model: config.gemini.model,
        system: SYSTEM_PROMPT,
        messages,
        wantJson
      });
      assistantText = res.assistantText;
      raw = res.raw;
      usage = res.usage;
      provider = "gemini";
      model = res.model ?? model;
    } else {
      if (!config.openai.apiKey) {
        return reply.code(500).send({ ok: false, error: "Falta OPENAI_API_KEY." });
      }
      const res = await openaiChat({
        apiKey: config.openai.apiKey,
        model: config.openai.model,
        system: SYSTEM_PROMPT,
        messages,
        wantJson
      });
      assistantText = res.assistantText;
      raw = res.raw;
      usage = res.usage;
      provider = "openai";
      model = res.model ?? model;
    }

    // Extraer actions solo si es planner/actions
    let actions: Action[] = [];
    if (wantJson && config.actionsEnabled) {
      const chunk = extractJsonLoose(assistantText);
      const parsed = chunk ? safeJsonParse<any>(chunk) : { ok: false as const, error: "No JSON" };

      if (parsed.ok && typeof parsed.value === "object" && parsed.value) {
        if (typeof parsed.value.text === "string") assistantText = parsed.value.text;
        if (Array.isArray(parsed.value.actions)) actions = parsed.value.actions;
      }
    }

    // Ejecutar acciones REALES (encolar en Supabase) con header+body+KillSwitch
    const action_results =
      actions.length > 0
        ? await executeActions(project_id, allowActionsHeader, allowActionsBody, actions)
        : [];

    // Guardamos respuesta (best-effort)
    await appendMessage(project_id, thread_id, "assistant", assistantText);

    const out: ChatResponse = {
      ok: true,
      thread_id,
      text: assistantText,
      actions: actions.length ? actions : undefined,
      action_results: action_results.length ? action_results : undefined,
      provider,
      model
    };

    return reply.code(200).send(out);
  } catch (e: any) {
    const msg = String(e?.message || e);
    return reply.code(401).send({ ok: false, error: msg });
  }
});

app.listen({ port: config.port, host: "0.0.0.0" }).catch((err) => {
  app.log.error(err);
  process.exit(1);
});