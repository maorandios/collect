import { NextResponse } from "next/server";

import { requireUserApi } from "@/lib/auth/require-user";
import { he } from "@/lib/i18n/he";
import { getNylasConfig } from "@/lib/nylas/config";
import { buildGoogleOAuthUrl } from "@/lib/nylas/client";
import { createOAuthState } from "@/lib/nylas/oauth-state";
import { createAdminClient } from "@/lib/supabase/admin";

export async function POST() {
  const auth = await requireUserApi();
  if (auth.response || !auth.user) {
    return (
      auth.response ??
      NextResponse.json({ message: he.errors.unauthorized }, { status: 401 })
    );
  }

  const { isConfigured } = getNylasConfig();
  if (!isConfigured) {
    return NextResponse.json({ message: he.errors.nylasMissingConfig }, { status: 503 });
  }

  const { raw, hash } = createOAuthState();
  const admin = createAdminClient();
  const { error } = await admin.from("nylas_oauth_states").insert({
    user_id: auth.user.id,
    state: hash,
    expires_at: new Date(Date.now() + 10 * 60 * 1000).toISOString(),
  });

  if (error) {
    return NextResponse.json({ message: he.errors.gmailConnectFailed }, { status: 500 });
  }

  return NextResponse.json({ url: buildGoogleOAuthUrl(raw) });
}
