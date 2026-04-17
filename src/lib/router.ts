import { config, modelFor, providerReady } from "../config.js";
import type { CompletionMode, Provider } from "../types.js";

export function resolveProvider(prefer: string | undefined, fallback: Provider): Provider {
  const p = String(prefer ?? "").toLowerCase();
  if (p === "openai" || p === "gemini" || p === "anthropic" || p === "ollama") {
    return p;
  }
  return fallback;
}

export function resolveMode(mode: string | undefined, fallback: CompletionMode): CompletionMode {
  const m = String(mode ?? "").toLowerCase();
  if (m === "fast" || m === "pro" || m === "auto") return m;
  return fallback;
}

export function chooseRuntime(prefer: string | undefined, defaultProvider: Provider, defaultMode: CompletionMode) {
  const provider = resolveProvider(prefer, defaultProvider);
  const mode = resolveMode(prefer, defaultMode);
  const ready = providerReady(provider);

  return {
    provider: ready ? provider : "ollama",
    mode,
    model: modelFor(ready ? provider : "ollama", mode)
  };
}

export function budgetCap(provider: Provider): number {
  if (!config.budgetsEnabled) return Number.POSITIVE_INFINITY;
  if (provider === "openai") return config.budgetOpenAI;
  if (provider === "gemini") return config.budgetGemini;
  if (provider === "anthropic") return config.budgetAnthropic;
  return Number.POSITIVE_INFINITY;
}