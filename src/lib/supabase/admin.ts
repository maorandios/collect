import { createClient } from "@supabase/supabase-js";

import { getPublicSupabaseConfig } from "@/lib/env";

export function createAdminClient() {
  const { url, isConfigured } = getPublicSupabaseConfig();
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!isConfigured || !url || !serviceRoleKey) {
    throw new Error("missing_supabase_admin_config");
  }

  return createClient(url, serviceRoleKey, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
    },
  });
}
