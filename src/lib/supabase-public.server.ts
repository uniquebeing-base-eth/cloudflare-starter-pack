import { createClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";
import { getRuntimeEnv } from "./reward-distribution";

function isNewSupabaseApiKey(value: string): boolean {
  return value.startsWith("sb_publishable_") || value.startsWith("sb_secret_");
}

function createSupabaseFetch(supabaseKey: string): typeof fetch {
  return (input, init) => {
    const headers = new Headers(
      typeof Request !== "undefined" && input instanceof Request ? input.headers : undefined,
    );

    if (init?.headers) {
      new Headers(init.headers).forEach((value, key) => headers.set(key, value));
    }

    if (isNewSupabaseApiKey(supabaseKey) && headers.get("Authorization") === `Bearer ${supabaseKey}`) {
      headers.delete("Authorization");
    }

    headers.set("apikey", supabaseKey);
    return fetch(input, { ...init, headers });
  };
}

let cachedClient: ReturnType<typeof createClient<Database>> | undefined;

export function getSupabasePublic() {
  if (cachedClient) return cachedClient;

  const env = getRuntimeEnv();
  const supabaseUrl = env.SUPABASE_URL || env.VITE_SUPABASE_URL;
  const publishableKey = env.SUPABASE_PUBLISHABLE_KEY || env.VITE_SUPABASE_PUBLISHABLE_KEY;

  if (!supabaseUrl || !publishableKey) {
    const missing = [
      ...(!supabaseUrl ? ["SUPABASE_URL"] : []),
      ...(!publishableKey ? ["SUPABASE_PUBLISHABLE_KEY"] : []),
    ];
    throw new Error(`Database backend is not configured: missing ${missing.join(", ")}.`);
  }

  cachedClient = createClient<Database>(supabaseUrl, publishableKey, {
    global: {
      fetch: createSupabaseFetch(publishableKey),
    },
    auth: {
      storage: undefined,
      persistSession: false,
      autoRefreshToken: false,
    },
  });

  return cachedClient;
}