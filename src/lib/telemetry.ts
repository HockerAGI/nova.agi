import { Langfuse } from "langfuse-node";
import { config } from "../config.js";

function isPlaceholder(value: string | undefined | null): boolean {
  const s = String(value ?? "").trim().toLowerCase();
  return !s || s.includes("dummy") || s.includes("changeme") || s.includes("placeholder");
}

export function createLangfuseClient() {
  if (
    isPlaceholder(config.langfuse.publicKey) ||
    isPlaceholder(config.langfuse.secretKey) ||
    isPlaceholder(config.langfuse.baseUrl)
  ) {
    return null;
  }

  try {
    return new Langfuse({
      publicKey: config.langfuse.publicKey,
      secretKey: config.langfuse.secretKey,
      baseUrl: config.langfuse.baseUrl,
    });
  } catch (error) {
    console.warn("Langfuse deshabilitado: no se pudo inicializar el cliente.", error);
    return null;
  }
}