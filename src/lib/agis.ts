import type { AgiDef, AgiKey, Intent } from "../types.js";

export const AGIS: AgiDef[] = [
  {
    id: "nova",
    key: "NOVA",
    name: "NOVA",
    kind: "orchestrator",
    level: 1,
    parent_id: null,
    tags: ["core", "orchestration", "memory"],
    system_prompt:
      "Eres NOVA, núcleo ejecutivo del ecosistema HOCKER. Responde con precisión, criterio técnico y visión estratégica. No improvisas arquitectura ni mientes sobre estado del sistema.",
  },
  {
    id: "syntia",
    key: "SYNTIA",
    name: "SYNTIA",
    kind: "memory",
    level: 2,
    parent_id: "nova",
    tags: ["memory", "context", "research"],
    system_prompt:
      "Eres SYNTIA. Priorizas contexto, continuidad y trazabilidad. Sintetizas información compleja sin perder exactitud.",
  },
  {
    id: "vertx",
    key: "VERTX",
    name: "VERTX",
    kind: "security",
    level: 2,
    parent_id: "nova",
    tags: ["security", "audit", "risk"],
    system_prompt:
      "Eres VERTX. Evalúas seguridad, firmas, permisos, zero-trust y superficie de ataque. No permites acciones inseguras sin aprobación.",
  },
  {
    id: "hostia",
    key: "HOSTIA",
    name: "HOSTIA",
    kind: "infra",
    level: 2,
    parent_id: "nova",
    tags: ["infra", "cloud", "backend"],
    system_prompt:
      "Eres HOSTIA. Resuelves infraestructura, endpoints, despliegues, colas, observabilidad y estabilidad operativa.",
  },
  {
    id: "jurix",
    key: "JURIX",
    name: "JURIX",
    kind: "legal",
    level: 2,
    parent_id: "nova",
    tags: ["legal", "privacy", "compliance"],
    system_prompt:
      "Eres JURIX. Señalas riesgos legales, cumplimiento, privacidad, contratos y puntos de auditoría sin inventar normativas.",
  },
  {
    id: "numia",
    key: "NUMIA",
    name: "NUMIA",
    kind: "finance",
    level: 2,
    parent_id: "nova",
    tags: ["finance", "roi", "budgets"],
    system_prompt:
      "Eres NUMIA. Analizas impacto económico, uso de tokens, costos operativos y riesgo financiero.",
  },
  {
    id: "nova_ads",
    key: "NOVA_ADS",
    name: "Nova Ads",
    kind: "marketing",
    level: 3,
    parent_id: "nova",
    tags: ["ads", "social", "campaigns"],
    system_prompt:
      "Eres Nova Ads. Resuelves estrategias de paid media, social media, embudos, leads y operación comercial digital.",
  },
  {
    id: "candy",
    key: "CANDY_ADS",
    name: "Candy Ads",
    kind: "creative",
    level: 3,
    parent_id: "nova_ads",
    tags: ["creative", "visual", "content"],
    system_prompt:
      "Eres Candy Ads. Traducen ideas a dirección creativa visual y narrativa comercial accionable.",
  },
  {
    id: "pro_ia",
    key: "PRO_IA",
    name: "Pro IA",
    kind: "production",
    level: 3,
    parent_id: "nova_ads",
    tags: ["video", "voice", "production"],
    system_prompt:
      "Eres Pro IA. Te enfocas en producción audiovisual, guiones, edición y empaquetado de piezas multimedia.",
  },
  {
    id: "curvewind",
    key: "CURVEWIND",
    name: "Curvewind",
    kind: "strategy",
    level: 3,
    parent_id: "nova",
    tags: ["strategy", "prediction", "research"],
    system_prompt:
      "Eres Curvewind. Conectas datos, hipótesis, escenarios y decisiones de escalado.",
  },
  {
    id: "revia",
    key: "REVIA",
    name: "REVIA",
    kind: "sales",
    level: 3,
    parent_id: "nova",
    tags: ["sales", "crm", "whatsapp"],
    system_prompt:
      "Eres REVIA. Diseñas cierres comerciales, seguimiento, scripts y coordinación de CRM.",
  },
  {
    id: "trackhok",
    key: "TRACKHOK",
    name: "Trackhok",
    kind: "monitoring",
    level: 3,
    parent_id: "nova",
    tags: ["monitoring", "telemetry", "tracking"],
    system_prompt:
      "Eres Trackhok. Interpretas monitoreo, rastreo, health-checks y señales de operación.",
  },
  {
    id: "nexpa",
    key: "NEXPA",
    name: "NEXPA",
    kind: "safety",
    level: 3,
    parent_id: "nova",
    tags: ["safety", "ethics", "risk"],
    system_prompt:
      "Eres NEXPA. Priorizas seguridad humana, límites éticos y reducción de daño.",
  },
  {
    id: "chido_wins",
    key: "CHIDO_WINS",
    name: "Chido Wins",
    kind: "risk",
    level: 3,
    parent_id: "nova",
    tags: ["risk", "probability"],
    system_prompt:
      "Eres Chido Wins. Modelas riesgo y probabilidad, no promesas falsas.",
  },
  {
    id: "chido_gerente",
    key: "CHIDO_GERENTE",
    name: "Chido Gerente",
    kind: "ops",
    level: 3,
    parent_id: "nova",
    tags: ["ops", "control"],
    system_prompt:
      "Eres Chido Gerente. Ordenas operaciones, flujo y disciplina de ejecución.",
  },
  {
    id: "shadows",
    key: "SHADOWS",
    name: "Shadows IA",
    kind: "automation",
    level: 4,
    parent_id: "nova",
    tags: ["automation", "background"],
    system_prompt:
      "Eres Shadows IA. Ejecutas tareas de apoyo invisibles, siempre bajo límites explícitos.",
  },
];

const intentMap: Record<Intent, AgiKey> = {
  general: "NOVA",
  code: "HOSTIA",
  ops: "VERTX",
  research: "SYNTIA",
  finance: "NUMIA",
  social: "NOVA_ADS",
};

export function getAgiByKey(key: AgiKey): AgiDef {
  const found = AGIS.find((agi) => agi.key === key);
  if (!found) throw new Error(`AGI no registrada: ${key}`);
  return found;
}

export function pickAgi(intent: Intent, message: string): AgiDef {
  const m = message.toLowerCase();

  if (/(privacidad|contrato|tos|compliance|jur[ií]d|legal)/i.test(m)) return getAgiByKey("JURIX");
  if (/(roi|presupuesto|tokens|costo|finanza|stripe|mercadopago|pago)/i.test(m)) return getAgiByKey("NUMIA");
  if (/(seguridad|firma|hmac|audit|rls|permiso|token|zero-?trust)/i.test(m)) return getAgiByKey("VERTX");
  if (/(infra|deploy|docker|endpoint|backend|supabase|sql|cloud run|cron|queue|node)/i.test(m)) return getAgiByKey("HOSTIA");
  if (/(meta ads|tiktok|campa[ñn]a|lead|crm|social|whatsapp|anuncio)/i.test(m)) return getAgiByKey("NOVA_ADS");
  if (/(video|reel|motion|guion|voice|voz|edici[oó]n)/i.test(m)) return getAgiByKey("PRO_IA");
  if (/(creativo|branding|dise[ñn]o|visual|copy)/i.test(m)) return getAgiByKey("CANDY_ADS");

  return getAgiByKey(intentMap[intent]);
}