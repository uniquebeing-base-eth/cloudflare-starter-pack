// Farcaster mini-app webhook receiver. Farcaster posts frame/miniapp events
// (add, remove, notifications enabled/disabled) here; we forward to Neynar for
// notification-token management.
import { createFileRoute } from "@tanstack/react-router";
import { getRuntimeEnv } from "@/lib/reward-distribution";

export const Route = createFileRoute("/api/webhook")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const body = await request.text();
        try {
          const key = getRuntimeEnv().NEYNAR_API_KEY;
          if (key) {
            await fetch("https://api.neynar.com/v2/farcaster/frame/notification_tokens/receive", {
              method: "POST",
              headers: { "content-type": "application/json", "x-api-key": key },
              body,
            }).catch(() => { /* non-fatal */ });
          }
        } catch { /* non-fatal */ }
        return Response.json({ ok: true });
      },
      GET: async () => Response.json({ ok: true }),
    },
  },
});
