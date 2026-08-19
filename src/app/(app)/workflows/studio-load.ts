"use server";

import { requireUser } from "@/lib/auth/require-user";
import { getAppUrl } from "@/lib/env";
import { he } from "@/lib/i18n/he";
import { emptyStudioState, studioStateFromRow, type StudioInitialState, type StudioMessage } from "@/lib/workflow/studio-state";
import type { WorkflowStatus } from "@/lib/workflow/lifecycle";

type Loader = Awaited<ReturnType<typeof requireUser>>["supabase"];

async function mailboxFor(supabase: Loader, userId: string) {
  const { data } = await supabase
    .from("mailboxes")
    .select("email, status, nylas_grant_id")
    .eq("user_id", userId)
    .order("updated_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  const connected = data?.status === "connected" && Boolean(data.email) && Boolean(data.nylas_grant_id);
  return {
    mailboxEmail: connected ? data.email : null,
    hasMailbox: connected,
    mailboxStatus: connected
      ? ("connected" as const)
      : data?.status === "needs_reauth"
        ? ("needs_reauth" as const)
        : ("disconnected" as const),
  };
}

export async function loadStudioState(workflowId: string): Promise<StudioInitialState | null> {
  const { supabase, user } = await requireUser();
  const mailbox = await mailboxFor(supabase, user.id);
  let workflowQuery = await supabase
    .from("workflows")
    .select("id, status, definition, draft_definition, draft_revision, setup_revision, next_run_at, setup_state")
    .eq("id", workflowId)
    .eq("user_id", user.id)
    .is("deleted_at", null)
    .maybeSingle();
  if (workflowQuery.error && /setup_revision/.test(String(workflowQuery.error.message))) {
    workflowQuery = await supabase
      .from("workflows")
      .select("id, status, definition, draft_definition, draft_revision, next_run_at, setup_state")
      .eq("id", workflowId)
      .eq("user_id", user.id)
      .is("deleted_at", null)
      .maybeSingle();
  }
  if (workflowQuery.error && /setup_state/.test(String(workflowQuery.error.message))) {
    workflowQuery = await supabase
      .from("workflows")
      .select("id, status, definition, draft_definition, draft_revision, next_run_at")
      .eq("id", workflowId)
      .eq("user_id", user.id)
      .is("deleted_at", null)
      .maybeSingle();
  }
  const [messagesResult, profileResult] = await Promise.all([
    supabase
      .from("workflow_messages")
      .select("id, role, content, client_turn_id, created_at")
      .eq("workflow_id", workflowId)
      .order("created_at", { ascending: false })
      .limit(50),
    supabase.from("profiles").select("business_name, display_name").eq("id", user.id).maybeSingle(),
  ]);
  const data = workflowQuery.data;

  if (!data) {
    return null;
  }

  const messages = ((messagesResult.data ?? []) as {
    id: string;
    role: StudioMessage["role"];
    content: string;
    client_turn_id: string | null;
  }[])
    .slice()
    .reverse()
    .map((row) => ({
      id: row.id,
      role: row.role,
      content: row.content,
      clientTurnId: row.client_turn_id,
    }));

  return studioStateFromRow({
    workflowId: data.id,
    status: data.status as WorkflowStatus,
    draftDefinition: data.draft_definition,
    definition: data.definition,
    revision: Number(data.draft_revision ?? 0),
    nextRunAt: data.next_run_at,
    messages,
    mailboxEmail: mailbox.mailboxEmail,
    hasMailbox: mailbox.hasMailbox,
    mailboxStatus: mailbox.mailboxStatus,
    businessName: profileResult.data?.business_name || profileResult.data?.display_name || he.productName,
    appOrigin: getAppUrl() ?? (typeof process.env.NEXT_PUBLIC_APP_URL === "string" ? process.env.NEXT_PUBLIC_APP_URL : "https://APP_HOST"),
    setupState: "setup_state" in data ? data.setup_state : null,
    setupRevision: Number("setup_revision" in data ? (data as { setup_revision?: number }).setup_revision ?? 0 : 0),
  });
}

export async function loadEmptyStudioState(): Promise<StudioInitialState> {
  const { supabase, user } = await requireUser();
  const mailbox = await mailboxFor(supabase, user.id);
  const { data: profile } = await supabase
    .from("profiles")
    .select("business_name, display_name")
    .eq("id", user.id)
    .maybeSingle();
  return emptyStudioState(mailbox.mailboxEmail, mailbox.hasMailbox, mailbox.mailboxStatus, {
    businessName: profile?.business_name || profile?.display_name || he.productName,
    appOrigin: getAppUrl() ?? "https://APP_HOST",
  });
}
