import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";

import { getPublicSupabaseConfig } from "@/lib/env";

export async function createClient() {
  const { url, publishableKey, isConfigured } = getPublicSupabaseConfig();

  if (!isConfigured || !url || !publishableKey) {
    throw new Error("missing_supabase_config");
  }

  const cookieStore = await cookies();

  return createServerClient(url, publishableKey, {
    cookies: {
      getAll() {
        return cookieStore.getAll();
      },
      setAll(cookiesToSet) {
        try {
          cookiesToSet.forEach(({ name, value, options }) => {
            cookieStore.set(name, value, options);
          });
        } catch {
          // Called from a Server Component; the proxy refreshes the session.
        }
      },
    },
  });
}
