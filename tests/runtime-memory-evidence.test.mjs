import assert from "node:assert/strict";
import test from "node:test";

import { loadThreadMessages } from "../src/lib/memory.ts";
import {
  loadSyntiaMemory,
  recordSyntiaInteractionWithClient,
  syntiaMemoryPromptBlock,
} from "../src/lib/syntia-memory.ts";

process.env.SUPABASE_URL ||= "https://example.supabase.co";
process.env.SUPABASE_SERVICE_ROLE_KEY ||= "test-service-role-key-with-safe-length";
process.env.NOVA_ORCHESTRATOR_KEY ||= "test-orchestrator-key-with-safe-length";

const { recordUsageWithClient, requirePersistedUsage } = await import(
  "../src/lib/usage.ts"
);

function queryFor(rows) {
  let selected = [...rows];

  const query = {
    select() {
      return query;
    },
    eq() {
      return query;
    },
    like() {
      return query;
    },
    order(column, options = {}) {
      const direction = options.ascending === false ? -1 : 1;
      selected.sort(
        (left, right) =>
          String(left[column]).localeCompare(String(right[column])) * direction,
      );
      return query;
    },
    then(resolve, reject) {
      return Promise.resolve({ data: selected, error: null }).then(resolve, reject);
    },
    limit(count) {
      return Promise.resolve({ data: selected.slice(0, count), error: null });
    },
  };

  return query;
}

test("thread memory returns the latest messages in chronological order", async () => {
  const rows = Array.from({ length: 25 }, (_, index) => ({
    id: `message-${index + 1}`,
    thread_id: "00000000-0000-4000-8000-000000000001",
    project_id: "hocker-one",
    role: index % 2 === 0 ? "user" : "assistant",
    content: `message ${index + 1}`,
    created_at: new Date(Date.UTC(2026, 7, 8, 0, index)).toISOString(),
    meta: {},
  }));
  const supabase = {
    from() {
      return queryFor(rows);
    },
  };

  const messages = await loadThreadMessages(
    supabase,
    "00000000-0000-4000-8000-000000000001",
    "hocker-one",
    20,
  );

  assert.equal(messages.length, 20);
  assert.equal(messages[0]?.content, "message 6");
  assert.equal(messages.at(-1)?.content, "message 25");
});

test("SYNTIA prompt retains the highest-priority memory when the feed is capped", async () => {
  const rows = [
    {
      type: "memory.research_gate",
      message: "Nunca afirmar una integración sin evidencia real.",
      data: {},
      created_at: "2026-08-01T00:00:00.000Z",
    },
    ...Array.from({ length: 12 }, (_, index) => ({
      type: "memory.interaction",
      message: `Interacción rutinaria ${index + 1}`,
      data: {},
      created_at: new Date(Date.UTC(2026, 7, 2, 0, index)).toISOString(),
    })),
  ];
  const supabase = {
    from() {
      return queryFor(rows);
    },
  };

  const memory = await loadSyntiaMemory(supabase, "hocker-one");
  const prompt = syntiaMemoryPromptBlock(memory);

  assert.match(prompt, /Nunca afirmar una integración sin evidencia real/);
  assert.doesNotMatch(prompt, /Interacción rutinaria 1\n/);
});

test("usage persistence returns an auditable id and stores trace metadata", async () => {
  const stored = [];
  const supabase = {
    from(table) {
      assert.equal(table, "llm_usage");
      return {
        insert(row) {
          stored.push(row);
          return {
            select(columns) {
              assert.equal(columns, "id");
              return {
                async single() {
                  return {
                    data: { id: "00000000-0000-4000-8000-000000000099" },
                    error: null,
                  };
                },
              };
            },
          };
        },
      };
    },
  };

  const result = await recordUsageWithClient(supabase, {
    project_id: "hocker-one",
    thread_id: "00000000-0000-4000-8000-000000000001",
    provider: "gemini",
    model: "gemini-2.5-flash",
    tokens_in: 12,
    tokens_out: 7,
    trace_id: "trace-usage-1",
    meta: { agi_id: "nova" },
  });

  assert.deepEqual(result, {
    persisted: true,
    id: "00000000-0000-4000-8000-000000000099",
    error: null,
  });
  assert.equal(stored[0]?.meta?.trace_id, "trace-usage-1");
  assert.equal(stored[0]?.meta?.thread_id, "00000000-0000-4000-8000-000000000001");
  assert.equal(stored[0]?.thread_id, "00000000-0000-4000-8000-000000000001");
  assert.equal(stored[0]?.tokens_in, 12);
  assert.equal(stored[0]?.tokens_out, 7);
});

test("usage persistence exposes database failure instead of reporting silent success", async () => {
  const supabase = {
    from() {
      return {
        insert() {
          return {
            select() {
              return {
                async single() {
                  return {
                    data: null,
                    error: { message: "usage table unavailable" },
                  };
                },
              };
            },
          };
        },
      };
    },
  };

  const result = await recordUsageWithClient(supabase, {
    project_id: "hocker-one",
    provider: "openai",
    model: "gpt-test",
    trace_id: "trace-usage-failure",
  });

  assert.equal(result.persisted, false);
  assert.equal(result.id, null);
  assert.match(result.error ?? "", /usage table unavailable/);
});

test("verified worker evidence requires a persisted usage row", () => {
  assert.deepEqual(
    requirePersistedUsage(
      {
        persisted: true,
        id: "00000000-0000-4000-8000-000000000099",
        error: null,
      },
      {
        provider: "gemini",
        model: "gemini-2.5-flash",
        tokens_in: 12,
        tokens_out: 7,
      },
    ),
    {
      type: "usage_persistence",
      usage_id: "00000000-0000-4000-8000-000000000099",
      provider: "gemini",
      model: "gemini-2.5-flash",
      tokens_in: 12,
      tokens_out: 7,
    },
  );

  assert.throws(
    () =>
      requirePersistedUsage(
        { persisted: false, id: null, error: "usage unavailable" },
        {
          provider: "openai",
          model: "gpt-test",
          tokens_in: 1,
          tokens_out: 1,
        },
      ),
    /AGI_WORKER_USAGE_PERSIST_FAILED: usage unavailable/,
  );
});

test("SYNTIA interaction memory reports its persisted event id", async () => {
  const stored = [];
  const supabase = {
    from(table) {
      assert.equal(table, "events");
      return {
        insert(row) {
          stored.push(row);
          return {
            select(columns) {
              assert.equal(columns, "id");
              return {
                async single() {
                  return { data: { id: "event-memory-1" }, error: null };
                },
              };
            },
          };
        },
      };
    },
  };

  const result = await recordSyntiaInteractionWithClient(supabase, {
    project_id: "hocker-one",
    trace_id: "trace-memory-1",
    thread_id: "00000000-0000-4000-8000-000000000001",
    intent: "general",
    agi_id: "nova",
    user_message: "Recuerda el objetivo del proyecto.",
    reply: "Objetivo registrado.",
  });

  assert.deepEqual(result, { persisted: true, id: "event-memory-1", error: null });
  assert.equal(stored[0]?.data?.trace_id, "trace-memory-1");
});

test("SYNTIA interaction memory surfaces database failure", async () => {
  const supabase = {
    from() {
      return {
        insert() {
          return {
            select() {
              return {
                async single() {
                  return { data: null, error: { message: "events unavailable" } };
                },
              };
            },
          };
        },
      };
    },
  };

  const result = await recordSyntiaInteractionWithClient(supabase, {
    project_id: "hocker-one",
    trace_id: "trace-memory-failure",
    thread_id: "00000000-0000-4000-8000-000000000001",
    intent: "general",
    agi_id: "nova",
    user_message: "mensaje",
    reply: "respuesta",
  });

  assert.equal(result.persisted, false);
  assert.equal(result.id, null);
  assert.match(result.error ?? "", /events unavailable/);
});
