import { executeAutonomousAction } from "./agentic-executive.js";

export async function bridgeFileDiscovery(path = ".") {
  console.log(`[BRIDGE] NOVA iniciando descubrimiento en: ${path}`);
  return await executeAutonomousAction("read_dir", { path }, "hocker-node-1");
}

export async function bridgeFileRead(filepath: string) {
  console.log(`[BRIDGE] NOVA leyendo archivo: ${filepath}`);
  return await executeAutonomousAction("read_file_head", { path: filepath, lines: 50 }, "hocker-node-1");
}
