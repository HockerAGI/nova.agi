import Fastify from "fastify";
import { config } from "./config.js";
import type { ChatRequest, ChatResponse, Action } from "./types.js";
import { requireOrchestratorAuth, normalizeProjectId, isUuid } from "./lib/http.js";
import { newThreadId, upsertThread, appendMessage, loadRecentMessages } from "./lib/memory.js";
import { chooseRoute } from "./lib/router.js";
import { pickAgi } from "./lib/agis.js";
import { extractJsonLoose, safeJsonParse } from "./lib/stable-json.js";
import { openaiChat } from "./providers/openai.js";
import { geminiChat } from "./providers/gemini.js";
import { sbAdmin } from "./lib/supabase.js";
import { estimateTokensFromChars } from "./lib/usage.js";
import { executeActions } from "./lib/actions.js";
import { seedAgis } from "./lib/register-agis.js";

const app = Fastify({ logger: true });

app.get("/health", async () => ({
  ok: true,
  service: "nova.agi",
  ts: new Date().toISOString()
}));

app.post("/v1/seed", async (req, reply) => {
  const auth = requireOrchestratorAuth(req);
  if (!auth.ok) return reply.status(auth.status).send({ ok: false, error: auth.error });

  const body = (req as any).body ?? {};
  const project_id = normalizeProjectId(body?.project_id, config.defaultProjectId);

  const seeded = await seedAgis(project_id);
  return { ok: true, project_id, seeded };
});

app.post("/v1/chat", async (req, reply) => {
  const auth = requireOrchestratorAuth(req);
  if (!auth.ok) return reply.status(auth.status).send({ ok: false, error: auth.error });

  const body = ((req as any).body ?? {}) as ChatRequest;

  const project_id = normalizeProjectId(body?.project_id, config.defaultProjectId);

  const rawMsg = String(body?.message ?? body?.text ?? "").trim();
  if (!rawMsg) return reply.status(400).send({ ok: false, error: "Missing message/text" });

  let thread_id = String(body?.thread_id ?? "").trim();
  if (!thread_id || !isUuid(thread_id)) thread_id = newThreadId();

  const prefer = (body?.prefer ?? "auto") as any;
  const mode = (body?.mode ?? "auto") as any;

  // persist thread + user msg
  await upsertThread(project_id, thread_id, null);
  await appendMessage(project_id, thread_id, "user", rawMsg);

  const history = await loadRecentMessages(project_id, thread_id, 30);

  const route = await chooseRoute({ project_id, message: rawMsg, prefer, mode });
  const agi = pickAgi(route.intent, rawMsg);

  const system = [
    agi.system_prompt,
    "",
    "FORMATO DE SALIDA: intenta responder como JSON con esta forma:",
    `{ "reply": string, "actions": [ { "type": "event" | "enqueue_command", ... } ] }`,
    "Si NO hay acciones, actions = [].",
    "No inventes accesos. No prometas procesos falsos.",
    "Prohibido spyware/bypass/vigilancia encubierta."
  ].join("\n");

  let rawText = "";
  let provider = route.provider as "openai" | "gemini";
  let model = route.model as string;
  let usageExact: { input_tokens?: number; output_tokens?: number } | null = null;

  if (provider === "openai") {
    const r = await openaiChat({
      apiKey: config.openaiApiKey,
      model,
      system,
      history,
      userMessage: rawMsg
    });
    rawText = r.text;
    usageExact = r.usage ?? null;
  } else {
    const r = await geminiChat({
      apiKey: config.geminiApiKey,
      model,
      system,
      history,
      userMessage: rawMsg
    });
    rawText = r.text;
    usageExact = null;
  }

  // parse JSON loose
  let replyText = rawText.trim();
  let actions: Action[] = [];

  const jsonCandidate = extractJsonLoose(rawText);
  if (jsonCandidate) {
    const parsed = safeJsonParse<any>(jsonCandidate);
    if (parsed.ok && typeof parsed.value?.reply === "string") {
      replyText = parsed.value.reply;
      actions = Array.isArray(parsed.value.actions) ? parsed.value.actions : [];
    }
  }

  // persist assistant msg
  await appendMessage(project_id, thread_id, "assistant", replyText);

  // optional actions
  const allowActions = String((req.headers as any)["x-allow-actions"] ?? "0");
  const executed = await executeActions({ project_id, actions, allowActionsHeaderValue: allowActions });

  // track usage in llm_usage (no inventamos costo USD)
  const tokensIn = usageExact?.input_tokens ?? estimateTokensFromChars(rawMsg.length);
  const tokensOut = usageExact?.output_tokens ?? estimateTokensFromChars(replyText.length);

  const sb = sbAdmin();
  await sb.from("llm_usage").insert({
    project_id,
    actor: "nova",
    provider,
    model,
    tokens_in: tokensIn,
    tokens_out: tokensOut,
    cost_usd: 0,
    meta: {
      intent: route.intent,
      router: route.meta,
      agi_id: agi.id,
      usage_exact: usageExact
    }
  }).catch(() => { /* si tu schema aún no trae llm_usage, no rompemos el chat */ });

  const resp: ChatResponse = {
    ok: true,
    project_id,
    thread_id,
    provider,
    model,
    intent: route.intent,
    agi_id: agi.id,
    reply: replyText,
    actions_executed: executed,
    meta: {
      router: route.meta,
      note: "Memoria persistente en nova_threads/nova_messages."
    }
  };

  return resp;
});

app.listen({ port: config.port, host: "0.0.0.0" }).then(() => {
  // eslint-disable-next-line no-console
  console.log(`nova.agi listening on :${config.port}`);
});