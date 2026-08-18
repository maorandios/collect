import { NextResponse } from "next/server";

import { he } from "@/lib/i18n/he";
import { getRecipientRequest } from "@/lib/requests/recipient";
import { createAdminClient } from "@/lib/supabase/admin";

export async function POST() {
  const requestRow = await getRecipientRequest();
  if (!requestRow) {
    return NextResponse.json({ message: he.recipient.missingSession }, { status: 401 });
  }

  if (requestRow.status === "completed") {
    return NextResponse.json({ message: he.recipient.completedAlready }, { status: 409 });
  }

  const admin = createAdminClient();
  const { data } = await admin
    .from("requests")
    .select("opened_at, status")
    .eq("id", requestRow.id)
    .single();

  if (!data?.opened_at) {
    await admin
      .from("requests")
      .update({
        opened_at: new Date().toISOString(),
        status: "in_progress",
      })
      .eq("id", requestRow.id);

    await admin.from("request_events").insert({
      request_id: requestRow.id,
      type: "form_opened",
      payload: {},
    });
  }

  return NextResponse.json({ ok: true });
}
