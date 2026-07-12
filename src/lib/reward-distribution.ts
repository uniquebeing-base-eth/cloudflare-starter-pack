type RuntimeEnv = Record<string, string | undefined>;

type RuntimeEnvSource = {
  process?: { env?: RuntimeEnv };
  import?: { meta?: { env?: RuntimeEnv } };
  env?: RuntimeEnv;
  __env?: RuntimeEnv;
  Bun?: { env?: RuntimeEnv };
};

export function normalizePrivateKey(value?: string | null): string | undefined {
  if (!value) return undefined;

  const trimmed = value.trim().replace(/^['"]|['"]$/g, "");
  if (!trimmed) return undefined;

  if (!trimmed.startsWith("0x") && /^[0-9a-fA-F]{64}$/.test(trimmed)) {
    return `0x${trimmed}`;
  }

  if (/^0x[0-9a-fA-F]{64}$/.test(trimmed)) {
    return trimmed;
  }

  return undefined;
}

export function getRuntimeEnv(source: RuntimeEnvSource = globalThis as RuntimeEnvSource): RuntimeEnv {
  const merged: RuntimeEnv = {};
  const candidates = [
    typeof process !== "undefined" ? process.env : undefined,
    import.meta.env as RuntimeEnv | undefined,
    source?.process?.env,
    source?.import?.meta?.env,
    source?.env,
    source?.__env,
    source?.Bun?.env,
  ];

  for (const candidate of candidates) {
    if (!candidate) continue;
    for (const [key, value] of Object.entries(candidate)) {
      if (typeof value === "string" && merged[key] === undefined) {
        merged[key] = value;
      }
    }
  }

  return merged;
}

export function resolveCeloRpcUrl(env: RuntimeEnv = getRuntimeEnv()): string {
  const configured = (env.CELO_RPC_URL || env.VITE_CELO_RPC_URL || env.CELO_RPC || "").trim();
  return configured || "https://forno.celo.org";
}
