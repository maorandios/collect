import "server-only";

import { createClient } from "@supabase/supabase-js";

import { getPublicSupabaseConfig } from "@/lib/env";
import { getSupabaseSecretKey } from "@/lib/supabase/secret";

export function createAdminClient() {
  const { url, isConfigured } = getPublicSupabaseConfig();
  if (!isConfigured || !url) {
    throw new Error("missing_supabase_admin_config");
  }

  return createClient(url, getSupabaseSecretKey(), {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
    },
  });
}
