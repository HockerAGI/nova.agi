import type { Provider, Mode } from "../types.js";
import { config } from "../config.js";
import { detectIntent } from "./intents.js";
import { estimateTokensFromChars, tokensUsedThisMonth } from "./usage.js";

export async function chooseRoute(params: {
  project_id: string;
  message: string;
  prefer: Provider | "auto";
  mode: Mode;
}): Promise<{ provider: Provider; model: string; intent: any; meta: any }> {
  const intent = detectIntent(params.message);

  const wantMode: Mode =
    params.mode === "auto"
      ? (intent === "code" || intent === "ops" || intent === "research" ? "pro" : "fast")
      : params.mode;

  const openaiModel = wantMode === "pro" ? config.openaiModelPro : config.openaiModelFast;
  const geminiModel = wantMode === "pro" ? config.geminiModelPro : config.geminiModelFast;

  const meta: any = {
    intent,
    wantMode
  };

  if (params.prefer !== "auto") {
    return {
      provider: params.prefer,
      model: params.prefer === "openai" ? openaiModel : geminiModel,
      intent,
      meta
    };
  }

  // default heurística
  let primary: Provider = "openai";
  if (intent === "research") primary = "gemini";
  if (intent === "code" || intent === "ops") primary = "openai";

  // budgets por tokens/mes
  if (config.budgetsEnabled) {
    const tokensEst = estimateTokensFromChars(params.message.length);
    const usedOpenai = await tokensUsedThisMonth(params.project_id, "openai");
    const usedGemini = await tokensUsedThisMonth(params.project_id, "gemini");

    meta.budgets = {
      tokensEst,
      usedOpenai,
      usedGemini,
      limitOpenai: config.budgetOpenaiTokens,
      limitGemini: config.budgetGeminiTokens
    };

    if (primary === "openai" && usedOpenai + tokensEst > config.budgetOpenaiTokens) primary = "gemini";
    if (primary === "gemini" && usedGemini + tokensEst > config.budgetGeminiTokens) primary = "openai";
  }

  return {
    provider: primary,
    model: primary === "openai" ? openaiModel : geminiModel,
    intent,
    meta
  };
}