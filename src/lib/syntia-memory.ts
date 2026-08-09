import type { AdminSupabase } from "./supabase.js";
import type { Intent, JsonObject } from "../types.js";

export type SyntiaMemoryItem = {
  type: string;
  message: string;
  data: JsonObject | null;
  created_at: string;
};

export type SyntiaMemory = {
  source: "supabase" | "empty" | "unavailable";
  items: SyntiaMemoryItem[];
};

export type SyntiaMemoryPersistenceResult = {
  persisted: boolean;
  id: string | null;
  error: string | null;
};

type SyntiaMemoryPersistenceClient = {
  from(table: string): {
    insert(values: Record<string, unknown>): {
      select(columns: string): {
        single(): PromiseLike<{
          data: { id?: unknown } | null;
          error: { message?: string } | null;
        }>;
      };
    };
  };
};

function compact(value: string, max = 420): string {
  const clean = String(value || "").replace(/\s+/g, " ").trim();
  return clean.length > max ? `${clean.slice(0, max - 1)}…` : clean;
}

function syntiaMemoryPriority(type: string): number {
  if (type === "memory.research_gate") return 100;
  if (type === "memory.correction") return 95;
  if (type === "memory.decision") return 90;
  if (type === "memory.state") return 85;
  if (type === "memory.next") return 75;
  if (type === "memory.interaction") return 20;
  return 50;
}

function prioritizeSyntiaMemoryItems<T extends { type?: string; created_at?: string }>(items: T[]): T[] {
  return [...items].sort((a, b) => {
    const pa = syntiaMemoryPriority(String(a.type || ""));
    const pb = syntiaMemoryPriority(String(b.type || ""));

    if (pa !== pb) return pb - pa;

    const ta = new Date(String(a.created_at || "")).getTime() || 0;
    const tb = new Date(String(b.created_at || "")).getTime() || 0;

    return tb - ta;
  });
}

export async function loadSyntiaMemory(
  sb: AdminSupabase,
  project_id: string,
): Promise<SyntiaMemory> {
  try {
    const { data, error } = await sb
      .from("events")
      .select("type,message,data,created_at")
      .eq("project_id", project_id)
      .like("type", "memory.%")
      .order("created_at", { ascending: false })
      .limit(24);

    if (error) {
      return { source: "unavailable", items: [] };
    }

    const items = (data ?? [])
      .map((row) => ({
        type: String(row.type ?? ""),
        message: String(row.message ?? ""),
        data: (row.data ?? null) as JsonObject | null,
        created_at: String(row.created_at ?? ""),
      }))
      .reverse();

    return {
      source: items.length > 0 ? "supabase" : "empty",
      items: prioritizeSyntiaMemoryItems(items),
    };
  } catch {
    return { source: "unavailable", items: [] };
  }
}

export function syntiaMemoryPromptBlock(memory: SyntiaMemory): string {
  if (memory.source !== "supabase" || memory.items.length === 0) {
    return [
      "Memoria viva de SYNTIA:",
      "Aún no hay memoria operativa suficiente para este proyecto.",
      "Si falta evidencia, dilo claro y no inventes.",
    ].join("\n");
  }

  const lines = memory.items.slice(0, 12).map((item) => {
    return `- ${item.type}: ${compact(item.message)}`;
  });

  return [
    "Memoria viva de SYNTIA:",
    ...lines,
    "Usa esta memoria como contexto de continuidad. No la recites completa; úsala para responder con claridad humana.",
  ].join("\n");
}

export async function recordSyntiaInteractionWithClient(
  sb: SyntiaMemoryPersistenceClient,
  args: {
    project_id: string;
    trace_id: string;
    thread_id: string;
    intent: Intent;
    agi_id: string;
    user_message: string;
    reply: string;
  },
): Promise<SyntiaMemoryPersistenceResult> {
  const message = `NOVA atendió una interacción. Perfil especializado asignado: ${args.agi_id}. Usuario: ${compact(
    args.user_message,
    180,
  )}`;

  try {
    const { data, error } = await sb
      .from("events")
      .insert({
        project_id: args.project_id,
        node_id: null,
        level: "info",
        type: "memory.interaction",
        message,
        data: {
          trace_id: args.trace_id,
          thread_id: args.thread_id,
          intent: args.intent,
          agi_id: args.agi_id,
          cooperation_verified: false,
          user_preview: compact(args.user_message, 240),
          reply_preview: compact(args.reply, 300),
          source: "syntia-memory",
        },
      })
      .select("id")
      .single();

    const id = String(data?.id ?? "").trim();
    if (error || !id) {
      return {
        persisted: false,
        id: null,
        error: String(error?.message ?? "SYNTIA_MEMORY_ID_MISSING").slice(0, 500),
      };
    }

    return { persisted: true, id, error: null };
  } catch (error) {
    return {
      persisted: false,
      id: null,
      error: String(
        error instanceof Error ? error.message : "SYNTIA_MEMORY_PERSISTENCE_FAILED",
      ).slice(0, 500),
    };
  }
}

export async function recordSyntiaInteraction(
  sb: AdminSupabase,
  args: Parameters<typeof recordSyntiaInteractionWithClient>[1],
): Promise<SyntiaMemoryPersistenceResult> {
  return recordSyntiaInteractionWithClient(
    sb as unknown as SyntiaMemoryPersistenceClient,
    args,
  );
}
