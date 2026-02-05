export async function vercelRedeploy() {
  const hook = process.env.VERCEL_DEPLOY_HOOK ?? "";
  if (!hook) return { ok: false, error: "Missing VERCEL_DEPLOY_HOOK" };

  const r = await fetch(hook, { method: "POST" });
  if (!r.ok) return { ok: false, error: `Vercel hook failed (${r.status})` };
  return { ok: true };
}