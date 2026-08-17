import { redirect } from "next/navigation";
import { NextResponse } from "next/server";

import { getPublicSupabaseConfig } from "@/lib/env";
import { he } from "@/lib/i18n/he";
import { createClient } from "@/lib/supabase/server";

export async function requireUser() {
  const { isConfigured } = getPublicSupabaseConfig();
  if (!isConfigured) {
    redirect("/login");
  }

  const supabase = await createClient();
  const {
    data: { user },
    error,
  } = await supabase.auth.getUser();

  if (error || !user) {
    redirect("/login");
  }

  return { supabase, user };
}

export async function requireUserApi() {
  const { isConfigured } = getPublicSupabaseConfig();
  if (!isConfigured) {
    return {
      user: null,
      supabase: null,
      response: NextResponse.json(
        { message: he.errors.unauthorized },
        { status: 401 },
      ),
    };
  }

  const supabase = await createClient();
  const {
    data: { user },
    error,
  } = await supabase.auth.getUser();

  if (error || !user) {
    return {
      user: null,
      supabase,
      response: NextResponse.json(
        { message: he.errors.unauthorized },
        { status: 401 },
      ),
    };
  }

  return { user, supabase, response: null };
}
