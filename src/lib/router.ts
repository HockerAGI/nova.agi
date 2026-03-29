import { config, modelFor } from "../config.js";
import { decideIntent } from "./decide.js";
import type { Intent, Prefer } from "../types.js";

export type RouteResult = {
  intent: Intent;
  provider: "openai" | "gemini";
  model: string;
  reason: string;
};

type ChooseOpts = {
  project_id: string;
  message: string;
  prefer: Prefer;
  mode: string;
};

function providerAvailable(provider: "openai" | "gemini") {
  return Boolean(provider === "openai" ? config.openai.apiKey : config.gemini.apiKey);
}

export async function chooseRoute(opts: ChooseOpts): Promise<RouteResult> {
  const { message, prefer, mode } = opts;
  const safeMode = (["auto", "fast", "pro"].includes(String(mode ?? "auto")) ? String(mode ?? "auto") : "auto") as
    | "auto"
    | "fast"
    | "pro";

  const decision = await decideIntent(message, prefer);

  let provider: "openai" | "gemini" = providerAvailable("openai") ? "openai" : "gemini";

  if (prefer === "gemini") {
    provider = providerAvailable("gemini") ? "gemini" : providerAvailable("openai") ? "openai" : "gemini";
  } else if (prefer === "openai") {
    provider = providerAvailable("openai") ? "openai" : providerAvailable("gemini") ? "gemini" : "openai";
  } else {
    if (decision.intent === "code" || decision.intent === "ops") {
      provider = providerAvailable("openai") ? "openai" : providerAvailable("gemini") ? "gemini" : "openai";
    } else {
      provider = providerAvailable("gemini") ? "gemini" : providerAvailable("openai") ? "openai" : "gemini";
    }
  }

  const finalModel = modelFor(provider, safeMode);

  return {
    intent: decision.intent,
    provider,
    model: finalModel,
    reason: decision.reason,
  };
}