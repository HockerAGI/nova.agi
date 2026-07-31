import { pathToFileURL } from "node:url";
import path from "node:path";
import { buildNovaApp } from "./app.js";
import { config } from "./config.js";
import { getMcpRegistry } from "./lib/mcp/mcp-registry.js";
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

  await app.listen({ port: config.port, host: "0.0.0.0" });
  app.log.info(`[NOVA AGI] listening on ${config.port} with verifiable AGI workers`);
}

if (isMain) {
  startServer().catch((error) => {
    console.error("[nova.agi] startup failed");
    console.error(error);
    process.exit(1);
  });
}

export { buildNovaApp, config };
