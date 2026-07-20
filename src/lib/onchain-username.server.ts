// Server-side helper to resolve on-chain usernames from the Celo username registry.
// Used to map wallets → identities so the leaderboard/live feed never falls back
// to a raw 0x… address when the wallet actually holds an on-chain username.
import { getRuntimeEnv } from "./reward-distribution";

const USERNAME_CONTRACT = "0xb1ce5a24ab458a8fde04e0df9bfe86908515c90b";
const USERNAME_ABI = [
  {
    inputs: [{ internalType: "address", name: "", type: "address" }],
    name: "usernameOf",
    outputs: [{ type: "string" }],
    stateMutability: "view",
    type: "function",
  },
] as const;

// Simple in-memory cache to avoid hammering the RPC on repeated shreds.
const cache = new Map<string, { name: string | null; expires: number }>();
const TTL_MS = 10 * 60 * 1000;

function getRpcUrl(): string {
  const env = getRuntimeEnv();
  return env.CELO_RPC_URL || env.VITE_CELO_RPC_URL || "https://forno.celo.org";
}

export async function resolveOnchainUsername(wallet: string, opts?: { force?: boolean }): Promise<string | null> {
  const key = wallet.toLowerCase();
  const cached = cache.get(key);
  if (!opts?.force && cached && cached.expires > Date.now()) return cached.name;

  try {
    const { createPublicClient, http } = await import("viem");
    const { celo } = await import("viem/chains");
    const client = createPublicClient({ chain: celo, transport: http(getRpcUrl()) });
    const name = (await client.readContract({
      address: USERNAME_CONTRACT as `0x${string}`,
      abi: USERNAME_ABI,
      functionName: "usernameOf",
      args: [wallet as `0x${string}`],
    })) as string;
    const resolved = name && name.length > 0 ? name : null;
    cache.set(key, { name: resolved, expires: Date.now() + TTL_MS });
    return resolved;
  } catch (error) {
    console.warn("[username] on-chain resolution failed", { wallet, error: (error as Error)?.message });
    cache.set(key, { name: null, expires: Date.now() + 60_000 });
    return null;
  }
}
