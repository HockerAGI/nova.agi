import { config, modelFor } from "../config.js";
import { decideIntent } from "./decide.js";
import type { Intent, Prefer, Provider } from "../types.js";

export type RouteResult = {
  intent: Intent;
  provider: Provider;
  model: string;
  reason: string;
};

type ChooseOpts = {
  project_id: string;
  message: string;
  prefer: Prefer;
  mode: string;
};

function providerAvailable(provider: Provider): boolean {
  if (provider === "ollama") return Boolean(config.ollama.enabled);
  return Boolean(
    provider === "openai"
      ? config.openai.apiKey
      : provider === "gemini"
        ? config.gemini.apiKey
        : config.anthropic.apiKey,
  );
}

function firstAvailable(preferred: Provider[]): Provider {
  for (const provider of preferred) {
    if (providerAvailable(provider)) return provider;
  }
  return "ollama";
}

export async function chooseRoute(opts: ChooseOpts): Promise<RouteResult> {
  const { message, prefer, mode } = opts;
  const safeMode = (["auto", "fast", "pro"].includes(String(mode ?? "auto")) ? String(mode ?? "auto") : "auto") as
    | "auto"
    | "fast"
    | "pro";

  const decision = await decideIntent(message, prefer);

  let provider: Provider;

  if (prefer !== "auto") {
    provider = providerAvailable(prefer) ? prefer : firstAvailable(["anthropic", "openai", "gemini", "ollama"]);
  } else if (decision.intent === "code" || decision.intent === "ops" || decision.intent === "research") {
    provider = firstAvailable(["anthropic", "openai", "gemini", "ollama"]);
  } else if (decision.intent === "social") {
    provider = firstAvailable(["gemini", "anthropic", "openai", "ollama"]);
  } else if (decision.intent === "finance") {
    provider = firstAvailable(["anthropic", "openai", "gemini", "ollama"]);
  } else {
    provider = firstAvailable(["anthropic", "gemini", "openai", "ollama"]);
  }

  return {
    intent: decision.intent,
    provider,
    model: modelFor(provider, safeMode),
    reason: decision.reason,
  };
}