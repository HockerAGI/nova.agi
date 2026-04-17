import Fastify from "fastify";
import { randomUUID } from "node:crypto";
import { config } from "./config.js";
import { AGIS, pickAgi } from "./lib/agis.js";
import { enqueueActions } from "./lib/actions.js";
import { appendMessage, ensureThread, loadThreadMessages } from "./lib/memory.js";
import { createAdminSupabase } from "./lib/supabase.js";
import { HttpError, json, readJsonBody, requireAuth } from "./lib/http.js";
import { resolveProvider, resolveMode } from "./lib/router.js";
import { openaiRespond } from "./providers/openai.js";
import { geminiRespond } from "./providers/gemini.js";
import { anthropicRespond } from "./providers/anthropic.js";
import { ollamaRespond } from "./providers/ollama.js";
import type { ChatRequest, ChatResult, CompletionResult, JsonObject, Provider } from "./types.js";

function intentFromText(text: string): "general" | "code" | "ops" | "research" | "finance" | "social" {
  const t = text.toLowerCase();
  if (/(código|code|ts|typescript|sql|api|endpoint|backend|frontend|deploy|docker)/.test(t)) return "code";
  if (/(financ|costo|roi|cpl|cpa|presupuesto|factur|ledger|roi)/.test(t)) return "finance";
  if (/(ads|anuncio|marketing|campaña|reel|contenido|social|post|copy)/.test(t)) return "social";
  if (/(investig|document|análisis|análisis|research|auditor|revisión)/.test(t)) return "research";
  if (/(infra|servidor|cloud|docker|api|token|auth|seguridad|governance)/.test(t)) return "ops";
  return "general";
}

async function callProvider(
  provider: Provider,
  model: string,
  messages: { role: "system" | "user" | "assistant" | "tool"; content: string }[],
): Promise<CompletionResult> {
  if (provider === "openai" && config.openai.apiKey) {
    return openaiRespond({ apiKey: config.openai.apiKey, model, messages, timeoutMs: config.requestTimeoutMs });
  }
  if (provider === "gemini" && config.gemini.apiKey) {
    return geminiRespond({ apiKey: config.gemini.apiKey, model, messages, timeoutMs: config.requestTimeoutMs });
  }
  if (provider === "anthropic" && config.anthropic.apiKey) {
    return anthropicRespond({ apiKey: config.anthropic.apiKey, model, messages, timeoutMs: config.requestTimeoutMs });
  }
  return ollamaRespond({ baseUrl: config.ollama.baseUrl, model, messages, timeoutMs: config.requestTimeoutMs });
}

export function buildNovaApp() {
  const app = Fastify({ logger: true });
  const sb = createAdminSupabase();

  app.get("/health", async () => ({
    ok: true,
    service: "nova.agi",
    ts: new Date().toISOString(),
    agis: AGIS.length
  }));

  app.post("/v1/chat", async (req, reply) => {
    try {
      requireAuth(req);
      const body = (await readJsonBody<ChatRequest>(req)) as ChatRequest;

      const project_id = (body.project_id || "hocker-one").trim();
      const input = (body.message || body.text || "").trim();
      if (!input) throw new HttpError(400, "message/text es obligatorio.");

      const intent = intentFromText(input);
      const agi = pickAgi(intent);
      const provider = resolveProvider(body.prefer, agi.defaultProvider);
      const mode = resolveMode(body.mode, agi.defaultMode);
      const model =
        provider === "openai"
          ? mode === "fast"
            ? config.openai.modelFast
            : mode === "pro"
            ? config.openai.modelPro
            : config.openai.modelBase
          : provider === "gemini"
          ? mode === "fast"
            ? config.gemini.modelFast
            : mode === "pro"
            ? config.gemini.modelPro
            : config.gemini.modelBase
          : provider === "anthropic"
          ? mode === "fast"
            ? config.anthropic.modelFast
            : mode === "pro"
            ? config.anthropic.modelPro
            : config.anthropic.modelBase
          : mode === "fast"
          ? config.ollama.modelFast
          : mode === "pro"
          ? config.ollama.modelPro
          : config.ollama.modelBase;

      const thread = await ensureThread(sb, project_id, body.thread_id, body.user_id, input.slice(0, 64));
      await appendMessage(sb, thread.id, project_id, "user", input, {
        user_email: body.user_email ?? null,
        context_data: body.context_data ?? {}
      });

      const prior = await loadThreadMessages(sb, thread.id, project_id, 16);
      const messages = [
        { role: "system" as const, content: agi.systemPrompt },
        ...prior.map((m) => ({ role: m.role, content: m.content }))
      ];

      const completion = await callProvider(provider, model, messages);

      const reply = completion.text || "No se recibió respuesta del proveedor.";
      await appendMessage(sb, thread.id, project_id, "assistant", reply, {
        provider,
        model,
        agi_id: agi.id
      });

      const result: ChatResult = {
        ok: true,
        project_id,
        thread_id: thread.id,
        provider,
        model,
        intent,
        agi_id: agi.id,
        reply,
        actions: [],
        trace_id: req.headers["x-request-id"]?.toString() ?? null,
        meta: {
          node_env: config.nodeEnv,
          fallbackUsed: completion.fallbackUsed
        }
      };

      return json(reply, 200, result);
    } catch (error) {
      const e = error instanceof HttpError ? error : new HttpError(500, (error as Error)?.message || "Error");
      return json(reply, e.status, { ok: false, error: e.message, details: e.details ?? null });
    }
  });

  app.post("/v1/actions/enqueue", async (req, reply) => {
    try {
      requireAuth(req);
      const body = (await readJsonBody<{
        project_id: string;
        thread_id?: string | null;
        node_id?: string | null;
        actions: Array<{ command: string; payload?: JsonObject; node_id?: string }>;
        needs_approval?: boolean;
      }>(req)) as any;

      const rows = await enqueueActions(sb, {
        project_id: body.project_id,
        thread_id: body.thread_id ?? null,
        node_id: body.node_id ?? null,
        actions: body.actions ?? [],
        needsApproval: body.needs_approval ?? true
      });

      return json(reply, 200, { ok: true, actions: rows });
    } catch (error) {
      const e = error instanceof HttpError ? error : new HttpError(500, (error as Error)?.message || "Error");
      return json(reply, e.status, { ok: false, error: e.message });
    }
  });

  return app;
}