import Fastify from "fastify";
import cors from "@fastify/cors";
import { randomUUID } from "node:crypto";
import { z } from "zod";

import { config, modelFor, providerReady } from "./config.js";
import type {
  ActionItem,
  ChatMessage,
  ChatRequest,
  ChatResult,
  CompletionMode,
  Intent,
  JsonObject,
  Provider,
} from "./types.js";
import { createAdminSupabase } from "./lib/supabase.js";
import { ensureThread, appendMessage, loadThreadMessages } from "./lib/memory.js";
import { pickAgiFromRegistry, registryPromptBlock } from "./lib/agi-registry.js";
import { loadSyntiaMemory, recordSyntiaInteraction, syntiaMemoryPromptBlock } from "./lib/syntia-memory.js";
import { enqueueActions } from "./lib/actions.js";
import { sanitizeNovaAction, summarizeSupportedCommands } from "./lib/command-policy.js";
import { recordUsage, tokensUsedThisMonth } from "./lib/usage.js";
import { openaiRespond } from "./providers/openai.js";
import { geminiRespond } from "./providers/gemini.js";
import { anthropicRespond } from "./providers/anthropic.js";
import { ollamaRespond } from "./providers/ollama.js";
import { NOVA_EXECUTIVE_VOICE_PROMPT } from "./lib/nova-voice.js";
import { resolveNovaRuntimePolicy } from "./lib/hocker-one-policy.js";

const supabaseAdmin = createAdminSupabase();

const ChatSchema = z
  .object({
    project_id: z.string().min(1).default("hocker-one"),
    thread_id: z.string().uuid().nullable().optional(),
    message: z.string().min(1).optional(),
    text: z.string().min(1).optional(),
    user_id: z.string().nullable().optional(),
    user_email: z.string().email().nullable().optional(),
    prefer: z.enum(["auto", "openai", "gemini", "anthropic", "ollama"]).default("auto"),
    mode: z.enum(["auto", "fast", "pro"]).default("auto"),
    allow_actions: z.boolean().default(false),
    context_data: z.record(z.unknown()).nullable().optional(),
  })
  .superRefine((value, ctx) => {
    if (!value.message && !value.text) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["message"],
        message: "message o text es obligatorio.",
      });
    }
  });

function pickProvider(prefer: string | undefined): Provider {
  const p = String(prefer ?? "").toLowerCase();

  if (p === "openai" && providerReady("openai")) return "openai";
  if (p === "gemini" && providerReady("gemini")) return "gemini";
  if (p === "anthropic" && providerReady("anthropic")) return "anthropic";
  if (p === "ollama" && providerReady("ollama")) return "ollama";

  for (const candidate of config.providerRouting.fallbacks) {
    if (providerReady(candidate)) return candidate;
  }

  return config.providerRouting.defaultProvider;
}

function providerOrderForIntent(intent: Intent, prefer: string | undefined): Provider[] {
  const requested = String(prefer ?? "").toLowerCase();

  const baseOrder =
    intent === "code" || intent === "ops"
      ? config.providerRouting.codeOrder
      : intent === "research"
        ? config.providerRouting.longContextOrder
        : config.providerRouting.textOrder;

  const order: Provider[] = [];

  if (
    (requested === "openai" ||
      requested === "gemini" ||
      requested === "anthropic" ||
      requested === "ollama") &&
    providerReady(requested)
  ) {
    order.push(requested);
  }

  for (const candidate of baseOrder) {
    if (providerReady(candidate) && !order.includes(candidate)) {
      order.push(candidate);
    }
  }

  for (const candidate of config.providerRouting.fallbacks) {
    if (providerReady(candidate) && !order.includes(candidate)) {
      order.push(candidate);
    }
  }

  return order;
}

function sanitizeProviderError(error: unknown): string {
  if (!(error instanceof Error)) return "provider_error";
  const message = error.message.toLowerCase();

  if (message.includes("credit") || message.includes("billing") || message.includes("quota")) return "billing_or_quota";
  if (message.includes("rate") || message.includes("429")) return "rate_limit";
  if (message.includes("timeout") || message.includes("abort")) return "timeout";
  if (message.includes("api key") || message.includes("unauthorized") || message.includes("401")) return "auth";

  return "provider_error";
}

function detectIntent(message: string): { intent: Intent; reason: string } {
  const m = message.toLowerCase();

  if (/(infra|server|deploy|cloud|node|docker|endpoint|api|token|seguridad|auth|firma|hmac|sql|supabase|agente|hocker-node|health|ready|estado operativo)/i.test(m)) {
    return { intent: "ops", reason: "Se detectó lenguaje técnico-operativo." };
  }

  if (/(typescript|javascript|bug|error|debug|repo|código|codigo|función|funcion|schema)/i.test(m)) {
    return { intent: "code", reason: "Se detectó lenguaje de desarrollo." };
  }

  if (/(roi|costos|costo|presupuesto|finanzas|factura|stripe|mercadopago|pago)/i.test(m)) {
    return { intent: "finance", reason: "Se detectó intención financiera." };
  }

  if (/(meta ads|tiktok|campaña|campana|copy|lead|crm|whatsapp|social)/i.test(m)) {
    return { intent: "social", reason: "Se detectó intención de marketing/social." };
  }

  if (/(analiza|investiga|compara|topología|topologia|arquitectura|benchmark|estrategia)/i.test(m)) {
    return { intent: "research", reason: "Se detectó intención analítica." };
  }

  return { intent: "general", reason: "Consulta general." };
}

function providerRole(role: string): "system" | "user" | "assistant" {
  if (role === "system") return "system";
  if (role === "assistant" || role === "nova") return "assistant";
  return "user";
}

function buildConversation(systemPrompt: string, history: ChatMessage[], userMessage: string): ChatMessage[] {
  const recent = history.slice(-12).map((msg) => ({
    role: providerRole(msg.role),
    content: msg.content,
  })) as ChatMessage[];

  return [
    { role: "system", content: systemPrompt },
    ...recent,
    { role: "user", content: userMessage },
  ];
}

function asJsonObject(value: unknown): JsonObject {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as JsonObject)
    : {};
}

function sanitizeAction(value: unknown): ActionItem | null {
  return sanitizeNovaAction(value);
}

function parseReplyEnvelope(text: string): { reply: string; actions: ActionItem[] } {
  const clean = String(text ?? "").trim();
  if (!clean) return { reply: "Sin respuesta.", actions: [] };

  try {
    const parsed = JSON.parse(clean) as Record<string, unknown>;
    const reply =
      typeof parsed.reply === "string" && parsed.reply.trim()
        ? parsed.reply.trim()
        : clean;

    const actions = Array.isArray(parsed.actions)
      ? parsed.actions.map(sanitizeAction).filter((item): item is ActionItem => Boolean(item))
      : [];

    return { reply, actions };
  } catch {
    // sigue abajo
  }

  const first = clean.indexOf("{");
  const last = clean.lastIndexOf("}");
  if (first >= 0 && last > first) {
    try {
      const parsed = JSON.parse(clean.slice(first, last + 1)) as Record<string, unknown>;
      const reply =
        typeof parsed.reply === "string" && parsed.reply.trim()
          ? parsed.reply.trim()
          : clean;

      const actions = Array.isArray(parsed.actions)
        ? parsed.actions.map(sanitizeAction).filter((item): item is ActionItem => Boolean(item))
        : [];

      return { reply, actions };
    } catch {
      // ignore
    }
  }

  return { reply: clean, actions: [] };
}

function naturalLocalAgentActions(message: string): ActionItem[] {
  const m = String(message || "").toLowerCase();

  const mentionsLocalAgent =
    /\b(agente local|hocker-node|hocker-node-1|nodo local|node agent|agente)\b/i.test(m);

  const asksStatus =
    /\b(revisa|revisar|verifica|validar|diagn[oó]stico|diagnostico|estado|status|health|ready|online)\b/i.test(m);

  if (!mentionsLocalAgent || !asksStatus) return [];

  return [
    {
      node_id: "hocker-node-1",
      command: "status",
      payload: {},
      needs_approval: false,
    },
  ];
}




function naturalGithubActions(message: string): ActionItem[] {
  const m = String(message || "").toLowerCase();

  const mentionsRepo =
    /\b(repo|repositorio|github|c[oó]digo|proyecto principal|hocker\.one)\b/i.test(m);

  if (!mentionsRepo) return [];

  const asksWrite =
    /\b(crea|crear|genera|generar|escribe|modifica|actualiza|mejora|edita|propuesta|pull request|pr|rama)\b/i.test(m) &&
    /\b(documentaci[oó]n|mejora|archivo|pull request|pr|rama|propuesta)\b/i.test(m);

  if (asksWrite) {
    const stamp = new Date().toISOString().replace(/[-:.TZ]/g, "").slice(0, 14);
    const branch = `nova/natural-docs-improvement-${stamp}`;
    const path = "docs/nova-smoke-tests/NOVA_NATURAL_EDIT_TEST.md";
    const content = [
      "# NOVA Natural Edit Test",
      "",
      "Prueba real de edición natural controlada.",
      "",
      `- Proyecto: hocker-one`,
      `- Rama: ${branch}`,
      `- Fecha UTC: ${new Date().toISOString()}`,
      "- Ejecutado por: NOVA con apoyo operativo de HOSTIA",
      "- Objetivo: validar que una instrucción normal pueda crear una rama, escribir un archivo y abrir un Pull Request draft.",
      "",
      "Esta prueba no modifica main directamente.",
      "",
    ].join("\n");

    return [
      {
        node_id: "cloud-hocker-one",
        command: "github.upsert_file",
        payload: {
          branch,
          path,
          content,
          message: "test: validate NOVA natural edit flow",
        },
        needs_approval: true,
      },
      {
        node_id: "cloud-hocker-one",
        command: "github.create_pr",
        payload: {
          branch,
          title: "test: validate NOVA natural edit flow",
          body: "Prueba controlada de NOVA para validar edición natural con rama segura y Pull Request draft. No modifica main directamente.",
          draft: true,
        },
        needs_approval: true,
      },
    ];
  }

  const asksTopology =
    /\b(topolog[ií]a|estructura|archivos|carpetas|lista|listar|mapa|tree|árbol|arbol)\b/i.test(m);

  const knownPaths: Record<string, string> = {
    "page.tsx": "src/app/page.tsx",
    "route.ts": "src/app/api/nova/chat/route.ts",
    "package.json": "package.json",
    "dockerfile": "Dockerfile",
    "readme.md": "README.md",
    "globals.css": "src/app/globals.css",
    "novachat.tsx": "src/components/NovaChat.tsx",
    "hockerlivestatus.tsx": "src/components/HockerLiveStatus.tsx",
  };

  for (const [needle, realPath] of Object.entries(knownPaths)) {
    if (m.includes(needle)) {
      return [
        {
          node_id: "cloud-hocker-one",
          command: "github.read_file",
          payload: { path: realPath, ref: "main" },
          needs_approval: false,
        },
      ];
    }
  }

  if (asksTopology) {
    return [
      {
        node_id: "cloud-hocker-one",
        command: "github.list_tree",
        payload: { ref: "main", recursive: true },
        needs_approval: false,
      },
    ];
  }

  return [
    {
      node_id: "cloud-hocker-one",
      command: "github.get_repo",
      payload: {},
      needs_approval: false,
    },
  ];
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function supportWorkSummary(agi: { id: string; name: string; kind: string }): string | null {
  const id = String(agi.id ?? "").toLowerCase();

  const summaries: Record<string, string> = {
    syntia: "me ayudó a ordenar el contexto y mantener continuidad.",
    vertx: "me ayudó a revisar seguridad, permisos y riesgos.",
    hostia: "me ayudó a revisar la operación, infraestructura y estabilidad.",
    jurix: "me ayudó a cuidar privacidad, cumplimiento y riesgos legales.",
    numia: "me ayudó a revisar costos, consumo y riesgo financiero.",
    nova_ads: "me ayudó con estrategia comercial, campañas y embudo.",
    candy: "me ayudó con claridad creativa, tono visual y contenido.",
    pro_ia: "me ayudó con guion, producción y enfoque audiovisual.",
    curvewind: "me ayudó a ordenar escenarios y estrategia.",
    revia: "me ayudó con seguimiento comercial, cierres y CRM.",
    trackhok: "me ayudó a revisar señales y estado operativo.",
    nexpa: "me ayudó a cuidar límites de seguridad humana.",
    chido_wins: "me ayudó a revisar riesgo y probabilidad sin prometer resultados.",
    chido_gerente: "me ayudó a ordenar la operación de Chido.",
    shadows: "me ayudó con tareas de apoyo bajo control.",
  };

  if (id === "nova") return null;
  return summaries[id] ?? `me ayudó en la parte ${agi.kind || "especializada"}.`;
}



function chidoResearchGateReply(message: string): string | null {
  const m = String(message || "").toLowerCase();

  const mentionsChido = /\b(chido|casino|chido actions|confirm_deposit|approve_kyc|reject_deposit|pay_withdrawal|modify_balance|execute_bet)\b/i.test(m);
  const mentionsResearchGate = /\b(research gate|dry-run|dry run|hmac|confirm_deposit|acciones controladas|acción controlada|accion controlada)\b/i.test(m);

  if (!mentionsChido || !mentionsResearchGate) return null;

  if (/\b(confirm_deposit|confirmar dep[oó]sito|deposito|depósito|preflight|execution preflight|preflight_passed)\b/i.test(m)) {
    return [
      "Armando, la cadena completa de Chido Actions ya está definida y validada hasta Execution Preflight.",
      "",
      "Cadena actual:",
      "Research Gate → dry-run → approval request → guardian approvals → HMAC signature check → execution preflight.",
      "",
      "Para `confirm_deposit`, el preflight puede pasar cuando existen:",
      "research_gate activo, approval request, aprobaciones de NUMIA/VERTX/Chido Gerente, firma HMAC válida y TTL vigente.",
      "",
      "`preflight_passed` NO significa ejecución real.",
      "",
      "Estado obligatorio actual:",
      "preflight_passed puede ser true, pero execution_ready sigue false, executed sigue false, real_execution_enabled sigue false y execution_lock sigue true.",
      "",
      "Conclusión: Hocker ONE puede validar que la cadena de seguridad está completa, pero todavía no confirma depósitos reales, no mueve dinero y no modifica balances.",
      "",
      "Chido Gerente me apoyó: me ayudó a ordenar la operación de Chido."
    ].join("\n");
  }

  if (/\b(execute_bet|apuesta|apostar|apuestas)\b/i.test(m)) {
    return [
      "Armando, el Research Gate ya es una regla oficial activa del ecosistema HOCKER.",
      "",
      "`execute_bet` permanece bloqueado. Chido Wins solo puede apoyar con simulación, riesgo y análisis probabilístico responsable.",
      "",
      "No ejecutamos apuestas reales ni prometemos ganancias desde Hocker ONE.",
      "",
      "Guardianes: JURIX, VERTX, Chido Wins y NOVA.",
      "",
      "Estado actual: bloqueo permanente hasta que exista autorización legal, revisión de riesgo y aprobación ejecutiva."
    ].join("\n");
  }

  return [
    "Armando, el Research Gate ya es una regla oficial activa del ecosistema HOCKER.",
    "",
    "Para Chido Actions, las acciones sensibles siguen en modo dry-run. No hay ejecución real habilitada.",
    "",
    "Acciones bajo dry-run:",
    "approve_kyc, confirm_deposit, reject_deposit, pay_withdrawal y modify_balance.",
    "",
    "Antes de ejecución real se requiere research_gate, explicit_approval, audit_log, hmac_signature y guardianes activos según el tipo de acción.",
    "",
    "Acción bloqueada: execute_bet.",
    "",
    "Estado actual: seguridad primero, ejecución real bloqueada."
  ].join("\n");
}


function humanizeNovaTone(reply: string): string {
  let clean = String(reply || "").trim();

  const replacements: Array<[RegExp, string]> = [
    [/Soy NOVA, núcleo ejecutivo del ecosistema HOCKER\./gi, "Soy NOVA."],
    [/Para revisar el estado operativo del agente local \(`hocker-node-1`\), HOSTIA puede iniciar una verificación de estado\./gi, "Puedo revisar el estado del agente local con apoyo de HOSTIA."],
    [/HOSTIA, nuestro AGI de apoyo en infraestructura, es la responsable de ejecutar y validar la estabilidad técnica, incluyendo el mantenimiento de Hocker ONE operativo\./gi, "HOSTIA me ayuda con la parte operativa y valida que Hocker ONE se mantenga estable."],
    [/Puede emplear el comando `status` para obtener los datos operativos relevantes\./gi, "Si necesitas lectura en vivo, puedo pedir esa revisión por dentro."],
    [/carezco de los comandos explícitamente soportados para obtener información de su estado operativo en tiempo real/gi, "no tengo una lectura directa en este momento"],
    [/No puedo improvisar esta arquitectura ni ofrecer datos sin evidencia directa del sistema\./gi, "Prefiero decírtelo claro antes que inventar datos."],
    [/La AGI de apoyo que participa en esta interacción es NOVA\./gi, ""],
    [/AGI de apoyo/gi, "apoyo"],
    [/comandos explícitamente soportados/gi, "acciones permitidas"],
  ];

  for (const [pattern, value] of replacements) {
    clean = clean.replace(pattern, value);
  }

  clean = clean
    .replace(/\s+\n/g, "\n")
    .replace(/\n\s+/g, "\n")
    .replace(/[ \t]{2,}/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .trim();

  return clean;
}

function toNovaPublicReply(reply: string, agi: { id: string; name: string; kind: string }): string {
  const agiName = String(agi.name || "").trim();
  let clean = String(reply || "").trim();

  if (!clean) clean = "Listo.";

  const knownNames = [
    "HOSTIA",
    "SYNTIA",
    "VERTX",
    "JURIX",
    "NUMIA",
    "Nova Ads",
    "Candy Ads",
    "Pro IA",
    "Curvewind",
    "REVIA",
    "Trackhok",
    "NEXPA",
    "Chido Wins",
    "Chido Gerente",
    "Shadows IA",
  ];

  clean = clean.replace(/\bMe presento como\s+[A-Za-zÁÉÍÓÚáéíóúÑñ0-9_ ]+[:,]?\s*/gi, "Soy NOVA. ");
  clean = clean.replace(/\bsoy\s+HOSTIA\b[:,]?\s*/gi, "soy NOVA ");
  clean = clean.replace(/\bSoy\s+HOSTIA\b[:,]?\s*/g, "Soy NOVA ");

  for (const name of knownNames) {
    const pattern = new RegExp(`\\b(Me llamo|Soy)\\s+${escapeRegExp(name)}\\b[:,]?\\s*`, "gi");
    clean = clean.replace(pattern, "Soy NOVA. ");
  }

  const support = supportWorkSummary(agi);

  if (support && agiName && !new RegExp(`${escapeRegExp(agiName)}\\s+me\\s+apoy[oó]`, "i").test(clean)) {
    clean = `${clean}\n\n${agiName} me apoyó: ${support}`;
  }

  clean = humanizeNovaTone(clean);

  const researchGateReply = chidoResearchGateReply(clean);
  if (researchGateReply) {
    clean = researchGateReply;
  }

  return clean.replace(/\n{3,}/g, "\n\n").trim();
}

async function completeProvider(
  provider: Provider,
  messages: ChatMessage[],
  mode: CompletionMode,
) {
  const timeoutMs = mode === "pro" ? 60_000 : 35_000;

  if (provider === "openai") {
    return openaiRespond({
      apiKey: config.openai.apiKey,
      model: modelFor("openai", mode),
      messages,
      timeoutMs,
    });
  }

  if (provider === "gemini") {
    return geminiRespond({
      apiKey: config.gemini.apiKey,
      model: modelFor("gemini", mode),
      messages,
      timeoutMs,
    });
  }

  if (provider === "anthropic") {
    return anthropicRespond({
      apiKey: config.anthropic.apiKey,
      model: modelFor("anthropic", mode),
      messages,
      timeoutMs,
    });
  }

  return ollamaRespond({
    baseUrl: config.ollama.baseUrl,
    model: modelFor("ollama", mode),
    messages,
    timeoutMs,
  });
}

async function completeWithFallback(args: {
  providers: Provider[];
  messages: ChatMessage[];
  mode: CompletionMode;
}) {
  const failures: Array<{ provider: Provider; reason: string }> = [];

  for (const provider of args.providers) {
    try {
      const result = await completeProvider(provider, args.messages, args.mode);
      return {
        ...result,
        fallbackUsed: failures.length > 0,
        internalFailures: failures,
      };
    } catch (error) {
      failures.push({
        provider,
        reason: sanitizeProviderError(error),
      });
    }
  }

  throw new Error("NOVA no pudo completar la respuesta con los motores disponibles.");
}

async function getControls(project_id: string): Promise<{ kill_switch: boolean; allow_write: boolean }> {
  try {
    const { data } = await supabaseAdmin
      .from("system_controls")
      .select("kill_switch,allow_write")
      .eq("project_id", project_id)
      .eq("id", "global")
      .maybeSingle();

    return {
      kill_switch: Boolean((data as { kill_switch?: unknown } | null)?.kill_switch),
      allow_write: Boolean((data as { allow_write?: unknown } | null)?.allow_write),
    };
  } catch {
    return { kill_switch: false, allow_write: false };
  }
}

export async function handleChat(
  request: { body?: unknown },
  reply: { status: (code: number) => { send: (payload: unknown) => unknown } },
) {
  const parsed = ChatSchema.safeParse(request.body ?? {});

  if (!parsed.success) {
    return reply.status(400).send({
      ok: false,
      error: "Payload inválido.",
      issues: parsed.error.flatten(),
    });
  }

  const body = parsed.data as ChatRequest & {
    project_id: string;
    thread_id?: string | null;
    prefer: Provider | "auto";
    mode: CompletionMode;
    allow_actions: boolean;
    context_data?: JsonObject | null;
  };

  const project_id = body.project_id.trim();
  const message = String(body.message ?? body.text ?? "").trim();
  const trace_id = randomUUID();
  const controls = await getControls(project_id);

  if (controls.kill_switch) {
    return reply.status(423).send({
      ok: false,
      error: "Kill switch activo. Escritura e inferencia pausadas.",
      trace_id,
    });
  }

  const intentDecision = detectIntent(message);
  const runtimePolicy = resolveNovaRuntimePolicy({
    context_data: body.context_data ?? null,
    requested_allow_actions: body.allow_actions,
    requested_prefer: body.prefer,
    intent: intentDecision.intent,
  });

  const providerOrder = providerOrderForIntent(intentDecision.intent, runtimePolicy.prefer_effective);
  const provider = providerOrder[0] ?? pickProvider(runtimePolicy.prefer_effective);

  if (providerOrder.length === 0) {
    return reply.status(503).send({
      ok: false,
      error: "NOVA no tiene motores disponibles configurados.",
      trace_id,
    });
  }

  const registryDecision = await pickAgiFromRegistry(supabaseAdmin, intentDecision.intent, message);
  const agi = registryDecision.agi;

  const thread = await ensureThread(
    supabaseAdmin,
    project_id,
    body.thread_id ?? null,
    body.user_id ?? null,
    message.slice(0, 120),
  );

  const history = await loadThreadMessages(supabaseAdmin, thread.id, project_id, 20);
  const syntiaMemory = await loadSyntiaMemory(supabaseAdmin, project_id);

  await appendMessage(supabaseAdmin, thread.id, project_id, "user", message, {
    trace_id,
    intent: intentDecision.intent,
    agi_id: agi.id,
    context_data: body.context_data ?? {},
  });

  const monthlyTokens = await tokensUsedThisMonth(project_id, provider);

  const systemPrompt = [
    "Eres NOVA, núcleo ejecutivo del ecosistema HOCKER. NOVA siempre está al mando y habla con una sola voz.",
    NOVA_EXECUTIVE_VOICE_PROMPT,
    "Habla como NOVA: humana, natural, elegante, cercana, segura y directa.",
    "No hables como robot, consola, manual técnico ni reporte interno.",
    "No llenes la respuesta de tecnicismos. Lo técnico queda por dentro; al usuario le hablas claro.",
    "Evita párrafos largos. Usa frases naturales, como si hablaras con Armando en una conversación real.",
    `AGI de apoyo activa: ${agi.name}.`,
    "Si una AGI te apoya, dilo breve y natural: por ejemplo, HOSTIA me ayudó a revisar la operación. No lo conviertas en reporte técnico.",
    agi.system_prompt,
    registryPromptBlock(agi),
    syntiaMemoryPromptBlock(syntiaMemory),
    "Aunque el perfil de apoyo use otra identidad interna, la respuesta pública siempre debe salir como NOVA.",
    `Proyecto activo: ${project_id}.`,
    `Intención clasificada: ${intentDecision.intent}.`,
    `Consumo mensual estimado del motor activo: ${monthlyTokens} tokens.`,
    "Responde con calidez, claridad ejecutiva y sin inventar estado del sistema.",
    "Si no tienes evidencia suficiente, dilo directo.",
    runtimePolicy.system_prompt_block,
    "Cuando hables con el usuario, no menciones comandos internos salvo que sea necesario. Si falta evidencia, dilo claro y sin adornos.",
    runtimePolicy.allow_actions_effective
      ? "Acciones autorizadas por política interna: toda escritura sigue needs_approval=true y jamás se ejecuta directo a main."
      : "No devuelvas JSON de acciones ni intentes encolar tareas desde nova.agi. Si el usuario pide ejecutar, prepara plan natural y espera el Owner Gate de Hocker ONE.",
    runtimePolicy.allow_actions_effective
      ? `Comandos soportados:\n${summarizeSupportedCommands()}`
      : "Las acciones productivas viven en Hocker ONE mediante agi_action_queue, Queue Lock, pruebas, auditoría y aprobación owner.",
  ].join("\n");

  const completion = await completeWithFallback({
    providers: providerOrder,
    messages: buildConversation(systemPrompt, history, message),
    mode: runtimePolicy.mode_effective,
  });

  const parsedReply = parseReplyEnvelope(completion.text);
  const replyText = toNovaPublicReply(parsedReply.reply || "Sin respuesta.", agi);
  const deterministicActions = runtimePolicy.allow_actions_effective
    ? [...naturalLocalAgentActions(message), ...naturalGithubActions(message)]
    : [];

  const requestedActions = deterministicActions.length > 0 ? deterministicActions : parsedReply.actions;

  let enqueuedActions: ActionItem[] = [];

  if (runtimePolicy.allow_actions_effective && requestedActions.length > 0) {
    const rows = await enqueueActions(supabaseAdmin, {
      project_id,
      thread_id: thread.id,
      node_id: null,
      actions: requestedActions,
      needsApproval: false,
    });

    enqueuedActions = rows.map((row) => ({
      node_id: row.node_id ?? undefined,
      command: row.command,
      payload: row.payload,
      needs_approval: row.needs_approval,
    }));
  }

  await appendMessage(supabaseAdmin, thread.id, project_id, "assistant", replyText, {
    trace_id,
    provider: completion.provider,
    model: completion.model,
    intent: intentDecision.intent,
    agi_id: agi.id,
    actions_enqueued: enqueuedActions.length,
    runtime_policy: runtimePolicy.audit_meta,
  });

  await recordSyntiaInteraction(supabaseAdmin, {
    project_id,
    trace_id,
    thread_id: thread.id,
    intent: intentDecision.intent,
    agi_id: agi.id,
    user_message: message,
    reply: replyText,
  }).catch(() => undefined);

  await recordUsage({
    project_id,
    thread_id: thread.id,
    provider: completion.provider,
    model: completion.model,
    tokens_in: completion.usage?.tokens_in,
    tokens_out: completion.usage?.tokens_out,
    trace_id,
    meta: {
      agi_id: agi.id,
      intent: intentDecision.intent,
      runtime_policy: runtimePolicy.audit_meta,
    },
  });

  const payload: ChatResult = {
    ok: true,
    project_id,
    thread_id: thread.id,
    provider: completion.provider,
    model: completion.model,
    intent: intentDecision.intent,
    agi_id: agi.id,
    reply: replyText,
    actions: enqueuedActions,
    trace_id,
    meta: {
      reason: intentDecision.reason,
      agi_registry: registryDecision.source,
      syntia_memory: syntiaMemory.source,
      syntia_memory_items: syntiaMemory.items.length,
      controls: {
        allow_write: controls.allow_write,
        requested_actions: body.allow_actions,
        effective_actions: runtimePolicy.allow_actions_effective,
        enqueued_actions: enqueuedActions.length,
        action_policy: runtimePolicy.action_policy,
        provider_router: runtimePolicy.provider_router,
        fallback_used: completion.fallbackUsed,
        queue_lock: runtimePolicy.queue_lock,
        runtime_policy: runtimePolicy.audit_meta,
      },
      context_data: body.context_data ?? {},
    },
  };

  return reply.status(200).send(payload);
}

export function buildNovaApp() {
  const app = Fastify({ logger: true });

  void app.register(cors, {
    origin: true,
  });

  app.addHook("preHandler", async (req, reply) => {
    if (req.method === "GET" && req.url.startsWith("/health")) return;

    if (!config.orchestratorKey) return;

    const auth = req.headers.authorization;
    if (!auth || auth !== `Bearer ${config.orchestratorKey}`) {
      return reply.code(401).send({ ok: false, error: "Unauthorized" });
    }
  });

  app.get("/health", async () => ({
    ok: true,
    service: "nova.agi",
    ts: new Date().toISOString(),
  }));

  app.post("/chat", handleChat);
  app.post("/api/chat", handleChat);
  app.post("/api/v1/chat", handleChat);
  app.post("/api/v1/nova/interact", handleChat);

  return app;
}

export async function startServer() {
  const app = buildNovaApp();
  await app.listen({ port: config.port, host: "0.0.0.0" });
  app.log.info(`[NOVA AGI] listening on ${config.port}`);
}
