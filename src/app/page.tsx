import { redirect } from "next/navigation";

import { getPublicSupabaseConfig } from "@/lib/env";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

export default async function HomePage() {
  const { isConfigured } = getPublicSupabaseConfig();

  if (!isConfigured) {
    redirect("/login");
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  redirect(user ? "/requests" : "/login");
}
