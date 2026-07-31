import { readFile, writeFile } from "node:fs/promises";

const path = new URL("../src/app.ts", import.meta.url);
let source = await readFile(path, "utf8");
let changed = false;

function replaceRequired(label, pattern, replacement, alreadyApplied) {
  if (alreadyApplied?.test(source)) return;
  const next = source.replace(pattern, replacement);
  if (next === source) throw new Error(`Unable to apply NOVA hardening patch: ${label}`);
  source = next;
  changed = true;
}

replaceRequired(
  "rate limit import",
  'import { safeBearerEquals } from "./lib/security.js";',
  'import { safeBearerEquals } from "./lib/security.js";\nimport { createRequestRateLimiter } from "./lib/rate-limit.js";',
  /createRequestRateLimiter/
);

replaceRequired(
  "fail-closed controls",
  /async function getControls\(project_id: string\): Promise<\{ kill_switch: boolean; allow_write: boolean \}> \{[\s\S]*?\n\}\n\nexport async function handleChat/,
  `type ControlState = {\n  kill_switch: boolean;\n  allow_write: boolean;\n  control_status: "available" | "unavailable" | "missing";\n};\n\nasync function getControls(project_id: string): Promise<ControlState> {\n  try {\n    const { data, error } = await supabaseAdmin\n      .from("system_controls")\n      .select("kill_switch,allow_write")\n      .eq("project_id", project_id)\n      .maybeSingle();\n\n    if (error) {\n      console.error("NOVA control read failed", { project_id, error: error.message });\n      return { kill_switch: true, allow_write: false, control_status: "unavailable" };\n    }\n\n    if (!data) {\n      console.error("NOVA control row missing", { project_id });\n      return { kill_switch: true, allow_write: false, control_status: "missing" };\n    }\n\n    return {\n      kill_switch: data.kill_switch === true,\n      allow_write: data.allow_write === true,\n      control_status: "available",\n    };\n  } catch (error) {\n    console.error("Unexpected NOVA control failure", {\n      project_id,\n      error: error instanceof Error ? error.message : "unknown",\n    });\n    return { kill_switch: true, allow_write: false, control_status: "unavailable" };\n  }\n}\n\nexport async function handleChat`,
  /control_status: "available"/
);

replaceRequired(
  "await telemetry shutdown",
  /\s+langfuse\?\.shutdownAsync\?\.\(\);/,
  `\n    try {\n      await langfuse?.shutdownAsync?.();\n    } catch (error) {\n      console.warn("Langfuse shutdown failed", error);\n    }`,
  /Langfuse shutdown failed/
);

replaceRequired(
  "authenticated rate limiting",
  /  app\.addHook\("preHandler", async \(req, reply\) => \{[\s\S]*?safeBearerEquals[\s\S]*?\n  \}\);/,
  `  const requestRateLimiter = createRequestRateLimiter({\n    windowMs: Number(process.env.NOVA_RATE_LIMIT_WINDOW_MS ?? 60_000),\n    max: Number(process.env.NOVA_RATE_LIMIT_MAX ?? 60),\n    maxBuckets: Number(process.env.NOVA_RATE_LIMIT_MAX_BUCKETS ?? 10_000),\n  });\n\n  app.addHook("preHandler", async (req, reply) => {\n    if (req.method === "GET" && req.url.startsWith("/health")) return;\n\n    if (config.orchestratorKey) {\n      const auth = req.headers.authorization;\n      if (!auth || !safeBearerEquals(auth, \`Bearer \${config.orchestratorKey}\`)) {\n        return reply.code(401).send({ ok: false, error: "UNAUTHORIZED" });\n      }\n    }\n\n    const decision = requestRateLimiter.consume({\n      ip: req.ip,\n      headers: req.headers,\n    });\n    reply.header("X-RateLimit-Limit", decision.limit);\n    reply.header("X-RateLimit-Remaining", decision.remaining);\n    reply.header("X-RateLimit-Reset", Math.ceil(decision.resetAt / 1000));\n\n    if (!decision.allowed) {\n      reply.header("Retry-After", decision.retryAfterSeconds);\n      return reply.code(429).send({\n        ok: false,\n        error: "RATE_LIMITED",\n        retry_after_seconds: decision.retryAfterSeconds,\n      });\n    }\n  });`,
  /NOVA_RATE_LIMIT_MAX_BUCKETS/
);

replaceRequired(
  "progress SSE",
  /  \/\/ We call handleChat internally[\s\S]*?\n  return app;\n\}/,
  `  // Lifecycle streaming: accepted -> heartbeat(s) -> message/error -> done.\n  // Provider token streaming is intentionally not claimed until providers expose it.\n  app.post("/api/v1/chat/stream", async (request, reply) => {\n    reply.hijack();\n    reply.raw.writeHead(200, {\n      "Content-Type": "text/event-stream; charset=utf-8",\n      "Cache-Control": "no-store, no-cache, must-revalidate",\n      Connection: "keep-alive",\n      "X-Accel-Buffering": "no",\n    });\n\n    const sse = (event: string, data: unknown) =>\n      \`event: \${event}\\ndata: \${JSON.stringify(data)}\\n\\n\`;\n\n    reply.raw.write(\n      sse("accepted", {\n        ok: true,\n        trace_id: randomUUID(),\n        transport: "nova_agi_sse",\n        timestamp: new Date().toISOString(),\n      }),\n    );\n\n    const heartbeat = setInterval(() => {\n      if (!reply.raw.writableEnded && !reply.raw.destroyed) {\n        reply.raw.write(sse("heartbeat", { timestamp: new Date().toISOString() }));\n      }\n    }, 10_000);\n\n    let capturedStatus = 200;\n    let capturedBody: unknown = null;\n    const capture = (payload: unknown) => {\n      capturedBody = payload;\n      return payload;\n    };\n    const fakeReply = {\n      status: (code: number) => {\n        capturedStatus = code;\n        return { send: capture };\n      },\n      code: (code: number) => {\n        capturedStatus = code;\n        return { send: capture };\n      },\n      send: capture,\n    };\n\n    try {\n      await handleChat(request, fakeReply as unknown as Parameters<typeof handleChat>[1]);\n    } catch (error) {\n      capturedStatus = 500;\n      capturedBody = { ok: false, error: "NOVA_STREAM_FAILED" };\n      request.log.error({ err: error }, "NOVA stream failed");\n    } finally {\n      clearInterval(heartbeat);\n    }\n\n    if (reply.raw.writableEnded || reply.raw.destroyed) return;\n\n    if (capturedStatus >= 400) {\n      const body = capturedBody as Record<string, unknown> | null;\n      reply.raw.write(\n        sse("error", {\n          ok: false,\n          error: body?.error ?? "NOVA_REQUEST_FAILED",\n          status: capturedStatus,\n        }),\n      );\n    } else {\n      const body = capturedBody as Record<string, unknown> | null;\n      reply.raw.write(\n        sse("message", {\n          ok: true,\n          type: "final",\n          content: body?.reply ?? "",\n          actions: body?.actions ?? [],\n          meta: body?.meta ?? {},\n          transport: "nova_agi_sse",\n        }),\n      );\n    }\n\n    reply.raw.write(sse("done", { ok: capturedStatus < 400 }));\n    reply.raw.end();\n  });\n\n  return app;\n}`,
  /Lifecycle streaming: accepted/
);

if (changed) {
  await writeFile(path, source, "utf8");
  console.log("NOVA runtime hardening applied.");
} else {
  console.log("NOVA runtime hardening already applied.");
}
