import { decideIntent } from "./decide.js";
import { modelFor } from "../config.js";
import type { Intent, Prefer, Mode } from "../types.js";

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
  mode: Mode | string;
};

export async function chooseRoute(opts: ChooseOpts): Promise<RouteResult> {
  const { message, prefer, mode } = opts;
  const safeMode = (["auto", "fast", "pro"].includes(mode) ? mode : "auto") as "auto" | "fast" | "pro";

  // 1. Determinar el motor cognitivo a usar (Intent)
  const decision = await decideIntent(message, prefer);

  // 2. Resolver el proveedor final
  let provider: "openai" | "gemini" = "openai";
  
  if (prefer === "gemini") {
    provider = "gemini";
  } else if (prefer === "openai") {
    provider = "openai";
  } else {
    // Modo Auto: Balanceo de carga.
    // Tareas de código/ops suelen ir mejor a OpenAI (GPT-4o)
    // Tareas de research/finance pueden ir a Gemini 2.0 Flash/Pro por la ventana de contexto
    if (decision.intent === "code" || decision.intent === "ops") {
      provider = "openai";
    } else {
      provider = "gemini";
    }
  }

  const finalModel = modelFor(provider, safeMode);

  return {
    intent: decision.intent,
    provider,
    model: finalModel,
    reason: decision.reason
  };
}