import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import PDFDocument from "pdfkit";
import { sbAdmin } from "./supabase.js";

export type AuditExportType = "json" | "csv" | "pdf";

export type AuditExportRow = {
  id: string;
  project_id: string;
  export_type: AuditExportType;
  file_name: string;
  file_path: string;
  content_hash: string;
  chain_fingerprint: string | null;
  seal_token: string | null;
  seal_signature: string | null;
  sealed_at: string;
  created_by: string | null;
  scope: Record<string, unknown> | null;
};

function utcTimestamp(): string {
  return new Date().toISOString();
}

function sha256(input: string | Buffer): string {
  return crypto.createHash("sha256").update(input).digest("hex");
}

function canonicalize(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonicalize);

  if (value && typeof value === "object") {
    const out: Record<string, unknown> = {};
    for (const key of Object.keys(value as Record<string, unknown>).sort()) {
      out[key] = canonicalize((value as Record<string, unknown>)[key]);
    }
    return out;
  }

  return value;
}

function canonicalJson(value: unknown): string {
  return JSON.stringify(canonicalize(value ?? {}));
}

function buildExportSeal(args: {
  secret: string;
  project_id: string;
  export_type: AuditExportType;
  content_hash: string;
  chain_fingerprint: string;
  file_name: string;
  sealed_at: string;
}) {
  const base = [
    args.project_id,
    args.export_type,
    args.content_hash,
    args.chain_fingerprint,
    args.file_name,
    args.sealed_at,
  ].join("|");

  return {
    seal_token: Buffer.from(base, "utf8").toString("base64url"),
    seal_signature: args.secret
      ? crypto.createHmac("sha256", args.secret).update(base).digest("hex")
      : null,
  };
}

async function safeSelect(
  table: string,
  project_id: string,
  limit: number,
  orderBy = "created_at",
) {
  try {
    const { data, error } = await sbAdmin()
      .from(table)
      .select("*")
      .eq("project_id", project_id)
      .order(orderBy, { ascending: false })
      .limit(limit);

    if (error) return { rows: [], available: false, error: error.message };
    return { rows: data ?? [], available: true, error: null };
  } catch (error) {
    return {
      rows: [],
      available: false,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

export async function collectAuditRows(project_id: string, limit = 500) {
  const safeLimit = Math.min(Math.max(limit, 10), 5000);

  const [events, auditLogs] = await Promise.all([
    safeSelect("events", project_id, safeLimit),
    safeSelect("audit_logs", project_id, safeLimit),
  ]);

  const auditChain = await safeSelect("audit_chain", project_id, safeLimit, "seq");
  const alerts = await safeSelect("observability_alerts", project_id, safeLimit);
  const incidents = await safeSelect("observability_incidents", project_id, safeLimit);

  return {
    chain: auditChain.rows,
    events: events.rows,
    alerts: alerts.rows,
    incidents: incidents.rows,
    audit_logs: auditLogs.rows,
    availability: {
      audit_chain: auditChain.available,
      events: events.available,
      observability_alerts: alerts.available,
      observability_incidents: incidents.available,
      audit_logs: auditLogs.available,
    },
    errors: {
      audit_chain: auditChain.error,
      events: events.error,
      observability_alerts: alerts.error,
      observability_incidents: incidents.error,
      audit_logs: auditLogs.error,
    },
  };
}

function escapeCsvCell(value: unknown): string {
  const s =
    value === null || value === undefined
      ? ""
      : typeof value === "string"
        ? value
        : JSON.stringify(value);

  return `"${s.replace(/"/g, '""')}"`;
}

export async function generateAuditCsv(project_id: string, limit = 500) {
  const data = await collectAuditRows(project_id, limit);

  const rows: string[] = [
    ["section", "id", "timestamp", "type", "detail", "payload"].map(escapeCsvCell).join(","),
  ];

  for (const row of data.events as Array<Record<string, unknown>>) {
    rows.push(
      [
        "events",
        row.id,
        row.created_at,
        row.type,
        `${row.level ?? "info"} | ${row.message ?? ""}`,
        canonicalJson(row.data ?? {}),
      ]
        .map(escapeCsvCell)
        .join(","),
    );
  }

  for (const row of data.audit_logs as Array<Record<string, unknown>>) {
    rows.push(
      [
        "audit_logs",
        row.id,
        row.created_at,
        row.action,
        `actor=${row.actor_user_id ?? "unknown"}`,
        canonicalJson(row.context ?? {}),
      ]
        .map(escapeCsvCell)
        .join(","),
    );
  }

  if (!data.availability.audit_chain) {
    rows.push(
      [
        "meta",
        "audit_chain_unavailable",
        utcTimestamp(),
        "not_provisioned",
        "audit_chain no disponible en este entorno",
        canonicalJson({ error: data.errors.audit_chain }),
      ]
        .map(escapeCsvCell)
        .join(","),
    );
  }

  return Buffer.from(rows.join("\n"), "utf8");
}

export async function generateAuditPdf(project_id: string, limit = 250) {
  const data = await collectAuditRows(project_id, limit);
  const doc = new PDFDocument({ margin: 40, size: "A4" });
  const chunks: Buffer[] = [];

  doc.on("data", (chunk) => chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk)));

  const done = new Promise<Buffer>((resolve, reject) => {
    doc.on("end", () => resolve(Buffer.concat(chunks)));
    doc.on("error", reject);
  });

  doc.fontSize(18).text("HOCKER — Jurix Compliance Export", { align: "center" });
  doc.moveDown();
  doc.fontSize(10).text(`Project: ${project_id}`);
  doc.text(`Generated: ${utcTimestamp()}`);
  doc.text(`Events: ${data.events.length}`);
  doc.text(`Audit logs: ${data.audit_logs.length}`);
  doc.text(`Audit chain available: ${String(data.availability.audit_chain)}`);
  doc.text(`Observability alerts available: ${String(data.availability.observability_alerts)}`);
  doc.text(`Observability incidents available: ${String(data.availability.observability_incidents)}`);

  doc.moveDown();
  doc.fontSize(13).text("Events", { underline: true });

  for (const row of (data.events as Array<Record<string, unknown>>).slice(0, limit)) {
    doc.moveDown(0.4);
    doc.fontSize(9).text(`${row.created_at ?? ""} | ${row.type ?? ""} | ${row.level ?? ""}`);
    doc.text(String(row.message ?? ""));
  }

  doc.addPage();
  doc.fontSize(13).text("Audit logs", { underline: true });

  for (const row of (data.audit_logs as Array<Record<string, unknown>>).slice(0, limit)) {
    doc.moveDown(0.4);
    doc.fontSize(9).text(`${row.created_at ?? ""} | ${row.action ?? ""}`);
    doc.text(canonicalJson(row.context ?? {}));
  }

  if (!data.availability.audit_chain) {
    doc.addPage();
    doc.fontSize(13).text("Provisioning status", { underline: true });
    doc.moveDown(0.5);
    doc.fontSize(10).text("audit_chain no está provisionado en la base actual.");
    doc.text(`Detalle: ${data.errors.audit_chain ?? "sin detalle"}`);
  }

  doc.end();
  return done;
}

function lightweightFingerprint(data: {
  events: unknown[];
  audit_logs: unknown[];
  chain: unknown[];
}) {
  const digest = sha256(
    canonicalJson({
      events: data.events,
      audit_logs: data.audit_logs,
      chain: data.chain,
    }),
  );

  return {
    fingerprint: digest,
    mode: "lightweight" as const,
  };
}

export async function createCertifiedExport(args: {
  project_id: string;
  export_type: AuditExportType;
  created_by?: string | null;
  limit?: number;
  scope?: Record<string, unknown>;
}) {
  const limit = Math.min(Math.max(args.limit ?? 500, 10), 5000);
  const sealed_at = utcTimestamp();

  let fileBuffer: Buffer;

  if (args.export_type === "csv") {
    fileBuffer = await generateAuditCsv(args.project_id, limit);
  } else if (args.export_type === "pdf") {
    fileBuffer = await generateAuditPdf(args.project_id, Math.min(limit, 250));
  } else {
    const collected = await collectAuditRows(args.project_id, limit);
    fileBuffer = Buffer.from(
      JSON.stringify(
        {
          project_id: args.project_id,
          generated_at: sealed_at,
          collected,
        },
        null,
        2,
      ),
      "utf8",
    );
  }

  const collected = await collectAuditRows(args.project_id, Math.min(limit, 500));
  const fingerprint = lightweightFingerprint(collected);
  const content_hash = sha256(fileBuffer);

  const fileNameBase = `jurix-${args.project_id}-${args.export_type}-${sealed_at.replace(/[:.]/g, "-")}`;
  const fileName = `${fileNameBase}.${args.export_type === "csv" ? "csv" : args.export_type === "pdf" ? "pdf" : "json"}`;

  const seal = buildExportSeal({
    secret: String(
      process.env.NOVA_COMMAND_HMAC_SECRET ??
        process.env.HOCKER_COMMAND_HMAC_SECRET ??
        process.env.COMMAND_HMAC_SECRET ??
        "",
    ).trim(),
    project_id: args.project_id,
    export_type: args.export_type,
    content_hash,
    chain_fingerprint: fingerprint.fingerprint,
    file_name: fileName,
    sealed_at,
  });

  const dir = path.join(process.cwd(), "exports", args.project_id);
  fs.mkdirSync(dir, { recursive: true });
  const filePath = path.join(dir, fileName);
  fs.writeFileSync(filePath, fileBuffer);

  try {
    const { data, error } = await sbAdmin()
      .from("audit_exports")
      .insert({
        project_id: args.project_id,
        export_type: args.export_type,
        scope: args.scope ?? { limit },
        file_name: fileName,
        file_path: filePath,
        content_hash,
        chain_fingerprint: fingerprint.fingerprint,
        seal_token: seal.seal_token,
        seal_signature: seal.seal_signature,
        sealed_at,
        expires_at: null,
        created_by: args.created_by ?? null,
      })
      .select("*")
      .single();

    if (error || !data) {
      throw error ?? new Error("No se pudo registrar exportación.");
    }

    return {
      export: data as AuditExportRow,
      filePath,
      fingerprint,
      verified: {
        ok: false,
        mode: "lightweight",
        note: "Registro guardado, verificación criptográfica completa aún no provisionada.",
      },
    };
  } catch (error) {
    return {
      export: {
        id: crypto.randomUUID(),
        project_id: args.project_id,
        export_type: args.export_type,
        file_name: fileName,
        file_path: filePath,
        content_hash,
        chain_fingerprint: fingerprint.fingerprint,
        seal_token: seal.seal_token,
        seal_signature: seal.seal_signature,
        sealed_at,
        created_by: args.created_by ?? null,
        scope: args.scope ?? { limit },
      } satisfies AuditExportRow,
      filePath,
      fingerprint,
      verified: {
        ok: false,
        mode: "lightweight",
        note: "Export local generado. audit_exports no está provisionado en este entorno.",
        error: error instanceof Error ? error.message : String(error),
      },
    };
  }
}