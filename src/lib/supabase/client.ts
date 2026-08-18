import { createBrowserClient } from "@supabase/ssr";

import { getPublicSupabaseConfig } from "@/lib/env";

export function createClient() {
  const { url, publishableKey, isConfigured } = getPublicSupabaseConfig();

  if (!isConfigured || !url || !publishableKey) {
    throw new Error("missing_supabase_config");
  }

  return createBrowserClient(url, publishableKey);
}
