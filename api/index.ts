/**
 * Vercel Serverless entry point for nova.agi orchestrator.
 *
 * Uses Fastify's `inject()` method — the canonical way to run Fastify in
 * serverless environments (no need to call `listen()`).
 *
 * All routes registered in buildNovaApp() are accessible at:
 *   /api/v1/chat  /api/v1/chat/stream  /health  /mesh/status  etc.
 *
 * Vercel routes all requests here via vercel.json rewrites.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type VercelRequest = any;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type VercelResponse = any;

import { buildNovaApp } from "../src/index.js";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type FastifyApp = any;

let _app: FastifyApp | null = null;
let _ready: Promise<FastifyApp> | null = null;

async function getApp(): Promise<FastifyApp> {
  if (_app) return _app;
  if (!_ready) {
    _ready = (async () => {
      const app = buildNovaApp();
      await app.ready();
      _app = app;
      return app;
    })();
  }
  return _ready;
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  try {
    const app = await getApp();

    let payload: Buffer | string | undefined;
    if (req.body !== undefined) {
      payload = typeof req.body === "string" ? req.body : JSON.stringify(req.body);
    }

    const url = req.url || "/";

    const injected = await app.inject({
      method: req.method || "GET",
      url,
      headers: req.headers as Record<string, string>,
      payload,
    });

    res.status(injected.statusCode);

    const skipHeaders = new Set(["content-length", "transfer-encoding", "connection"]);
    for (const [key, value] of Object.entries(injected.headers)) {
      if (skipHeaders.has(key.toLowerCase())) continue;
      if (value !== undefined) {
        const vals = Array.isArray(value) ? value : [value];
        for (const v of vals) res.setHeader(key, v);
      }
    }

    res.send(injected.body);
  } catch (error) {
    console.error("[nova.agi vercel] handler error:", error);
    if (!res.headersSent) {
      res.status(500).json({ ok: false, error: "NOVA orchestrator error" });
    }
  }
}

export const config = {
  maxDuration: 60,
};
