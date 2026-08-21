import "server-only";

import { createAdminClient } from "@/lib/supabase/admin";

type AdminClient = ReturnType<typeof createAdminClient>;

function adminClient(admin?: AdminClient) {
  return admin ?? createAdminClient();
}

export async function markRequestOpened(requestId: string, admin?: AdminClient) {
  const client = adminClient(admin);
  const { data } = await client
    .from("requests")
    .select("opened_at, status")
    .eq("id", requestId)
    .maybeSingle();

  if (!data || data.status === "completed" || data.opened_at) {
    return;
  }

  const nextStatus = data.status === "sent" || data.status === "scheduled" ? "opened" : data.status;

  await client
    .from("requests")
    .update({
      opened_at: new Date().toISOString(),
      status: nextStatus,
    })
    .eq("id", requestId);

  await client.from("request_events").insert({
    request_id: requestId,
    type: "form_opened",
    payload: {},
  });
}

export async function markFillingStarted(requestId: string, admin?: AdminClient) {
  const client = adminClient(admin);
  const { data: existing } = await client
    .from("request_events")
    .select("id")
    .eq("request_id", requestId)
    .eq("type", "filling_started")
    .maybeSingle();

  if (existing) {
    return;
  }

  await client.from("request_events").insert({
    request_id: requestId,
    type: "filling_started",
    payload: {},
  });

  await client
    .from("requests")
    .update({ status: "in_progress" })
    .eq("id", requestId)
    .in("status", ["sent", "scheduled", "opened"]);
}
