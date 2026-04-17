import { FastifyInstance } from "fastify";
import { toHttpError, json } from "../lib/http.js";
import { sbAdmin } from "../lib/supabase.js";
import { verifyAuditChain } from "../lib/audit-chain.js";

export async function jurixPublicRoutes(app: FastifyInstance) {
  app.get("/public/v1/jurix/verify/:export_id", async (req, reply) => {
    try {
      const params = req.params as { export_id: string };
      const q = req.query as Record<string, unknown>;
      const project_id = String(q.project_id || "hocker-one");

      const { data, error } = await sbAdmin()
        .from("audit_exports")
        .select("*")
        .eq("project_id", project_id)
        .eq("id", params.export_id)
        .maybeSingle();

      if (error) throw error;
      if (!data) return json(reply, 404, { ok: false, error: "Export no encontrado." });

      const exportRow: any = data;
      const chain = await verifyAuditChain(project_id, 5000);

      return json(reply, 200, {
        ok: true,
        export: {
          id: exportRow.id,
          project_id: exportRow.project_id,
          export_type: exportRow.export_type,
          file_name: exportRow.file_name,
          content_hash: exportRow.content_hash,
          chain_fingerprint: exportRow.chain_fingerprint,
          seal_token: exportRow.seal_token,
          seal_signature: exportRow.seal_signature,
          sealed_at: exportRow.sealed_at
        },
        chain
      });
    } catch (error) {
      const e = toHttpError(error);
      return json(reply, e.status, { ok: false, error: e.message });
    }
  });
}