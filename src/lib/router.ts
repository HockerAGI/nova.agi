import { config, modelFor, providerReady } from "../config.js";
import type { CompletionMode, Provider } from "../types.js";

export function resolveProvider(prefer: string | undefined, fallback: Provider): Provider {
  const p = String(prefer ?? "").trim().toLowerCase();

  if (p === "openai" || p === "gemini" || p === "anthropic" || p === "ollama" || p === "base44") {
    return p;
  }

  return fallback;
}

export function resolveMode(mode: string | undefined, fallback: CompletionMode): CompletionMode {
  const m = String(mode ?? "").trim().toLowerCase();

  if (m === "fast" || m === "pro" || m === "auto") {
    return m;
  }

  return fallback;
}

export function chooseRuntime(
  prefer: string | undefined,
  mode: string | undefined,
  defaultProvider: Provider,
  defaultMode: CompletionMode,
) {
  const requestedProvider = resolveProvider(prefer, defaultProvider);
  const resolvedMode = resolveMode(mode, defaultMode);
  const candidates: Provider[] = [];

  const push = (provider: Provider) => {
    if (!candidates.includes(provider)) candidates.push(provider);
  };

  push(requestedProvider);
  push(defaultProvider);
  for (const provider of config.providerRouting.fallbacks) push(provider);
  push("ollama");

  const finalProvider = candidates.find((provider) => providerReady(provider)) ?? requestedProvider;

  return {
    provider: finalProvider,
    mode: resolvedMode,
    model: modelFor(finalProvider, resolvedMode),
    ready: providerReady(finalProvider),
  };
}

export function budgetCap(provider: Provider): number {
  if (!config.budgetsEnabled) return Number.POSITIVE_INFINITY;

  if (provider === "openai") return config.budgetOpenAI;
  if (provider === "gemini") return config.budgetGemini;
  if (provider === "anthropic") return config.budgetAnthropic;

  return Number.POSITIVE_INFINITY;
}
