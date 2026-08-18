import { requireUser } from "@/lib/auth/require-user";
import { he } from "@/lib/i18n/he";
import { GmailCard } from "@/components/settings/gmail-card";

import { SettingsForm } from "./settings-form";

export default async function SettingsPage({
  searchParams,
}: {
  searchParams: Promise<{ gmail?: string; reason?: string }>;
}) {
  const { supabase, user } = await requireUser();
  const params = await searchParams;
  const { data: profile } = await supabase
    .from("profiles")
    .select("display_name, business_name")
    .eq("id", user.id)
    .maybeSingle();
  const { data: mailbox } = await supabase
    .from("mailboxes")
    .select("email, status")
    .eq("user_id", user.id)
    .order("updated_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  const status =
    mailbox?.status === "connected" || mailbox?.status === "needs_reauth"
      ? mailbox.status
      : "disconnected";

  return (
    <div className="flex h-full min-h-full flex-col">
      <header className="border-b border-border bg-surface px-8 py-5">
        <h1 className="text-xl font-medium">{he.settings.title}</h1>
      </header>
      <section className="grid flex-1 grid-cols-1 gap-6 p-8 xl:grid-cols-2">
        <SettingsForm
          email={user.email ?? ""}
          displayName={profile?.display_name ?? ""}
          businessName={profile?.business_name ?? ""}
        />
        <GmailCard
          email={mailbox?.email ?? null}
          status={status}
          notice={params.gmail === "connected" || params.gmail === "error" ? params.gmail : undefined}
          reason={params.reason}
        />
      </section>
    </div>
  );
}
