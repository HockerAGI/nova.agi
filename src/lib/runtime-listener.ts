const LOOPBACK_HOSTS = new Set(["localhost", "127.0.0.1", "::1"]);

function normalizedHost(value: string): string {
  return value.trim().toLowerCase().replace(/^\[|\]$/g, "");
}

export function isLoopbackHost(value: string): boolean {
  return LOOPBACK_HOSTS.has(normalizedHost(value));
}

export function resolveNovaListenHost(env: NodeJS.ProcessEnv = process.env): string {
  const nodeEnv = String(env.NODE_ENV ?? "production").trim().toLowerCase();
  const configured = String(env.NOVA_HOST ?? "").trim();
  const host = configured || (nodeEnv === "production" ? "0.0.0.0" : "127.0.0.1");
  const orchestratorKey = String(env.NOVA_ORCHESTRATOR_KEY ?? "").trim();

  if (!orchestratorKey && !isLoopbackHost(host)) {
    throw new Error(
      "NOVA se niega a escuchar fuera de loopback sin NOVA_ORCHESTRATOR_KEY.",
    );
  }

  return host;
}
