import { NextResponse } from "next/server";

import { he } from "@/lib/i18n/he";
import { markFillingStarted, markRequestOpened } from "@/lib/requests/mark-opened";
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

  const body = (await request.json().catch(() => null)) as { filling?: unknown } | null;
  const admin = createAdminClient();
  await markRequestOpened(requestRow.id, admin);
  if (body?.filling === true) {
    await markFillingStarted(requestRow.id, admin);
  }

  return NextResponse.json({ ok: true });
}
