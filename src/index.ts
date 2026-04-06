import "dotenv/config";
import path from "node:path";
import { pathToFileURL } from "node:url";

import { config } from "./config.js";
import { buildNovaApp, handleChat } from "./app.js";

export { buildNovaApp, handleChat } from "./app.js";

const currentScript = process.argv[1]
  ? pathToFileURL(path.resolve(process.argv[1])).href
  : "";

const isMain = import.meta.url === currentScript;

if (isMain) {
  const app = buildNovaApp({ logger: true });

  app
    .listen({ port: config.port, host: "0.0.0.0" })
    .then(() => {
      console.log(`NOVA AGI listening on ${config.port}`);
    })
    .catch((error: unknown) => {
      console.error(error);
      process.exit(1);
    });
}