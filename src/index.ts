import { pathToFileURL } from "node:url";
import path from "node:path";
import { buildNovaApp, startServer } from "./app.js";
import { config } from "./config.js";

const currentScript = process.argv[1]
  ? pathToFileURL(path.resolve(process.argv[1])).href
  : "";

const isMain = import.meta.url === currentScript;

if (isMain) {
  startServer().catch((error) => {
    console.error("[nova.agi] startup failed");
    console.error(error);
    process.exit(1);
  });
}

export { buildNovaApp, startServer, config };