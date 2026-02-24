/**
 * Intenta extraer y parsear un JSON válido incluso si el LLM
 * lo envuelve en bloques de código markdown.
 */
export function parseStableJson(text: string): any {
  if (!text) return null;
  
  let clean = text.trim();
  
  // Quitar bloques de markdown si la IA los incluyó
  if (clean.startsWith("```json")) {
    clean = clean.replace(/^```json/, "");
  } else if (clean.startsWith("```")) {
    clean = clean.replace(/^```/, "");
  }
  
  if (clean.endsWith("```")) {
    clean = clean.replace(/```$/, "");
  }
  
  clean = clean.trim();
  
  try {
    return JSON.parse(clean);
  } catch (e) {
    console.error("Fallo al parsear JSON estable:", e);
    return null;
  }
}