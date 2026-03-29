import path from "node:path";
import { pathToFileURL } from "node:url";
import { config } from "./config.js";
import { buildNovaApp } from "./app.js";

export { handleChat, buildNovaApp } from "./app.js";

const isMain = process.argv[1]
  ? pathToFileURL(path.resolve(process.argv[1])).href === import.meta.url
  : false;

if (isMain) {
  const app = buildNovaApp({ logger: true });

  app.listen({ port: config.port, host: "0.0.0.0" }).catch((error) => {
    app.log.error(error);
    process.exit(1);
  });
}