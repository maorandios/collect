"use server";

import { redirect } from "next/navigation";

import { requireUser } from "@/lib/auth/require-user";
import { he } from "@/lib/i18n/he";

export async function signOut() {
  const { supabase } = await requireUser();
  await supabase.auth.signOut();
  redirect("/login");
}

export async function updateProfile(formData: FormData) {
  const { supabase, user } = await requireUser();
  const displayName = String(formData.get("displayName") ?? "").trim();
  const businessName = String(formData.get("businessName") ?? "").trim();

  const { error } = await supabase.from("profiles").upsert({
    id: user.id,
    display_name: displayName || null,
    business_name: businessName || null,
  });

  if (error) {
    return { ok: false as const, message: he.errors.saveFailed };
  }

  return { ok: true as const, message: he.settings.saved };
}
