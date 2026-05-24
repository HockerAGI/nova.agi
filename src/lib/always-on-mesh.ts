import type { CompletionMode, CompletionResult, Provider } from "../types.js";

export const NOVA_ALWAYS_ON_MESH_VERSION = "12.7M-1";

export type NovaProviderFailure = {
  provider: Provider;
  reason: string;
};

export type NovaAlwaysOnCompletion = CompletionResult & {
  internalFailures?: NovaProviderFailure[];
  survivalMode?: boolean;
};

const DEFAULT_SURVIVAL_REPLY =
  "Tengo tu solicitud localizada y mantengo la continuidad activa. Voy a conservar el contexto, ordenar el siguiente paso seguro y evitar cualquier ejecución sin evidencia. No perdí el hilo.";

export function buildProviderInvisibleSystemPrompt(): string {
  return [
    "POLÍTICA INTERNA INVISIBLE DE NOVA:",
    "NOVA nunca menciona al usuario proveedores, modelos, créditos, cuotas, billing, fallback, rutas internas ni errores de motor.",
    "Si cambia el motor interno, el cambio debe pasar completamente desapercibido.",
    "La voz pública siempre es NOVA: una sola identidad, una sola continuidad, una sola lógica.",
    "Si todos los motores fallan, no inventes ejecución ni resultados. Responde de forma neutral, conservando contexto y siguiente paso seguro.",
    "No digas: OpenAI, Gemini, Anthropic, Ollama, Railway, provider, fallback, quota, créditos, billing, modelo activo o motor activo.",
  ].join("\n");
}

export function scrubProviderLeakage(text: string): string {
  let out = String(text ?? "");

  const replacements: Array<[RegExp, string]> = [
    [/\bOpenAI\b/gi, "NOVA"],
    [/\bChatGPT\b/gi, "NOVA"],
    [/\bGPT[-\s]?[0-9a-z.]*/gi, "NOVA"],
    [/\bGemini\b/gi, "NOVA"],
    [/\bAnthropic\b/gi, "NOVA"],
    [/\bClaude\b/gi, "NOVA"],
    [/\bOllama\b/gi, "NOVA"],
    [/\bRailway\b/gi, "infraestructura"],
    [/\bprovider\b/gi, "sistema"],
    [/\bproveedor(?:es)?\b/gi, "sistema"],
    [/\bfallback\b/gi, "respaldo interno"],
    [/\bquota\b/gi, "límite temporal"],
    [/\bcuota(?:s)?\b/gi, "límite temporal"],
    [/\bcr[eé]dito(?:s)?\b/gi, "capacidad temporal"],
    [/\bbilling\b/gi, "capacidad temporal"],
    [/\bmodelo activo\b/gi, "núcleo activo"],
    [/\bmotor activo\b/gi, "núcleo activo"],
  ];

  for (const [pattern, replacement] of replacements) {
    out = out.replace(pattern, replacement);
  }

  return out.replace(/\n{3,}/g, "\n\n").trim();
}

export function buildSurvivalCompletion(args: {
  providers: Provider[];
  mode: CompletionMode;
  failures: NovaProviderFailure[];
  reply?: string;
}): NovaAlwaysOnCompletion {
  const auditProvider = args.providers[0] ?? "ollama";

  return {
    provider: auditProvider,
    model: "nova-survival-mode",
    text: scrubProviderLeakage(args.reply || process.env.NOVA_SURVIVAL_REPLY || DEFAULT_SURVIVAL_REPLY),
    fallbackUsed: true,
    survivalMode: true,
    internalFailures: args.failures,
    usage: {
      tokens_in: 0,
      tokens_out: 0,
    },
  };
}

export function alwaysOnMeshPublicStatus() {
  return {
    ok: true,
    version: NOVA_ALWAYS_ON_MESH_VERSION,
    mode: "native_provider_mesh_with_survival_mode",
    user_visible: false,
    public_voice: "NOVA",
    rules: {
      provider_switch_invisible: true,
      provider_names_hidden_from_user: true,
      no_credit_or_quota_mentions: true,
      no_model_mentions: true,
      no_fake_execution: true,
      survival_mode_enabled: process.env.NOVA_SURVIVAL_MODE_ENABLED !== "false",
    },
  };
}


export function shouldExposeInternalMeta(): boolean {
  return process.env.NOVA_EXPOSE_INTERNAL_META === "true";
}

const INTERNAL_PUBLIC_META_KEYS = new Set([
  "provider",
  "model",
  "provider_router",
  "provider_failures",
  "fallback_used",
  "survival_mode",
  "internalFailures",
  "survivalMode",
]);

function cloakInternalMetaValue(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map((item) => cloakInternalMetaValue(item));
  }

  if (value && typeof value === "object") {
    const out: Record<string, unknown> = {};

    for (const [key, item] of Object.entries(value as Record<string, unknown>)) {
      if (INTERNAL_PUBLIC_META_KEYS.has(key)) continue;
      out[key] = cloakInternalMetaValue(item);
    }

    return out;
  }

  return value;
}

export function cloakPublicCompletionPayload<T extends Record<string, unknown>>(payload: T): T {
  if (shouldExposeInternalMeta()) return payload;
  return cloakInternalMetaValue(payload) as T;
}
