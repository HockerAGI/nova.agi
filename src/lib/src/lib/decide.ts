import crypto from "node:crypto";
import { sbAdmin } from "./supabase.js";
import { signCommand } from "./security.js";

type Input = {
  project_id: string;
  thread_id: string;
  user_id: string;
  node_id: string;
  text: string;
};

type Output = {
  reply: string;
  action?: any;
};

const SAFE_COMMANDS = new Set(["status", "fs.list", "fs.read"]);
const SENSITIVE_COMMANDS = new Set(["fs.write", "shell.exec"]);

function wants(t: string, keys: string[]) {
  const s = t.toLowerCase();
  return keys.some((k) => s.includes(k));
}

function extractMoney(text: string): number | null {
  const t = text.replace(/,/g, ".");
  const m = t.match(/\$?\s*(\d{1,7})(?:\.(\d{1,2}))?/);
  if (!m) return null;
  const whole = Number(m[1]);
  const dec = m[2] ? Number(m[2].padEnd(2, "0")) : 0;
  if (!Number.isFinite(whole) || !Number.isFinite(dec)) return null;
  return whole + dec / 100;
}

function extractInt(text: string): number | null {
  const m = text.match(/(\d{1,7})/);
  if (!m) return null;
  const n = Number(m[1]);
  return Number.isFinite(n) ? Math.floor(n) : null;
}

function extractName(text: string): string | null {
  const q = text.match(/[“"]([^”"]+)[”"]/);
  if (q?.[1]) return q[1].trim();
  const cleaned = text.trim();
  if (cleaned.length >= 2 && cleaned.length <= 60 && !/\d/.test(cleaned)) return cleaned;
  return null;
}

export async function decide(input: Input): Promise<Output> {
  const sb = sbAdmin();

  // kill-switch
  const { data: controls } = await sb
    .from("system_controls")
    .select("kill_switch")
    .eq("project_id", input.project_id)
    .eq("id", "global")
    .maybeSingle();

  if (controls?.kill_switch) return { reply: "Estoy en pausa. El kill-switch está activo para este proyecto." };

  // cargar estado del thread (para guiar sin tecnicismos)
  const { data: thread } = await sb
    .from("nova_threads")
    .select("meta")
    .eq("id", input.thread_id)
    .maybeSingle();

  const meta = (thread?.meta ?? {}) as any;

  // FLOW: alta de producto
  if (meta?.flow === "add_product") {
    const draft = meta.draft ?? {};
    const txt = input.text.trim();

    if (!draft.name) {
      const name = extractName(txt);
      if (!name) {
        await sb.from("nova_threads").update({ meta: { flow: "add_product", draft } }).eq("id", input.thread_id);
        return { reply: "Va. Dime el **nombre del producto** (si quieres, entre comillas)." };
      }
      draft.name = name;
      await sb.from("nova_threads").update({ meta: { flow: "add_product", draft } }).eq("id", input.thread_id);
      return { reply: `Perfecto. ¿Cuál es el **precio** de “${name}”? (ej: 199.99)` };
    }

    if (draft.price == null) {
      const price = extractMoney(txt);
      if (price == null) return { reply: `Dime el precio como número. Ej: 199.99` };
      draft.price = price;
      await sb.from("nova_threads").update({ meta: { flow: "add_product", draft } }).eq("id", input.thread_id);
      return { reply: "Listo. ¿Cuántas piezas hay en **stock**?" };
    }

    if (draft.stock == null) {
      const stock = extractInt(txt);
      if (stock == null) return { reply: "Dime el stock como número. Ej: 10" };
      draft.stock = stock;
      await sb.from("nova_threads").update({ meta: { flow: "add_product", draft } }).eq("id", input.thread_id);
      return { reply: "¿Tienes **SKU**? Si no, escribe: no" };
    }

    if (draft.sku == null) {
      const sku = txt.toLowerCase().includes("no") ? null : txt.trim().slice(0, 64);
      draft.sku = sku;

      const { error } = await sb.from("supply_products").insert({
        project_id: input.project_id,
        name: draft.name,
        sku: draft.sku,
        price: Number(draft.price),
        stock: Number(draft.stock),
        meta: { created_by: input.user_id, via: "nova" }
      });

      await sb.from("nova_threads").update({ meta: {} }).eq("id", input.thread_id);

      if (error) return { reply: `No pude crear el producto. Error: ${error.message}` };

      return {
        reply: `Listo ✅ Producto creado: “${draft.name}”, precio $${Number(draft.price).toFixed(2)}, stock ${draft.stock}.`
      };
    }
  }

  const t = input.text.toLowerCase();

  // Iniciar flujo de producto
  if (wants(t, ["agrega", "nuevo producto"]) || (t.includes("agrega") && t.includes("producto"))) {
    await sb.from("nova_threads").update({ meta: { flow: "add_product", draft: {} } }).eq("id", input.thread_id);
    return { reply: "Hecho. Empecemos: ¿cómo se llama el producto?" };
  }

  // Estatus del ecosistema (sin ejecutar nada)
  if (t.includes("estatus") && t.includes("ecosistema")) {
    const [nodes, cmds, events] = await Promise.all([
      sb.from("nodes").select("id,status,last_seen_at").eq("project_id", input.project_id).limit(20),
      sb.from("commands").select("id,status,command,node_id,created_at").eq("project_id", input.project_id).order("created_at", { ascending: false }).limit(10),
      sb.from("events").select("id,level,type,message,created_at").eq("project_id", input.project_id).order("created_at", { ascending: false }).limit(10)
    ]);

    return {
      reply:
        `Estatus del ecosistema:\n` +
        `• Nodos: ${nodes.data?.length ?? 0}\n` +
        `• Comandos recientes: ${cmds.data?.length ?? 0}\n` +
        `• Eventos recientes: ${events.data?.length ?? 0}\n\n` +
        `Si quieres estado del servidor, di: “Nova, estatus del nodo”.`,
      action: { type: "ecosystem_snapshot" }
    };
  }

  // Estatus del nodo/servidor => encola comando status
  if (wants(t, ["estatus del nodo", "estado del nodo", "estatus del servidor", "estado del servidor"]) || (t.includes("estatus") && (t.includes("nodo") || t.includes("servidor")))) {
    const id = crypto.randomUUID();
    const command = "status";
    const payload = {};
    const secret = process.env.HOCKER_COMMAND_SIGNING_SECRET ?? "";
    if (!secret) return { reply: "Falta configuración interna (signing secret)." };

    const signature = signCommand(secret, {
      id,
      project_id: input.project_id,
      node_id: input.node_id,
      command,
      payload
    });

    const { error } = await sb.from("commands").insert({
      id,
      project_id: input.project_id,
      node_id: input.node_id,
      command,
      payload,
      status: "queued",
      needs_approval: false,
      signature,
      created_by: input.user_id
    });

    if (error) return { reply: `No pude encolar el comando. Error: ${error.message}` };

    await sb.from("events").insert({
      project_id: input.project_id,
      node_id: input.node_id,
      level: "info",
      type: "nova.enqueued",
      message: "NOVA encoló: status",
      data: { command_id: id }
    });

    return {
      reply: "Listo. Ya pedí el estatus. En cuanto el Agent lo reporte, lo verás en la cola de comandos.",
      action: { type: "enqueue_command", command, node_id: input.node_id }
    };
  }

  // Ayuda
  return {
    reply:
      "Te escucho. Prueba:\n" +
      "• “Nova, estatus del ecosistema”\n" +
      "• “Nova, estatus del nodo”\n" +
      "• “Nova, agrega nuevo producto”"
  };
}