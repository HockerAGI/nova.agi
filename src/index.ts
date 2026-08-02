import { pathToFileURL } from "node:url";
import path from "node:path";
import { buildNovaApp } from "./app.js";
import { config } from "./config.js";
import { startAgiWorkerLoop } from "./lib/agi-worker-loop.js";
import { getMcpRegistry } from "./lib/mcp/mcp-registry.js";
import { startNovaRuntimeHeartbeat } from "./lib/runtime-heartbeat.js";
import { getNovaRuntimeReadiness } from "./lib/runtime-readiness.js";
import { resolveNovaListenHost } from "./lib/runtime-listener.js";
import { agiWorkerRoutes } from "./routes/agi-workers.js";

const currentScript = process.argv[1]
  ? pathToFileURL(path.resolve(process.argv[1])).href
  : "";

const isMain = import.meta.url === currentScript;

export async function buildNovaAppWithWorkers() {
  const app = buildNovaApp();
  await app.register(agiWorkerRoutes);
  return app;
}

export async function startServer() {
  const app = await buildNovaAppWithWorkers();
  const stopWorkerLoop = startAgiWorkerLoop({
    info: (message) => app.log.info(message),
    warn: (message) => app.log.warn(message),
    error: (message) => app.log.error(message),
  });
  let stopRuntimeHeartbeat: () => Promise<void> = async () => undefined;

  app.get("/health/ready", async (_request, reply) => {
    const readiness = await getNovaRuntimeReadiness();
    return reply.code(readiness.ok ? 200 : 503).send(readiness);
  });

  app.addHook("onClose", async () => {
    stopWorkerLoop();
    await stopRuntimeHeartbeat();
  });

  getMcpRegistry()
    .initializeAll()
    .then((status) => {
      app.log.info(
        `[NOVA MCP] ${status.connectedProviders}/${status.providers.length} providers connected, ${status.totalTools} tools available`,
      );
    })
    .catch((error) => {
      app.log.warn(`[NOVA MCP] initialization error: ${error instanceof Error ? error.message : "unknown"}`);
    });

  const host = resolveNovaListenHost();
  await app.listen({ port: config.port, host });
  stopRuntimeHeartbeat = startNovaRuntimeHeartbeat({
    info: (message) => app.log.info(message),
    warn: (message) => app.log.warn(message),
  });
  app.log.info(`[NOVA AGI] listening on ${host}:${config.port} with verifiable AGI workers`);
}

if (isMain) {
  startServer().catch((error) => {
    console.error("[nova.agi] startup failed");
    console.error(error);
    process.exit(1);
  });
}

export { buildNovaApp, config };
