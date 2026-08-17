import { createBrowserClient } from "@supabase/ssr";

import { getPublicSupabaseConfig } from "@/lib/env";

export function createClient() {
  const { url, anonKey, isConfigured } = getPublicSupabaseConfig();

  if (!isConfigured || !url || !anonKey) {
    throw new Error("missing_supabase_config");
  }

  return createBrowserClient(url, anonKey);
}
