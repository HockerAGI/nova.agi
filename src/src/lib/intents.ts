export type Intent =
  | { type: "enqueue"; command: "status" | "ping" | "read_dir" | "read_file_head"; payload: any }
  | { type: "vercel.redeploy"; payload: any }
  | { type: "unknown"; reason: string };

export function interpretRules(textRaw: string): Intent {
  const text = (textRaw || "").toLowerCase();

  if (text.includes("status") || text.includes("estado")) return { type: "enqueue", command: "status", payload: {} };
  if (text.includes("ping")) return { type: "enqueue", command: "ping", payload: {} };

  if (text.includes("listar") && (text.includes("archivos") || text.includes("carpeta") || text.includes("directorio"))) {
    return { type: "enqueue", command: "read_dir", payload: { path: "." } };
  }

  if ((text.includes("leer") || text.includes("muestra")) && (text.includes("archivo") || text.includes(".md") || text.includes(".txt"))) {
    return { type: "enqueue", command: "read_file_head", payload: { path: ".", max_bytes: 4096 } };
  }

  if (text.includes("redeploy") || text.includes("re-deploy") || text.includes("republicar") || text.includes("desplegar")) {
    return { type: "vercel.redeploy", payload: {} };
  }

  return { type: "unknown", reason: "No entendí una acción soportada (por ahora)." };
}