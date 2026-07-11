import { config, modelFor, providerReady } from "../config.js";
import type { CompletionMode, Intent, Provider } from "../types.js";

export const NOVA_PROVIDER_STATUS_VERSION = "12.7M-1";

const PROVIDERS: Provider[] = ["openai", "gemini", "anthropic", "ollama", "base44"];
const MODES: CompletionMode[] = ["auto", "fast", "pro"];

function providerLabel(provider: Provider): string {
  if (provider === "openai") return "OpenAI";
  if (provider === "gemini") return "Gemini";
  if (provider === "anthropic") return "Anthropic";
  if (provider === "base44") return "Base44";
  return "Ollama";
}

function providerConfigured(provider: Provider): boolean {
  if (provider === "openai") return Boolean(config.openai.apiKey);
  if (provider === "gemini") return Boolean(config.gemini.apiKey);
  if (provider === "anthropic") return Boolean(config.anthropic.apiKey);
  if (provider === "base44") return Boolean(config.base44.apiKey);
  return Boolean(config.ollama.enabled);
}

function providerSignals(provider: Provider): string[] {
  if (provider === "openai") return config.openai.apiKey ? ["OPENAI_API_KEY"] : [];
  if (provider === "gemini") return config.gemini.apiKey ? ["GEMINI_API_KEY"] : [];
  if (provider === "anthropic") return config.anthropic.apiKey ? ["ANTHROPIC_API_KEY"] : [];
  if (provider === "base44") return config.base44.apiKey ? ["BASE44_API_KEY"] : [];
  return config.ollama.enabled ? ["OLLAMA_ENABLED", "OLLAMA_BASE_URL"] : [];
}

function modelsFor(provider: Provider) {
  return Object.fromEntries(MODES.map((mode) => [mode, modelFor(provider, mode)]));
}

function orderForIntent(intent: Intent): Provider[] {
  if (intent === "code" || intent === "ops") return config.providerRouting.codeOrder;
  if (intent === "research") return config.providerRouting.longContextOrder;
  return config.providerRouting.textOrder;
}

export function getNovaProviderStatus() {
  const providers = Object.fromEntries(
    PROVIDERS.map((provider) => {
      const configured = providerConfigured(provider);
      const ready = providerReady(provider);

      return [
        provider,
        {
          registered: true,
          configured,
          ready,
          status: ready ? "ready" : configured ? "configured_runtime_check_required" : "not_configured",
          label: providerLabel(provider),
          env_signals: providerSignals(provider),
          models: modelsFor(provider),
          user_visible: false,
        },
      ];
    }),
  );

  return {
    ok: true,
    service: "nova.agi",
    version: NOVA_PROVIDER_STATUS_VERSION,
    provider_router: "native_best_available_fallback",
    generated_at: new Date().toISOString(),
    user_facing_policy: {
      nova_decides_provider_internally: true,
      user_selects_provider: false,
      provider_names_hidden_from_user: config.providerRouting.hideProviderFromUser,
      provider_switch_invisible: true,
      no_credit_or_quota_mentions: true,
      public_voice: "NOVA",
    },
    orders: {
      fallback: config.providerRouting.fallbacks,
      text: config.providerRouting.textOrder,
      code: config.providerRouting.codeOrder,
      long_context: config.providerRouting.longContextOrder,
      image: config.providerRouting.imageProvider,
      video: config.providerRouting.videoProvider,
      by_intent: {
        general: orderForIntent("general"),
        code: orderForIntent("code"),
        ops: orderForIntent("ops"),
        research: orderForIntent("research"),
        finance: orderForIntent("finance"),
        social: orderForIntent("social"),
      },
    },
    providers,
    always_on_mesh: {
      version: "12.7M-1",
      survival_mode_enabled: config.survival.enabled,
      user_visible: false,
      provider_switch_invisible: true,
    },
    execution_policy: {
      productive_actions_from_nova_agi: false,
      owner_gate_lives_in_hocker_one: true,
      nova_agi_can_enqueue_directly: false,
      hocker_one_controls_queue_lock: true,
    },
  };
}
