import type { FastifyInstance } from "fastify";
import { toHttpError, json } from "../lib/http.js";
import { sbAdmin } from "../lib/supabase.js";

type QueryParams = {
  project_id?: string;
};

function relationMissingMessage(error: unknown): string {
  const msg =
    error instanceof Error
      ? error.message
      : typeof error === "string"
        ? error
        : "Relación no disponible.";

  return msg.toLowerCase();
}

function isMissingRelation(error: unknown): boolean {
  const msg = relationMissingMessage(error);
  return (
    msg.includes("does not exist") ||
    msg.includes("schema cache") ||
    msg.includes("could not find the table") ||
    msg.includes("relation") ||
    msg.includes("audit_exports") ||
    msg.includes("audit_chain")
  );
}

async function collectLightweightVerification(project_id: string) {
  const sb = sbAdmin();

  const [eventsRes, auditLogsRes] = await Promise.all([
    sb
      .from("events")
      .select("id, type, level, message, created_at", { count: "exact" })
      .eq("project_id", project_id)
      .order("created_at", { ascending: false })
      .limit(10),
    sb
      .from("audit_logs")
      .select("id, action, context, created_at", { count: "exact" })
      .eq("project_id", project_id)
      .order("created_at", { ascending: false })
      .limit(10),
  ]);

  return {
    events: {
      count: eventsRes.count ?? 0,
      rows: eventsRes.data ?? [],
      error: eventsRes.error?.message ?? null,
    },
    audit_logs: {
      count: auditLogsRes.count ?? 0,
      rows: auditLogsRes.data ?? [],
      error: auditLogsRes.error?.message ?? null,
    },
  };
}

export async function jurixPublicRoutes(app: FastifyInstance) {
  app.get("/public/v1/jurix/verify/:export_id", async (req, reply) => {
    try {
      const params = req.params as { export_id: string };
      const query = (req.query ?? {}) as QueryParams;
      const project_id = String(query.project_id ?? "hocker-one");

      /**
       * Verificación real:
       * En el ZIP actual de nova.agi, jurix-public.ts importaba verifyAuditChain desde
       * ../lib/audit-chain.js, pero ese archivo NO existe.
       *
       * Además, en el esquema actual vivo de hocker.one tampoco están provisionadas
       * las tablas audit_exports / audit_chain.
       *
       * Entonces este endpoint no puede mentir diciendo "verificado".
       * Responde transparente:
       * - si audit_exports existe, devuelve el registro
       * - si no existe, devuelve estado parcial/no provisionado
       */

      const exportRes = await sbAdmin()
        .from("audit_exports")
        .select("*")
        .eq("project_id", project_id)
        .eq("id", params.export_id)
        .maybeSingle();

      if (exportRes.error && isMissingRelation(exportRes.error)) {
        const fallback = await collectLightweightVerification(project_id);

        return json(reply, 501, {
          ok: false,
          error: "Jurix public verify no está provisionado completo en este entorno.",
          status: "not_provisioned",
          project_id,
          export_id: params.export_id,
          verification: {
            mode: "lightweight",
            export_registry_available: false,
            audit_chain_available: false,
            notes: [
              "Falta la relación audit_exports en la base actual o no está expuesta en PostgREST.",
              "El helper audit-chain no existe en el ZIP actual de nova.agi.",
              "Se entrega contexto parcial con events y audit_logs para diagnóstico real.",
            ],
          },
          fallback,
        });
      }

      if (exportRes.error) {
        throw exportRes.error;
      }

      if (!exportRes.data) {
        return json(reply, 404, {
          ok: false,
          error: "Export no encontrado.",
          project_id,
          export_id: params.export_id,
        });
      }

      const exportRow = exportRes.data as Record<string, unknown>;
      const fallback = await collectLightweightVerification(project_id);

      return json(reply, 200, {
        ok: true,
        status: "partial_verification",
        export: {
          id: String(exportRow.id),
          project_id: String(exportRow.project_id),
          export_type: exportRow.export_type ?? null,
          file_name: exportRow.file_name ?? null,
          content_hash: exportRow.content_hash ?? null,
          chain_fingerprint: exportRow.chain_fingerprint ?? null,
          seal_token: exportRow.seal_token ?? null,
          seal_signature: exportRow.seal_signature ?? null,
          sealed_at: exportRow.sealed_at ?? null,
        },
        verification: {
          mode: "registry_only",
          export_registry_available: true,
          audit_chain_available: false,
          notes: [
            "Se encontró el registro del export.",
            "La verificación criptográfica completa de audit_chain sigue pendiente de provisionar en este repo/entorno.",
          ],
        },
        fallback,
      });
    } catch (error) {
      const e = toHttpError(error);
      return json(reply, e.status, {
        ok: false,
        error: e.message,
      });
    }
  });
}