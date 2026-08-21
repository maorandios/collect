import { NextResponse } from "next/server";

import { he } from "@/lib/i18n/he";
import {
  RECIPIENT_COOKIE_NAME,
  createRecipientCookieValue,
  recipientCookieOptions,
} from "@/lib/magic-link/session";
import { verifyMagicLinkToken } from "@/lib/magic-link/token";
import { markRequestOpened } from "@/lib/requests/mark-opened";
import { createAdminClient } from "@/lib/supabase/admin";

export async function GET(
  request: Request,
  { params }: { params: Promise<{ token: string }> },
) {
  const { token } = await params;
  const decodedToken = decodeURIComponent(token);
  const origin = new URL(request.url).origin;

  try {
    const payload = verifyMagicLinkToken(decodedToken);
    if (!payload) {
      return NextResponse.redirect(new URL("/r/invalid", origin));
    }

    const admin = createAdminClient();
    const { data } = await admin
      .from("requests")
      .select("id, token_version, token_expires_at, status")
      .eq("id", payload.requestId)
      .maybeSingle();

    if (!data || data.token_version !== payload.tokenVersion) {
      return NextResponse.redirect(new URL("/r/invalid", origin));
    }

    const payloadExpired = new Date(payload.expiresAt).getTime() <= Date.now();
    const recordExpired = new Date(data.token_expires_at).getTime() <= Date.now();
    if (payloadExpired || recordExpired) {
      return NextResponse.redirect(new URL("/r/expired", origin));
    }

    if (data.status !== "completed") {
      await markRequestOpened(data.id, admin);
    }

    const destination = data.status === "completed" ? "/r/success" : "/r";
    const response = NextResponse.redirect(new URL(destination, origin));
    response.cookies.set(
      RECIPIENT_COOKIE_NAME,
      createRecipientCookieValue({
        requestId: data.id,
        expiresAt: data.token_expires_at,
      }),
      recipientCookieOptions(data.token_expires_at),
    );
    return response;
  } catch {
    return NextResponse.redirect(new URL("/r/invalid", origin));
  }
}

export function POST() {
  return NextResponse.json({ message: he.errors.forbidden }, { status: 405 });
}
