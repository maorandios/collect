import { NextResponse } from "next/server";

import { requireUserApi } from "@/lib/auth/require-user";
import { he } from "@/lib/i18n/he";
import { getUserMailbox } from "@/lib/mailbox";
import { deleteGrant } from "@/lib/nylas/client";
import { createAdminClient } from "@/lib/supabase/admin";

export async function POST() {
  const auth = await requireUserApi();
  if (auth.response || !auth.user) {
    return (
      auth.response ??
      NextResponse.json({ message: he.errors.unauthorized }, { status: 401 })
    );
  }

  const mailbox = await getUserMailbox(auth.user.id);
  if (!mailbox) {
    return NextResponse.json({ ok: true, message: he.toast.gmailDisconnected });
  }

  if (mailbox.nylas_grant_id) {
    try {
      await deleteGrant(mailbox.nylas_grant_id);
    } catch {
      // Still disconnect locally so the user can reconnect.
    }
  }

  const admin = createAdminClient();
  const { error } = await admin
    .from("mailboxes")
    .update({
      status: "disconnected",
      nylas_grant_id: null,
      last_error: null,
    })
    .eq("id", mailbox.id)
    .eq("user_id", auth.user.id);

  if (error) {
    return NextResponse.json({ message: he.errors.saveFailed }, { status: 500 });
  }

  return NextResponse.json({ ok: true, message: he.toast.gmailDisconnected });
}
