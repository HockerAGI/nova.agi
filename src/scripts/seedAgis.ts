import "dotenv/config";
import { seedAgis } from "../lib/register-agis.js";

async function main() {
  console.log("[+] Iniciando seed de AGIs globales");
  const total = await seedAgis();
  console.log(`[✓] OK: AGIs sembradas (${total}).`);
}

main().catch((error) => {
  console.error("[x] Seed AGIs falló:");
  console.error(error);
  process.exit(1);
});