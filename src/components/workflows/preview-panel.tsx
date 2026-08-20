import { formatReminderDelayHe } from "@/lib/schedule/labels";
import { he } from "@/lib/i18n/he";
import { computeUpcomingRuns, formatIsraelDateTime } from "@/lib/dates";
import { scheduleLabel } from "@/lib/schedule/labels";
import { getPublishIssues } from "@/lib/workflow/publish";
import type { WorkflowDefinition } from "@/lib/workflow/schema";

export function PreviewPanel({
  definition,
  issues,
  mailboxEmail,
}: {
  definition: WorkflowDefinition | null;
  issues: string[];
  mailboxEmail?: string | null;
}) {
  if (!definition) {
    return (
      <div className="flex h-full items-center justify-center rounded-xl border border-border bg-surface p-8 text-sm text-muted-foreground">
        {he.workflows.jsonHelp}
      </div>
    );
  }

  const missing = [...issues, ...getPublishIssues(definition)];
  const upcoming = computeUpcomingRuns(definition.schedule);

  return (
    <div className="h-full space-y-6 overflow-auto rounded-xl border border-border bg-surface p-6 shadow-sm">
      <div>
        <p className="text-xs text-muted-foreground">{he.workflows.previewTitle}</p>
        <h2 className="mt-1 text-lg font-medium">{definition.name}</h2>
      </div>
      <section className="space-y-1 text-sm">
        <p className="text-muted-foreground">{he.workflow.mailbox}</p>
        <p>{mailboxEmail ?? he.workflow.noMailbox}</p>
      </section>
      <section className="space-y-1 text-sm">
        <p className="text-muted-foreground">{he.workflow.recipients}</p>
        {definition.recipients.length > 0
          ? definition.recipients.map((recipient) => (
              <p key={recipient.email}>
                {recipient.name ? `${recipient.name} · ` : ""}
                {recipient.email}
              </p>
            ))
          : definition.recipientMode === "at_launch"
            ? <p>{he.workflow.atLaunch}</p>
            : null}
      </section>
      <section className="space-y-1 text-sm">
        <p className="text-muted-foreground">{he.workflow.schedule}</p>
        <p>{scheduleLabel(definition)}</p>
      </section>
      <section className="space-y-1 text-sm">
        <p className="text-muted-foreground">{he.workflow.emailSubject}</p>
        <p>{definition.email.subject}</p>
        <p className="whitespace-pre-wrap text-muted-foreground">{definition.email.body}</p>
      </section>
      <section className="space-y-2 text-sm">
        <p className="text-muted-foreground">{he.workflow.fields}</p>
        <ul className="space-y-2">
          {definition.fields.map((field) => (
            <li key={field.id} className="rounded-lg border border-border px-3 py-2">
              <p className="font-medium">{field.label}</p>
              <p className="text-xs text-muted-foreground">
                {he.workflow.fieldTypes[field.type]}
                {field.required ? ` · ${he.validation.required}` : ""}
                {field.type === "file"
                  ? ` · ${field.maxFiles} · ${field.maxFileSizeMb}MB`
                  : ""}
              </p>
            </li>
          ))}
        </ul>
      </section>
      <section className="space-y-1 text-sm">
        <p className="text-muted-foreground">{he.workflow.reminder}</p>
        <p>
          {definition.reminder.enabled && definition.reminder.afterHours
            ? `תזכורת ${formatReminderDelayHe(definition.reminder.afterHours)}`
            : he.workflow.reminderOff}
        </p>
      </section>
      {upcoming.length > 0 ? (
        <section className="space-y-1 text-sm">
          <p className="text-muted-foreground">{he.workflow.upcoming}</p>
          {upcoming.map((run) => (
            <p key={run.toISOString()}>{formatIsraelDateTime(run)}</p>
          ))}
        </section>
      ) : null}
      {missing.length > 0 ? (
        <section className="space-y-1 text-sm">
          <p className="text-muted-foreground">{he.workflow.missing}</p>
          {missing.map((item) => (
            <p key={item} className="text-destructive">
              {item}
            </p>
          ))}
        </section>
      ) : null}
    </div>
  );
}
