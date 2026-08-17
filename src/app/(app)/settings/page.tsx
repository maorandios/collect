import { requireUser } from "@/lib/auth/require-user";
import { he } from "@/lib/i18n/he";

import { SettingsForm } from "./settings-form";

export default async function SettingsPage() {
  const { supabase, user } = await requireUser();
  const { data: profile } = await supabase
    .from("profiles")
    .select("display_name, business_name")
    .eq("id", user.id)
    .maybeSingle();

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
        <div className="rounded-xl border border-border bg-surface p-6 shadow-sm">
          <h2 className="text-base font-medium">{he.settings.gmailTitle}</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            {he.settings.gmailDescription}
          </p>
          <div className="mt-6 flex items-center justify-between rounded-lg border border-border bg-background px-4 py-3">
            <div>
              <p className="text-sm text-foreground">{he.settings.noMailbox}</p>
              <p className="text-xs text-muted-foreground">
                {he.statuses.disconnected}
              </p>
            </div>
            <span className="rounded-full border border-border px-3 py-1 text-xs text-muted-foreground">
              {he.statuses.disconnected}
            </span>
          </div>
          <p className="mt-4 text-sm text-muted-foreground">
            {he.settings.gmailComingSoon}
          </p>
        </div>
      </section>
    </div>
  );
}
