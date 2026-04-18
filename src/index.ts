import { buildNovaApp } from "./app.js";
import { config } from "./config.js";

async function main(): Promise<void> {
  const app = buildNovaApp();

  const shutdown = async (signal: NodeJS.Signals): Promise<void> => {
    app.log.info({ signal }, "Shutting down nova.agi");
    try {
      await app.close();
      process.exit(0);
    } catch (error) {
      app.log.error({ error }, "Failed to close nova.agi cleanly");
      process.exit(1);
    }
  };

  process.on("SIGINT", shutdown);
  process.on("SIGTERM", shutdown);

  try {
    await app.listen({
      port: config.PORT,
      host: "0.0.0.0",
    });
    app.log.info(`nova.agi listening on ${config.PORT}`);
  } catch (error) {
    app.log.error(error);
    process.exit(1);
  }
}

void main();