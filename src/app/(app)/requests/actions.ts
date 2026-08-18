"use server";

import { requireUser } from "@/lib/auth/require-user";
import { he } from "@/lib/i18n/he";
import { buildMagicLinkUrl, createMagicLinkToken } from "@/lib/magic-link/token";

export async function getRequestMagicLink(requestId: string) {
  const { supabase, user } = await requireUser();
  const { data, error } = await supabase
    .from("requests")
    .select("id, token_version, token_expires_at")
    .eq("id", requestId)
    .eq("user_id", user.id)
    .maybeSingle();

  if (error || !data?.token_expires_at) {
    return { ok: false as const, message: he.errors.notFound };
  }

  try {
    const token = createMagicLinkToken({
      requestId: data.id,
      tokenVersion: data.token_version,
      expiresAt: data.token_expires_at,
    });
    return { ok: true as const, url: buildMagicLinkUrl(token) };
  } catch {
    return { ok: false as const, message: he.errors.missingMagicLink };
  }
}
