import Link from "next/link";
import { notFound } from "next/navigation";

import { requireUser } from "@/lib/auth/require-user";
import { CopyLinkButton } from "@/app/(app)/requests/copy-link-button";
import { formatIsraelDateTime } from "@/lib/dates";
import { he } from "@/lib/i18n/he";
import { relatedName } from "@/lib/supabase/relations";
import { parseWorkflowDefinition } from "@/lib/workflow/schema";

const statusLabels: Record<string, string> = {
  draft: he.statuses.draft,
  scheduled: he.statuses.scheduled,
  sent: he.statuses.sent,
  opened: he.statuses.opened,
  in_progress: he.statuses.in_progress,
  completed: he.statuses.completed,
  failed: he.statuses.failed,
  expired: he.statuses.expired,
};

export default async function RequestDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const { supabase, user } = await requireUser();
  const { data: requestRow } = await supabase
    .from("requests")
    .select(
      "id, recipient_name, recipient_email, status, scheduled_for, sent_at, opened_at, completed_at, definition_snapshot, workflows(name)",
    )
    .eq("id", id)
    .eq("user_id", user.id)
    .maybeSingle();

  if (!requestRow) {
    notFound();
  }

  const definition = parseWorkflowDefinition(requestRow.definition_snapshot);
  const { data: submission } = await supabase
    .from("submissions")
    .select("answers, is_draft, submitted_at")
    .eq("request_id", id)
    .maybeSingle();
  const { data: files } = await supabase
    .from("files")
    .select("id, field_id, original_name, mime_type, size_bytes")
    .eq("request_id", id)
    .order("created_at");
  const { data: events } = await supabase
    .from("request_events")
    .select("id, type, created_at")
    .eq("request_id", id)
    .order("created_at", { ascending: true });

  const answers = (submission?.answers ?? {}) as Record<string, unknown>;

  return (
    <div className="flex h-full min-h-full flex-col">
      <header className="flex items-center justify-between gap-4 border-b border-border bg-surface px-8 py-5">
        <div>
          <h1 className="text-xl font-medium">{he.requests.detailTitle}</h1>
          <p className="text-sm text-muted-foreground">
            {relatedName(requestRow.workflows)} · {requestRow.recipient_email}
          </p>
        </div>
        <CopyLinkButton requestId={requestRow.id} />
      </header>
      <section className="grid flex-1 grid-cols-1 gap-6 overflow-auto p-8 xl:grid-cols-2">
        <div className="space-y-6">
          <div className="rounded-xl border border-border bg-surface p-6 shadow-sm">
            <p className="text-sm text-muted-foreground">{he.requests.columns.status}</p>
            <p className="mt-1 text-lg font-medium">
              {statusLabels[requestRow.status] ?? requestRow.status}
            </p>
            <div className="mt-4 space-y-1 text-sm">
              <p>
                {he.requests.columns.scheduledFor}: {formatIsraelDateTime(requestRow.scheduled_for)}
              </p>
              <p>
                {he.requests.sentAt}: {formatIsraelDateTime(requestRow.sent_at)}
              </p>
              <p>
                {he.requests.openedAt}: {formatIsraelDateTime(requestRow.opened_at)}
              </p>
              <p>
                {he.requests.completedAt}: {formatIsraelDateTime(requestRow.completed_at)}
              </p>
            </div>
          </div>
          <div className="rounded-xl border border-border bg-surface p-6 shadow-sm">
            <h2 className="font-medium">{he.requests.answers}</h2>
            {definition.success ? (
              <div className="mt-4 space-y-3 text-sm">
                {definition.data.fields
                  .filter((field) => field.type !== "file")
                  .map((field) => (
                    <div key={field.id}>
                      <p className="text-muted-foreground">{field.label}</p>
                      <p>{String(answers[field.id] ?? "—")}</p>
                    </div>
                  ))}
              </div>
            ) : (
              <p className="mt-4 text-sm text-muted-foreground">{he.requests.noAnswers}</p>
            )}
          </div>
        </div>
        <div className="space-y-6">
          <div className="rounded-xl border border-border bg-surface p-6 shadow-sm">
            <h2 className="font-medium">{he.requests.files}</h2>
            {!files?.length ? (
              <p className="mt-4 text-sm text-muted-foreground">{he.requests.noFiles}</p>
            ) : (
              <ul className="mt-4 space-y-2 text-sm">
                {files.map((file) => (
                  <li key={file.id} className="flex items-center justify-between gap-3">
                    <span>{file.original_name}</span>
                    <Link href={`/api/requests/${requestRow.id}/files/${file.id}`} className="hover:underline">
                      {he.actions.download}
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </div>
          <div className="rounded-xl border border-border bg-surface p-6 shadow-sm">
            <h2 className="font-medium">{he.requests.events}</h2>
            {!events?.length ? (
              <p className="mt-4 text-sm text-muted-foreground">{he.requests.noEvents}</p>
            ) : (
              <ul className="mt-4 space-y-2 text-sm">
                {events.map((event) => (
                  <li key={event.id}>
                    {event.type} · {formatIsraelDateTime(event.created_at)}
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      </section>
    </div>
  );
}
