import { createAdminClient } from "@/lib/supabase/admin";

export type MailboxRow = {
  id: string;
  email: string | null;
  status: "connected" | "disconnected" | "needs_reauth";
  nylas_grant_id: string | null;
  provider: string;
};

export async function getUserMailbox(userId: string) {
  const admin = createAdminClient();
  const { data } = await admin
    .from("mailboxes")
    .select("id, email, status, nylas_grant_id, provider")
    .eq("user_id", userId)
    .order("updated_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  return (data as MailboxRow | null) ?? null;
}

export async function getConnectedMailboxForUser(userId: string) {
  const mailbox = await getUserMailbox(userId);
  if (
    !mailbox ||
    mailbox.status !== "connected" ||
    !mailbox.nylas_grant_id ||
    !mailbox.email
  ) {
    return null;
  }
  return mailbox;
}

export async function getOwnedMailbox(userId: string, mailboxId: string) {
  const admin = createAdminClient();
  const { data } = await admin
    .from("mailboxes")
    .select("id, email, status, nylas_grant_id, provider")
    .eq("id", mailboxId)
    .eq("user_id", userId)
    .maybeSingle();
  return (data as MailboxRow | null) ?? null;
}
