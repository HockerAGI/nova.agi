import { pathToFileURL } from "node:url";
import path from "node:path";
import { buildNovaApp } from "./app.js";
import { config } from "./config.js";

const currentScript = process.argv[1] ? pathToFileURL(path.resolve(process.argv[1])).href : "";
const isMain = import.meta.url === currentScript;

if (isMain) {
  const app = buildNovaApp();
  app
    .listen({ port: config.port, host: "0.0.0.0" })
    .then(() => {
      console.log(`nova.agi listening on ${config.port}`);
    })
    .catch((err) => {
      console.error(err);
      process.exit(1);
    });
}

export { buildNovaApp };