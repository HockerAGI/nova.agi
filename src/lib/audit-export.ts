import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import PDFDocument from "pdfkit";
import { sbAdmin } from "./supabase.js";
import { canonicalJson, sha256, buildExportSeal, utcTimestamp } from "./export-seal.js";
import { createAuditFingerprint, verifyAuditChain } from "./audit-chain.js";
import type { AuditExportType, AuditExportRow } from "./export-types.js";

export async function collectAuditRows(project_id: string, limit = 500) {
  const sb = sbAdmin();
  const [{ data: chain }, { data: events }, { data: alerts }, { data: incidents }] = await Promise.all([
    sb.from("audit_chain").select("*").eq("project_id", project_id).order("seq", { ascending: true }).limit(limit),
    sb.from("events").select("*").eq("project_id", project_id).order("created_at", { ascending: false }).limit(limit),
    sb.from("observability_alerts").select("*").eq("project_id", project_id).order("created_at", { ascending: false }).limit(limit),
    sb.from("observability_incidents").select("*").eq("project_id", project_id).order("created_at", { ascending: false }).limit(limit)
  ]);

  return {
    chain: chain ?? [],
    events: events ?? [],
    alerts: alerts ?? [],
    incidents: incidents ?? []
  };
}

function escapeCsvCell(value: unknown): string {
  const s = value === null || value === undefined ? "" : typeof value === "string" ? value : JSON.stringify(value);
  return `"${s.replace(/"/g, '""')}"`;
}

export async function generateAuditCsv(project_id: string, limit = 500) {
  const data = await collectAuditRows(project_id, limit);

  const rows = [
    ["section","id","timestamp","type","detail","payload"].map(escapeCsvCell).join(","),
    ...data.chain.map((r: any) => [
      "audit_chain",
      r.id,
      r.created_at,
      r.event_type,
      `${r.action} | ${r.entity_type} | ${r.role} | ${r.actor_type}`,
      canonicalJson(r.payload)
    ].map(escapeCsvCell).join(",")),
    ...data.events.map((r: any) => [
      "events",
      r.id,
      r.created_at,
      r.type,
      `${r.level} | ${r.message}`,
      canonicalJson(r.data ?? {})
    ].map(escapeCsvCell).join(",")),
    ...data.alerts.map((r: any) => [
      "alerts",
      r.id,
      r.created_at,
      `alert.${r.severity}`,
      `${r.status} | ${r.title}`,
      canonicalJson(r.data ?? {})
    ].map(escapeCsvCell).join(",")),
    ...data.incidents.map((r: any) => [
      "incidents",
      r.id,
      r.created_at,
      `incident.${r.severity}`,
      `${r.status} | ${r.title}`,
      canonicalJson({
        summary: r.summary,
        impact: r.impact,
        root_cause: r.root_cause,
        mitigation: r.mitigation
      })
    ].map(escapeCsvCell).join(","))
  ];

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
  doc.text(`Chain rows: ${data.chain.length}`);
  doc.text(`Events: ${data.events.length}`);
  doc.text(`Alerts: ${data.alerts.length}`);
  doc.text(`Incidents: ${data.incidents.length}`);

  doc.moveDown();
  doc.fontSize(13).text("Audit chain", { underline: true });
  for (const row of data.chain.slice(0, limit)) {
    doc.moveDown(0.4);
    doc.fontSize(9).text(`#${row.seq} ${row.action} | ${row.entity_type} | ${row.severity}`);
    doc.text(`Hash: ${row.row_hash}`);
    doc.text(`Prev: ${row.prev_hash || "GENESIS"}`);
    doc.text(`Signature: ${row.signature}`);
  }

  doc.addPage();
  doc.fontSize(13).text("Events", { underline: true });
  for (const row of data.events.slice(0, limit)) {
    doc.moveDown(0.4);
    doc.fontSize(9).text(`${row.created_at} | ${row.type} | ${row.level}`);
    doc.text(row.message);
  }

  doc.end();
  return done;
}

export async function createCertifiedExport(args: {
  project_id: string;
  export_type: AuditExportType;
  created_by?: string | null;
  limit?: number;
  scope?: Record<string, unknown>;
}) {
  const sb = sbAdmin();
  const limit = Math.min(Math.max(args.limit ?? 500, 10), 5000);

  const fingerprint = await createAuditFingerprint(args.project_id);
  const verified = await verifyAuditChain(args.project_id, limit);

  const sealed_at = utcTimestamp();
  const fileNameBase = `jurix-${args.project_id}-${args.export_type}-${sealed_at.replace(/[:.]/g, "-")}`;
  const fileName = `${fileNameBase}.${args.export_type === "csv" ? "csv" : args.export_type === "pdf" ? "pdf" : "json"}`;

  let fileBuffer: Buffer;
  if (args.export_type === "csv") {
    fileBuffer = await generateAuditCsv(args.project_id, limit);
  } else if (args.export_type === "pdf") {
    fileBuffer = await generateAuditPdf(args.project_id, limit);
  } else {
    fileBuffer = Buffer.from(JSON.stringify({
      project_id: args.project_id,
      generated_at: sealed_at,
      chain: verified,
      fingerprint
    }, null, 2), "utf8");
  }

  const content_hash = sha256(fileBuffer.toString("base64"));
  const seal = buildExportSeal({
    secret: process.env.NOVA_COMMAND_HMAC_SECRET ?? "",
    project_id: args.project_id,
    export_type: args.export_type,
    content_hash,
    chain_fingerprint: fingerprint.fingerprint,
    file_name: fileName,
    sealed_at
  });

  const dir = path.join(process.cwd(), "exports", args.project_id);
  fs.mkdirSync(dir, { recursive: true });
  const filePath = path.join(dir, fileName);
  fs.writeFileSync(filePath, fileBuffer);

  const { data, error } = await sb
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
      created_by: args.created_by ?? null
    })
    .select("*")
    .single();

  if (error || !data) throw new Error(error?.message || "No se pudo registrar exportación.");

  return {
    export: data as AuditExportRow,
    filePath,
    fingerprint,
    verified
  };
}