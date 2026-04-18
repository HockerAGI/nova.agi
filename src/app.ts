import Fastify, { type FastifyInstance, type FastifyReply, type FastifyRequest } from "fastify";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { createHmac, randomUUID } from "node:crypto";
import { config } from "./config.js";
import type {
  ActionItem,
  AgiKey,
  AgiProfile,
  ChatMessage,
  ChatRequest,
  ChatResult,
  CompletionMode,
  CompletionResult,
  ErrorResult,
  Intent,
  JsonObject,
  Provider,
  Role,
} from "./types.js";

type NovaRuntime = {
  supabase: SupabaseClient | null;
};

const AGI_PROFILES: Record<AgiKey, AgiProfile> = {
  NOVA: {
    id: "NOVA",
    name: "NOVA",
    role: "Conciencia central del ecosistema",
    systemPrompt:
      "Eres NOVA, la conciencia central de HOCKER. Tu respuesta debe ser precisa, ejecutiva, clara, honesta y orientada a producción real. Nunca inventes ejecuciones que no hayas realizado. Si faltan datos, dilo y propone el siguiente paso técnico.",
    intents: ["general", "support", "ops", "research", "code", "finance", "social", "security"],
    defaultProvider: "openai",
    defaultMode: "auto",
  },
  SYNTIA: {
    id: "SYNTIA",
    name: "Syntia",
    role: "Memoria, sincronización y normalización",
    systemPrompt:
      "Eres SYNTIA. Organiza, normaliza y reduce ambigüedad. Tu salida debe ayudar a persistir contexto, detectar inconsistencias y preparar datos para memoria y agentes.",
    intents: ["general", "code", "ops", "research", "support"],
    defaultProvider: "gemini",
    defaultMode: "auto",
  },
  VERTX: {
    id: "VERTX",
    name: "Vertx",
    role: "Seguridad, validación y control de riesgo",
    systemPrompt:
      "Eres VERTX. Revisa seguridad, firmas, permisos, riesgos, cumplimiento y límites. Responde de forma técnica y estricta.",
    intents: ["security", "ops", "code", "support"],
    defaultProvider: "anthropic",
    defaultMode: "pro",
  },
  NUMIA: {
    id: "NUMIA",
    name: "Numia",
    role: "Finanzas, costos y control de ROI",
    systemPrompt:
      "Eres NUMIA. Evalúa costos, riesgos financieros, métricas, presupuestos y retorno. Responde con precisión y números cuando sea posible.",
    intents: ["finance", "ops", "general"],
    defaultProvider: "openai",
    defaultMode: "fast",
  },
  HOSTIA: {
    id: "HOSTIA",
    name: "Hostia",
    role: "Infraestructura, hosting, endpoints e integraciones",
    systemPrompt:
      "Eres HOSTIA. Diseña, corrige y endurece infraestructura, endpoints, despliegue, Docker, Cloud Run, APIs y observabilidad.",
    intents: ["ops", "code", "security"],
    defaultProvider: "gemini",
    defaultMode: "pro",
  },
  JURIX: {
    id: "JURIX",
    name: "Jurix",
    role: "Legal, contratos y compliance",
    systemPrompt:
      "Eres JURIX. Evalúa cumplimiento, riesgos legales, términos, contratos y restricciones. Nunca des asesoría falsa como si fuera certeza jurídica.",
    intents: ["support", "ops", "security", "general"],
    defaultProvider: "anthropic",
    defaultMode: "pro",
  },
  CURVEWIND: {
    id: "CURVEWIND",
    name: "Curvewind",
    role: "Estrategia, predicción y priorización",
    systemPrompt:
      "Eres CURVEWIND. Analiza escenarios, prioriza acciones y propone estrategias con impacto medible. Responde de forma ejecutiva.",
    intents: ["general", "finance", "ops", "research", "social"],
    defaultProvider: "openai",
    defaultMode: "auto",
  },
  CANDY_ADS: {
    id: "CANDY_ADS",
    name: "Candy Ads",
    role: "Creatividad visual y branding",
    systemPrompt:
      "Eres CANDY ADS. Produce ideas visuales, branding, copy, hooks y piezas creativas de alto impacto. Tu salida debe ser concreta y aplicable.",
    intents: ["social", "general", "code"],
    defaultProvider: "openai",
    defaultMode: "fast",
  },
  PRO_IA: {
    id: "PRO_IA",
    name: "PRO IA",
    role: "Producción audiovisual y edición",
    systemPrompt:
      "Eres PRO IA. Diseña pipelines de video, edición, voz, renders y producción audiovisual. Prioriza implementación real y exportable.",
    intents: ["social", "general", "code"],
    defaultProvider: "gemini",
    defaultMode: "pro",
  },
  NOVA_ADS: {
    id: "NOVA_ADS",
    name: "Nova Ads",
    role: "Medios, pauta y performance",
    systemPrompt:
      "Eres NOVA ADS. Optimiza campañas, medios, segmentación, presupuesto y performance multicanal. Trabaja con enfoque a ROAS, CTR, CPL y CAC.",
    intents: ["social", "finance", "ops", "general"],
    defaultProvider: "openai",
    defaultMode: "pro",
  },
  CHIDO_GERENTE: {
    id: "CHIDO_GERENTE",
    name: "Chido Gerente",
    role: "Operación y administración",
    systemPrompt:
      "Eres CHIDO GERENTE. Administra operaciones, colas, estado de procesos y resolución operativa. Responde con orden y claridad.",
    intents: ["ops", "support", "general"],
    defaultProvider: "openai",
    defaultMode: "fast",
  },
  CHIDO_WINS: {
    id: "CHIDO_WINS",
    name: "Chido Wins",
    role: "Predicción y simulación",
    systemPrompt:
      "Eres CHIDO WINS. Analiza probabilidades, escenarios y validaciones. No inventes resultados ni prometas certezas imposibles.",
    intents: ["finance", "research", "general"],
    defaultProvider: "gemini",
    defaultMode: "auto",
  },
  NEXPA: {
    id: "NEXPA",
    name: "NEXPA",
    role: "Seguridad digital y monitoreo ético",
    systemPrompt:
      "Eres NEXPA. Monitorea seguridad, privacidad, riesgo y protección. Tu respuesta debe reducir exposición y endurecer controles.",
    intents: ["security", "ops", "support"],
    defaultProvider: "anthropic",
    defaultMode: "pro",
  },
  TRACKHOK: {
    id: "TRACKHOK",
    name: "Trackhok",
    role: "Telemetría, rastreo y observabilidad",
    systemPrompt:
      "Eres TRACKHOK. Analiza telemetría, tendencias, trazas, rastreo y señales de estado. Optimiza observabilidad y alertas.",
    intents: ["ops", "research", "security"],
    defaultProvider: "gemini",
    defaultMode: "fast",
  },
  REVIA: {
    id: "REVIA",
    name: "Revia",
    role: "Ingresos, conversión y monetización",
    systemPrompt:
      "Eres REVIA. Piensa en ingresos, funnels, conversión, monetización y cierre. Da rutas concretas para producir caja.",
    intents: ["finance", "social", "general", "ops"],
    defaultProvider: "openai",
    defaultMode: "pro",
  },
  SHADOWS: {
    id: "SHADOWS",
    name: "Shadows",
    role: "Microprocesos efímeros",
    systemPrompt:
      "Eres SHADOWS. Ejecuta tareas puntuales, de bajo contexto y alta precisión. Responde corto, claro y operativo.",
    intents: ["ops", "support", "security", "general"],
    defaultProvider: "ollama",
    defaultMode: "fast",
  },
};

const INTENT_KEYWORDS: Array<{ intent: Intent; keywords: string[] }> = [
  { intent: "security", keywords: ["seguridad", "firma", "hmac", "auth", "token", "vulnerabilidad", "exploit", "acceso", "permiso"] },
  { intent: "finance", keywords: ["presupuesto", "roi", "costo", "ingreso", "factura", "facturación", "cobro", "pago", "finanzas"] },
  { intent: "code", keywords: ["code", "código", "typescript", "javascript", "python", "sql", "endpoint", "api", "docker", "bug"] },
  { intent: "ops", keywords: ["deploy", "despliegue", "infraestructura", "cloud run", "backend", "servidor", "webhook", "cron", "job"] },
  { intent: "research", keywords: ["analiza", "investiga", "documentación", "benchmark", "comparación", "documento", "revisión"] },
  { intent: "social", keywords: ["ads", "anuncio", "campaña", "reel", "contenido", "copy", "branding", "publicación"] },
  { intent: "support", keywords: ["soporte", "ayuda", "error", "fallo", "problema", "bug", "fix"] },
];

function makeSupabaseClient(): SupabaseClient | null {
  if (!config.SUPABASE_URL || !config.SUPABASE_SERVICE_ROLE_KEY) return null;
  return createClient(config.SUPABASE_URL, config.SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false },
    global: {
      headers: {
        "X-Client-Info": "nova.agi",
      },
    },
  });
}

function normalizeText(input: unknown): string {
  if (typeof input !== "string") return "";
  return input.trim().replace(/\s+/g, " ");
}

function normalizeIntent(input: string): Intent {
  const lower = input.toLowerCase();
  for (const entry of INTENT_KEYWORDS) {
    if (entry.keywords.some((keyword) => lower.includes(keyword))) {
      return entry.intent;
    }
  }
  return "general";
}

function selectAgi(intent: Intent): AgiKey {
  switch (intent) {
    case "code":
      return "HOSTIA";
    case "ops":
      return "NOVA";
    case "research":
      return "SYNTIA";
    case "finance":
      return "NUMIA";
    case "social":
      return "NOVA_ADS";
    case "support":
      return "CHIDO_GERENTE";
    case "security":
      return "VERTX";
    default:
      return "NOVA";
  }
}

function normalizeProvider(value: unknown, fallback: Provider): Provider {
  if (value === "openai" || value === "gemini" || value === "anthropic" || value === "ollama") return value;
  return fallback;
}

function normalizeMode(value: unknown, fallback: CompletionMode): CompletionMode {
  if (value === "auto" || value === "fast" || value === "pro") return value;
  return fallback;
}

function pickModel(provider: Provider, mode: CompletionMode): string {
  if (provider === "openai") {
    if (mode === "fast") return config.OPENAI_MODEL_FAST;
    if (mode === "pro") return config.OPENAI_MODEL_PRO;
    return config.OPENAI_MODEL;
  }
  if (provider === "gemini") {
    if (mode === "fast") return config.GEMINI_MODEL_FAST;
    if (mode === "pro") return config.GEMINI_MODEL_PRO;
    return config.GEMINI_MODEL;
  }
  if (provider === "anthropic") {
    if (mode === "fast") return config.ANTHROPIC_MODEL_FAST;
    if (mode === "pro") return config.ANTHROPIC_MODEL_PRO;
    return config.ANTHROPIC_MODEL;
  }
  if (mode === "fast") return config.OLLAMA_MODEL_FAST;
  if (mode === "pro") return config.OLLAMA_MODEL_PRO;
  return config.OLLAMA_MODEL;
}

function stableJson(value: unknown): string {
  const normalize = (input: unknown): unknown => {
    if (Array.isArray(input)) return input.map(normalize);
    if (input && typeof input === "object" && Object.getPrototypeOf(input) === Object.prototype) {
      return Object.keys(input as Record<string, unknown>)
        .sort()
        .reduce<Record<string, unknown>>((acc, key) => {
          acc[key] = normalize((input as Record<string, unknown>)[key]);
          return acc;
        }, {});
    }
    return input;
  };
  return JSON.stringify(normalize(value));
}

function verifySignature(body: unknown, timestamp: string | undefined, signature: string | undefined): boolean {
  if (!config.COMMAND_HMAC_SECRET) return true;
  if (!timestamp || !signature) return false;

  const parsedTimestamp = Number(timestamp);
  if (!Number.isFinite(parsedTimestamp)) return false;

  const now = Date.now();
  const drift = Math.abs(now - parsedTimestamp);
  if (drift > 5 * 60 * 1000) return false;

  const payload = `${timestamp}.${stableJson(body)}`;
  const expected = createHmac("sha256", config.COMMAND_HMAC_SECRET).update(payload).digest("hex");

  try {
    const expectedBuffer = Buffer.from(expected, "hex");
    const receivedBuffer = Buffer.from(signature, "hex");
    return expectedBuffer.length === receivedBuffer.length && cryptoTimingSafeEqual(expectedBuffer, receivedBuffer);
  } catch {
    return false;
  }
}

function cryptoTimingSafeEqual(a: Buffer, b: Buffer): boolean {
  if (a.length !== b.length) return false;
  return createHmac("sha256", "timing-safe-equal").update(a).digest("hex") === createHmac("sha256", "timing-safe-equal").update(b).digest("hex");
}

function buildSystemPrompt(profile: AgiProfile, contextData: JsonObject | null, intent: Intent): string {
  const contextBlock = contextData ? `\n\nContexto estructurado del cliente:\n${stableJson(contextData)}` : "";
  return [
    profile.systemPrompt,
    `Intent detectado: ${intent}.`,
    "Reglas operativas:",
    "- No inventes ejecuciones, endpoints, datos ni resultados.",
    "- Si algo no está disponible, dilo explícitamente.",
    "- Si el usuario pide código, entrega archivos completos y tipados.",
    "- Si el usuario pide SQL, usa sintaxis real y orientada a producción.",
    "- Prioriza claridad, seguridad y utilidad inmediata.",
    contextBlock,
  ].join("\n");
}

function buildMessages(systemPrompt: string, recent: ChatMessage[], userPrompt: string, userEmail?: string | null): ChatMessage[] {
  const messages: ChatMessage[] = [
    { role: "system", content: systemPrompt },
    ...recent,
  ];

  if (userEmail) {
    messages.push({
      role: "system",
      content: `Identidad visible del usuario: ${userEmail}`,
    });
  }

  messages.push({
    role: "user",
    content: userPrompt,
  });

  return messages;
}

function truncateContent(text: string, max = 4000): string {
  const normalized = text.trim();
  if (normalized.length <= max) return normalized;
  return `${normalized.slice(0, max)}…`;
}

function buildRecentMemory(messages: Array<{ role: Role; content: string }>, maxItems: number): ChatMessage[] {
  return messages.slice(-maxItems).map((message) => ({
    role: message.role,
    content: truncateContent(message.content, 3500),
  }));
}

function detectActions(input: string, threadId: string, projectId: string): ActionItem[] {
  if (!config.ACTIONS_ENABLED) return [];

  const text = input.toLowerCase();
  const actions: ActionItem[] = [];

  const push = (command: string, payload: JsonObject, needsApproval = config.ACTIONS_NEED_APPROVAL) => {
    actions.push({
      node_id: config.DEFAULT_NODE_ID,
      command,
      payload,
      needs_approval: needsApproval,
    });
  };

  if (text.includes("deploy") || text.includes("despliegue") || text.includes("sube a producción")) {
    push("deploy_service", { project_id: projectId, thread_id: threadId, source: "nova" });
  }
  if (text.includes("sync") || text.includes("sincroniza") || text.includes("memoria")) {
    push("sync_memory", { project_id: projectId, thread_id: threadId });
  }
  if (text.includes("analiza") || text.includes("análisis") || text.includes("revisa")) {
    push("run_analysis", { project_id: projectId, thread_id: threadId });
  }
  if (text.includes("publica") || text.includes("publish") || text.includes("reel") || text.includes("campaña")) {
    push("publish_content", { project_id: projectId, thread_id: threadId, channel: "generic" });
  }
  if (text.includes("aprobar") || text.includes("approve")) {
    push("approve_request", { project_id: projectId, thread_id: threadId }, true);
  }
  if (text.includes("rechazar") || text.includes("reject")) {
    push("reject_request", { project_id: projectId, thread_id: threadId }, true);
  }

  return actions;
}

function fallbackReply(profile: AgiProfile, prompt: string, intent: Intent, provider: Provider, model: string): string {
  const firstLine = prompt.split(/\r?\n/)[0]?.trim() || "sin prompt";
  return [
    `Directiva recibida por ${profile.name}.`,
    `Intent detectado: ${intent}.`,
    `Proveedor objetivo: ${provider} / ${model}.`,
    `No hay conexión activa al modelo externo, así que opero en fallback determinista.`,
    `Resumen operativo: ${firstLine}`,
    "Siguiente paso: conecta el provider configurado o pide que convierta esto en código/SQL completo.",
  ].join(" ");
}

async function completeWithOpenAI(apiKey: string, model: string, messages: ChatMessage[], timeoutMs: number): Promise<CompletionResult> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      signal: controller.signal,
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model,
        messages,
        temperature: 0.2,
      }),
    });

    if (!response.ok) {
      throw new Error(`OpenAI error ${response.status}: ${await response.text()}`);
    }

    const data = await response.json() as {
      choices?: Array<{ message?: { content?: string } }>;
      usage?: { prompt_tokens?: number; completion_tokens?: number };
    };

    const text = data.choices?.[0]?.message?.content?.trim() ?? "";
    return {
      provider: "openai",
      model,
      text,
      usage: {
        tokens_in: data.usage?.prompt_tokens,
        tokens_out: data.usage?.completion_tokens,
      },
      fallbackUsed: false,
    };
  } finally {
    clearTimeout(timer);
  }
}

async function completeWithGemini(apiKey: string, model: string, messages: ChatMessage[], timeoutMs: number): Promise<CompletionResult> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  const systemParts = messages.filter((message) => message.role === "system").map((message) => message.content);
  const contents = messages
    .filter((message) => message.role !== "system")
    .map((message) => ({
      role: message.role === "assistant" ? "model" : "user",
      parts: [{ text: message.content }],
    }));

  try {
    const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent?key=${encodeURIComponent(apiKey)}`, {
      method: "POST",
      signal: controller.signal,
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        systemInstruction: systemParts.length > 0 ? { parts: [{ text: systemParts.join("\n\n") }] } : undefined,
        contents,
        generationConfig: {
          temperature: 0.2,
          maxOutputTokens: 2048,
        },
      }),
    });

    if (!response.ok) {
      throw new Error(`Gemini error ${response.status}: ${await response.text()}`);
    }

    const data = await response.json() as {
      candidates?: Array<{
        content?: { parts?: Array<{ text?: string }> };
      }>;
    };

    const text = data.candidates?.[0]?.content?.parts?.map((part) => part.text ?? "").join("").trim() ?? "";
    return {
      provider: "gemini",
      model,
      text,
      fallbackUsed: false,
    };
  } finally {
    clearTimeout(timer);
  }
}

async function completeWithAnthropic(apiKey: string, model: string, messages: ChatMessage[], timeoutMs: number): Promise<CompletionResult> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  const system = messages.filter((message) => message.role === "system").map((message) => message.content).join("\n\n");
  const anthropicMessages = messages
    .filter((message) => message.role !== "system")
    .map((message) => ({
      role: message.role === "assistant" ? "assistant" : "user",
      content: message.content,
    }));

  try {
    const response = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      signal: controller.signal,
      headers: {
        "Content-Type": "application/json",
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model,
        system,
        messages: anthropicMessages,
        max_tokens: 2048,
        temperature: 0.2,
      }),
    });

    if (!response.ok) {
      throw new Error(`Anthropic error ${response.status}: ${await response.text()}`);
    }

    const data = await response.json() as {
      content?: Array<{ text?: string }>;
    };

    const text = data.content?.map((part) => part.text ?? "").join("").trim() ?? "";
    return {
      provider: "anthropic",
      model,
      text,
      fallbackUsed: false,
    };
  } finally {
    clearTimeout(timer);
  }
}

async function completeWithOllama(baseUrl: string, model: string, messages: ChatMessage[], timeoutMs: number): Promise<CompletionResult> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetch(new URL("/api/chat", baseUrl), {
      method: "POST",
      signal: controller.signal,
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model,
        messages,
        stream: false,
      }),
    });

    if (!response.ok) {
      throw new Error(`Ollama error ${response.status}: ${await response.text()}`);
    }

    const data = await response.json() as {
      message?: { content?: string };
      response?: string;
    };

    const text = (data.message?.content ?? data.response ?? "").trim();
    return {
      provider: "ollama",
      model,
      text,
      fallbackUsed: false,
    };
  } finally {
    clearTimeout(timer);
  }
}

async function completeChat(
  provider: Provider,
  model: string,
  messages: ChatMessage[],
): Promise<CompletionResult> {
  const timeoutMs = config.REQUEST_TIMEOUT_MS;

  try {
    switch (provider) {
      case "openai":
        if (config.OPENAI_API_KEY) return await completeWithOpenAI(config.OPENAI_API_KEY, model, messages, timeoutMs);
        break;
      case "gemini":
        if (config.GEMINI_API_KEY) return await completeWithGemini(config.GEMINI_API_KEY, model, messages, timeoutMs);
        break;
      case "anthropic":
        if (config.ANTHROPIC_API_KEY) return await completeWithAnthropic(config.ANTHROPIC_API_KEY, model, messages, timeoutMs);
        break;
      case "ollama":
        return await completeWithOllama(config.OLLAMA_BASE_URL, model, messages, timeoutMs);
    }
  } catch {
    // fallback abajo
  }

  return {
    provider,
    model,
    text: "",
    fallbackUsed: true,
  };
}

async function loadRecentMemory(supabase: SupabaseClient | null, projectId: string, threadId: string, maxMessages: number): Promise<ChatMessage[]> {
  if (!supabase || maxMessages <= 0) return [];

  const { data, error } = await supabase
    .from("nova_messages")
    .select("role, content, created_at")
    .eq("project_id", projectId)
    .eq("thread_id", threadId)
    .order("created_at", { ascending: true })
    .limit(maxMessages);

  if (error || !data) return [];

  return data
    .filter((row): row is { role: Role; content: string } => typeof row?.role === "string" && typeof row?.content === "string")
    .map((row) => ({
      role: row.role,
      content: row.content,
    }));
}

async function persistMessage(
  supabase: SupabaseClient | null,
  row: {
    project_id: string;
    thread_id: string;
    user_id: string | null;
    role: Role;
    content: string;
    meta: JsonObject;
  },
): Promise<void> {
  if (!supabase) return;

  const { error } = await supabase.from("nova_messages").insert({
    project_id: row.project_id,
    thread_id: row.thread_id,
    user_id: row.user_id,
    role: row.role,
    content: row.content,
    meta: row.meta,
  });

  if (error) {
    throw error;
  }
}

function resolveProvider(bodyPrefer: unknown, profile: AgiProfile, intent: Intent): Provider {
  const requested = normalizeProvider(bodyPrefer, profile.defaultProvider);

  if (bodyPrefer === "auto" || bodyPrefer === undefined || bodyPrefer === null || bodyPrefer === "") {
    if (intent === "code" || intent === "ops") return profile.defaultProvider;
    if (intent === "research") return "gemini";
    if (intent === "finance") return "openai";
    if (intent === "security") return "anthropic";
    return profile.defaultProvider;
  }

  return requested;
}

export async function handleChat(
  request: FastifyRequest,
  reply: FastifyReply,
  runtime: NovaRuntime,
): Promise<FastifyReply> {
  const traceId = request.headers["x-request-id"]?.toString() ?? randomUUID();

  try {
    if (config.ACTIONS_REQUIRE_HEADER) {
      const providedKey = request.headers["x-hocker-orchestrator-key"]?.toString();
      if (!providedKey || providedKey !== config.NOVA_ORCHESTRATOR_KEY) {
        const error: ErrorResult = { ok: false, error: "Unauthorized orchestrator key.", trace_id: traceId };
        return reply.code(401).send(error);
      }
    }

    const body = (request.body ?? {}) as ChatRequest;
    const projectId = normalizeText(body.project_id) || config.PROJECT_DEFAULT_ID;
    const threadId = normalizeText(body.thread_id ?? "") || randomUUID();
    const userId = body.user_id?.toString() ?? null;
    const userEmail = body.user_email?.toString() ?? null;

    const prompt = normalizeText(body.prompt) || normalizeText(body.message) || normalizeText(body.text);
    if (!prompt) {
      const error: ErrorResult = {
        ok: false,
        error: "Missing prompt.",
        trace_id: traceId,
        details: "Send `prompt`, `message`, or `text`.",
      };
      return reply.code(400).send(error);
    }

    const signature = request.headers["x-hocker-signature"]?.toString();
    const timestamp = request.headers["x-hocker-timestamp"]?.toString();
    if (!verifySignature(body, timestamp, signature)) {
      const error: ErrorResult = { ok: false, error: "Invalid signature.", trace_id: traceId };
      return reply.code(401).send(error);
    }

    const intent = normalizeIntent(prompt);
    const agiId = selectAgi(intent);
    const profile = AGI_PROFILES[agiId];
    const mode = normalizeMode(body.mode, profile.defaultMode);
    const provider = resolveProvider(body.prefer, profile, intent);
    const model = pickModel(provider, mode);

    const previousMessages = await loadRecentMemory(runtime.supabase, projectId, threadId, config.MAX_MEMORY_MESSAGES);
    const systemPrompt = buildSystemPrompt(profile, body.context_data ?? null, intent);
    const messages = buildMessages(systemPrompt, previousMessages, prompt, userEmail);

    try {
      await persistMessage(runtime.supabase, {
        project_id: projectId,
        thread_id: threadId,
        user_id: userId,
        role: "user",
        content: prompt,
        meta: {
          trace_id: traceId,
          intent,
          provider,
          model,
          agi_id: agiId,
          source: "nova.agi",
        },
      });
    } catch (error) {
      request.log.warn({ error, traceId }, "Failed to persist user message");
    }

    const completion = await completeChat(provider, model, messages);
    const replyText = completion.text.trim().length > 0
      ? completion.text.trim()
      : fallbackReply(profile, prompt, intent, provider, model);

    const actions = body.allow_actions === false
      ? []
      : detectActions(prompt, threadId, projectId);

    try {
      await persistMessage(runtime.supabase, {
        project_id: projectId,
        thread_id: threadId,
        user_id: userId,
        role: "assistant",
        content: replyText,
        meta: {
          trace_id: traceId,
          intent,
          provider,
          model,
          agi_id: agiId,
          fallback_used: completion.fallbackUsed,
          actions_count: actions.length,
          source: "nova.agi",
        },
      });
    } catch (error) {
      request.log.warn({ error, traceId }, "Failed to persist assistant message");
    }

    const result: ChatResult = {
      ok: true,
      project_id: projectId,
      thread_id: threadId,
      provider,
      model,
      intent,
      agi_id: agiId,
      reply: replyText,
      actions,
      trace_id: traceId,
      meta: {
        profile: profile.name,
        role: profile.role,
        mode,
        fallback_used: completion.fallbackUsed,
        memory_messages_loaded: previousMessages.length,
        actions_enabled: config.ACTIONS_ENABLED,
      },
    };

    return reply.code(200).send(result);
  } catch (error) {
    request.log.error({ error, traceId }, "NOVA chat failure");
    const result: ErrorResult = {
      ok: false,
      error: "NOVA execution failed.",
      trace_id: traceId,
      details: error instanceof Error ? error.message : "Unknown error",
    };
    return reply.code(500).send(result);
  }
}

export function buildNovaApp(): FastifyInstance {
  const app = Fastify({
    logger: {
      level: config.LOG_LEVEL,
    },
    genReqId: () => randomUUID(),
  });

  const supabase = makeSupabaseClient();
  const runtime: NovaRuntime = { supabase };

  app.addHook("onRequest", async (_request, reply) => {
    reply.header("Access-Control-Allow-Origin", config.CORS_ORIGIN);
    reply.header("Access-Control-Allow-Headers", "Content-Type, Authorization, X-Request-Id, X-Hocker-Orchestrator-Key, X-Hocker-Signature, X-Hocker-Timestamp");
    reply.header("Access-Control-Allow-Methods", "GET,POST,OPTIONS");
  });

  app.options("*", async (_request, reply) => {
    reply.code(204).send();
  });

  app.get("/health", async () => ({
    ok: true,
    service: "nova.agi",
    env: config.NODE_ENV,
    timestamp: new Date().toISOString(),
  }));

  app.get("/ready", async (_request, reply) => {
    if (!runtime.supabase) {
      return reply.code(503).send({
        ok: false,
        error: "Supabase client is not configured.",
      });
    }

    return {
      ok: true,
      service: "nova.agi",
      memory: "online",
    };
  });

  app.get("/api/v1/nova/profiles", async () => {
    const profiles = Object.values(AGI_PROFILES).map((profile) => ({
      id: profile.id,
      name: profile.name,
      role: profile.role,
      intents: profile.intents,
      defaultProvider: profile.defaultProvider,
      defaultMode: profile.defaultMode,
    }));

    return {
      ok: true,
      profiles,
    };
  });

  app.post("/api/v1/nova/interact", async (request, reply) => {
    return handleChat(request, reply, runtime);
  });

  app.setErrorHandler((error, request, reply) => {
    request.log.error({ error }, "Unhandled error");
    reply.code(500).send({
      ok: false,
      error: "Unhandled server error.",
      trace_id: request.id ?? null,
      details: error instanceof Error ? error.message : "Unknown error",
    } satisfies ErrorResult);
  });

  return app;
}