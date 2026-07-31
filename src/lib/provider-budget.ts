import type { Provider } from "../types.js";
import { budgetCap } from "./router.js";
import { tokensUsedThisMonth } from "./usage.js";

export type ProviderBudgetDecision = {
  available: Provider[];
  exhausted: Array<{ provider: Provider; used: number; cap: number }>;
};

/**
 * Remove only providers whose configured monthly allowance is exhausted.
 * Local Ollama and providers without a configured cap remain available.
 */
export async function providersWithinBudget(
  projectId: string,
  providers: Provider[],
): Promise<ProviderBudgetDecision> {
  const available: Provider[] = [];
  const exhausted: Array<{ provider: Provider; used: number; cap: number }> = [];

  for (const provider of providers) {
    const cap = budgetCap(provider);

    if (!Number.isFinite(cap)) {
      available.push(provider);
      continue;
    }

    try {
      const used = await tokensUsedThisMonth(projectId, provider);
      if (used >= cap) {
        exhausted.push({ provider, used, cap });
      } else {
        available.push(provider);
      }
    } catch {
      // Usage telemetry must not disable the provider. Runtime fallback still
      // handles real quota, authentication and availability errors safely.
      available.push(provider);
    }
  }

  return { available, exhausted };
}
