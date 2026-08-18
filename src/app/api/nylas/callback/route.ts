import { NextResponse } from "next/server";

import { getAppUrl } from "@/lib/env";
import { exchangeOAuthCode, getGrant, isNylasError } from "@/lib/nylas/client";
import { hashOAuthState } from "@/lib/nylas/oauth-state";
import { createAdminClient } from "@/lib/supabase/admin";

function redirectToSettings(status: "connected" | "error", code?: string) {
  const appUrl = getAppUrl() ?? "http://localhost:3000";
  const url = new URL("/settings", appUrl);
  url.searchParams.set("gmail", status);
  if (code) {
    url.searchParams.set("reason", code);
  }
  return NextResponse.redirect(url);
}

export async function GET(request: Request) {
  const incoming = new URL(request.url);
  const code = incoming.searchParams.get("code");
  const state = incoming.searchParams.get("state");

  if (incoming.searchParams.get("user_id")) {
    return redirectToSettings("error", "invalid");
  }

  if (!code || !state) {
    return redirectToSettings("error", "invalid");
  }

  const admin = createAdminClient();
  const hash = hashOAuthState(state);
  const consumedAt = new Date().toISOString();
  const { data: stateRow } = await admin
    .from("nylas_oauth_states")
    .update({ consumed_at: consumedAt })
    .eq("state", hash)
    .is("consumed_at", null)
    .gt("expires_at", consumedAt)
    .select("id, user_id")
    .maybeSingle();

  if (!stateRow) {
    return redirectToSettings("error", "used");
  }

  try {
    const exchanged = await exchangeOAuthCode(code);
    if (!exchanged.grantId) {
      return redirectToSettings("error", "exchange");
    }

    let email = exchanged.email;
    let provider = exchanged.provider || "google";
    if (!email) {
      const grant = await getGrant(exchanged.grantId);
      email = grant.email;
      provider = grant.provider || provider;
    }

    if (!email) {
      return redirectToSettings("error", "exchange");
    }

    const { data: existing } = await admin
      .from("mailboxes")
      .select("id, nylas_grant_id")
      .eq("user_id", stateRow.user_id)
      .order("updated_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    const mailboxPayload = {
      user_id: stateRow.user_id,
      provider,
      email,
      nylas_grant_id: exchanged.grantId,
      status: "connected",
      last_error: null,
      connected_at: new Date().toISOString(),
    };

    if (existing?.id) {
      const { error } = await admin
        .from("mailboxes")
        .update(mailboxPayload)
        .eq("id", existing.id)
        .eq("user_id", stateRow.user_id);
      if (error) {
        return redirectToSettings("error", "exchange");
      }
    } else {
      const { error } = await admin.from("mailboxes").insert(mailboxPayload);
      if (error) {
        return redirectToSettings("error", "exchange");
      }
    }

    const { data: userRequests } = await admin
      .from("requests")
      .select("id")
      .eq("user_id", stateRow.user_id);
    const requestIds = new Set((userRequests ?? []).map((row) => row.id));
    if (requestIds.size > 0) {
      const { data: waitingJobs } = await admin
        .from("jobs")
        .select("id, payload")
        .eq("type", "send_email")
        .eq("status", "pending")
        .eq("last_error", "needs_reauth");
      const jobIds = (waitingJobs ?? [])
        .filter((job) => {
          const payload = job.payload as { requestId?: string } | null;
          return payload?.requestId && requestIds.has(payload.requestId);
        })
        .map((job) => job.id);
      if (jobIds.length > 0) {
        await admin
          .from("jobs")
          .update({ run_at: new Date().toISOString(), last_error: null })
          .in("id", jobIds);
      }
    }

    return redirectToSettings("connected");
  } catch (error) {
    if (isNylasError(error)) {
      return redirectToSettings("error", "exchange");
    }
    return redirectToSettings("error", "exchange");
  }
}
