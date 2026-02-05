export async function vercelRedeploy(hookUrl: string) {
  const r = await fetch(hookUrl, { method: "POST" });
  const text = await r.text().catch(() => "");
  return { ok: r.ok, status: r.status, body: text.slice(0, 1000) };
}