import { NextResponse } from "next/server";

import { he } from "@/lib/i18n/he";
import { getRecipientRequest } from "@/lib/requests/recipient";
import { createAdminClient } from "@/lib/supabase/admin";

export async function POST(request: Request) {
  const requestRow = await getRecipientRequest();
  if (!requestRow) {
    return NextResponse.json({ message: he.recipient.missingSession }, { status: 401 });
  }
  if (requestRow.status === "completed") {
    return NextResponse.json({ message: he.recipient.completedAlready }, { status: 409 });
  }

  const body = (await request.json()) as { answers?: Record<string, unknown> };
  const admin = createAdminClient();
  const { data: existing } = await admin
    .from("submissions")
    .select("id")
    .eq("request_id", requestRow.id)
    .maybeSingle();

  if (existing) {
    const { error } = await admin
      .from("submissions")
      .update({
        answers: body.answers ?? {},
        is_draft: true,
      })
      .eq("id", existing.id);
    if (error) {
      return NextResponse.json({ message: he.errors.saveFailed }, { status: 500 });
    }
  } else {
    const { error } = await admin.from("submissions").insert({
      request_id: requestRow.id,
      answers: body.answers ?? {},
      is_draft: true,
    });
    if (error) {
      return NextResponse.json({ message: he.errors.saveFailed }, { status: 500 });
    }
  }

  return NextResponse.json({ ok: true, message: he.toast.saved });
}
