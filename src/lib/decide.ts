import { supabaseAdmin } from "./supabase.js";

type DecideInput = {
  project_id: string;
  node_id?: string | null;
  text: string;
};

export type NovaAction =
  | { type: "reply"; text: string }
  | { type: "create_command"; node_id: string; command: string; payload: any; needs_approval: boolean };

export async function decide(input: DecideInput): Promise<NovaAction[]> {
  const t = input.text.toLowerCase().trim();
  const sb = supabaseAdmin();

  // 1) STATUS
  if (t.includes("status") || t.includes("estado") || t.includes("nodos")) {
    const nodes = await sb.from("nodes").select("id,name,status,last_seen").eq("project_id", input.project_id);
    const cmds = await sb.from("commands").select("id,status,created_at").eq("project_id", input.project_id).limit(20);

    return [{
      type: "reply",
      text:
        `Listo. Nodos: ${nodes.data?.length ?? 0}. ` +
        `Comandos recientes: ${cmds.data?.length ?? 0}. ` +
        `Dime: “ejecuta diagnóstico” o “abre cola de comandos”.`
    }];
  }

  // 2) DIAGNOSTICO (ejemplo real, seguro)
  if (t.includes("diagnost") || t.includes("health")) {
    if (!input.node_id) {
      return [{ type: "reply", text: "Necesito un node_id (elige un nodo en el panel) para correr diagnóstico." }];
    }
    return [
      { type: "reply", text: "Te propongo un diagnóstico básico. Queda en cola para aprobación." },
      {
        type: "create_command",
        node_id: input.node_id,
        command: "shell.exec",
        payload: { cmd: "uname -a && node -v && npm -v && df -h && free -m", timeoutMs: 60000 },
        needs_approval: true
      }
    ];
  }

  // 3) CREAR “SCAFFOLD” DE JUEGO (plantilla)
  if (t.includes("slots") || (t.includes("juego") && t.includes("casino"))) {
    if (!input.node_id) {
      return [{ type: "reply", text: "Para crear archivos necesito un node_id (un nodo con el repo en su WORKDIR)." }];
    }
    return [
      { type: "reply", text: "Ok. Puedo generar un scaffold (carpeta + archivos base). Lo dejo en cola para aprobación." },
      {
        type: "create_command",
        node_id: input.node_id,
        command: "fs.write",
        payload: {
          path: "chido-casino/games/slots/README.md",
          content:
`# Slots (Scaffold)
Esto es una base.
- engine: lógica del juego
- ui: pantalla
Siguiente paso: dime el framework exacto del casino (Pixi/Phaser/React Canvas) y el payout model.`
        },
        needs_approval: true
      }
    ];
  }

  // 4) DEFAULT
  return [{
    type: "reply",
    text:
      "Te entendí. Dame un comando más concreto, por ejemplo:\n" +
      "• “estado de nodos”\n" +
      "• “ejecuta diagnóstico”\n" +
      "• “crea scaffold slots en chido-casino”"
  }];
}