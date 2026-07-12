import { createFileRoute } from "@tanstack/react-router";
import { getRuntimeEnv } from "@/lib/reward-distribution";

export const Route = createFileRoute("/api/health")({
  server: {
    handlers: {
      GET: async () => {
        const env = getRuntimeEnv();
        return Response.json({
          ok: true,
          backend: {
            hasSupabaseUrl: Boolean(env.SUPABASE_URL || env.VITE_SUPABASE_URL),
            hasPublishableKey: Boolean(env.SUPABASE_PUBLISHABLE_KEY || env.VITE_SUPABASE_PUBLISHABLE_KEY),
            hasServiceRoleKey: Boolean(env.SUPABASE_SERVICE_ROLE_KEY),
            hasBackendSignerKey: Boolean(env.BACKEND_SIGNER_KEY),
            hasNeynarApiKey: Boolean(env.NEYNAR_API_KEY),
            celoRpcUrl: env.CELO_RPC_URL || env.VITE_CELO_RPC_URL || "https://forno.celo.org",
          },
        });
      },
    },
  },
});