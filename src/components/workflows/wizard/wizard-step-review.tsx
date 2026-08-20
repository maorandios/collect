"use client";

import { formatIsraelDateTime } from "@/lib/dates";
import { formatReminderDelayHe } from "@/lib/schedule/labels";
import { he } from "@/lib/i18n/he";
import { getDraftRecipient, getDraftReminder } from "@/lib/workflow/draft-canonical";
import type { WorkflowDraftDefinition } from "@/lib/workflow/draft-schema";
import { isUnconfiguredField } from "@/lib/workflow/draft-fields";
import type { WorkflowStatus } from "@/lib/workflow/lifecycle";
import {
  definedText,
  eventModeLabel,
  scheduleSummary,
  shouldShowNextSendCard,
} from "@/lib/workflow/studio-display";

function fieldTypeLabel(type: WorkflowDraftDefinition["fields"][number]["type"]) {
  if (type === "unconfigured") {
    return he.wizard.inputUnconfigured;
  }
  return he.workflow.fieldTypes[type];
}

function reminderLine(draft: WorkflowDraftDefinition) {
  const reminder = getDraftReminder(draft);
  if (reminder.state === "unset") {
    return he.wizard.reminderUnset;
  }
  if (reminder.state === "disabled") {
    return he.workflow.reminderOff;
  }
  return formatReminderDelayHe(reminder.afterHours);
}

export function WizardStepReview({
  draft,
  status,
  nextRunAt,
  hasUnpublishedChanges,
}: {
  draft: WorkflowDraftDefinition;
  status: WorkflowStatus;
  nextRunAt: string | null;
  hasUnpublishedChanges: boolean;
}) {
  const recipient = getDraftRecipient(draft);
  const showNextSend = shouldShowNextSendCard(status, draft.schedule);

  return (
    <div className="space-y-6">
      <h2 className="text-lg font-medium">{he.wizard.reviewTitle}</h2>
      {hasUnpublishedChanges && (status === "active" || status === "paused") ? (
        <p className="rounded-xl border border-border bg-surface px-4 py-3 text-sm">{he.wizard.unpublishedChanges}</p>
      ) : null}

      <section className="space-y-2">
        <p className="text-xs text-muted-foreground">{he.wizard.collectHeading}</p>
        {draft.fields.length === 0 ? (
          <p className="text-sm">{he.studio.notSet}</p>
        ) : (
          <ul className="space-y-1 text-sm">
            {draft.fields.map((field) => (
              <li key={field.id}>
                {field.label}
                {isUnconfiguredField(field) ? ` — ${he.wizard.inputUnconfigured}` : ` — ${fieldTypeLabel(field.type)}`}
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="space-y-1 text-sm">
        <p className="text-xs text-muted-foreground">{he.wizard.recipientHeading}</p>
        <p>
          {he.wizard.organizationName}: {definedText(recipient.organizationName)}
        </p>
        <p>
          {he.wizard.contactName}:{" "}
          {recipient.contactResolution === "no_fixed_contact"
            ? he.studio.setup.noFixedContact
            : definedText(recipient.contactName)}
        </p>
        <p>
          {he.studio.recipientEmail}: {definedText(recipient.email)}
        </p>
      </section>

      <section className="space-y-1 text-sm">
        <p className="text-xs text-muted-foreground">{he.wizard.activationHeading}</p>
        <p>
          {he.studio.eventModeLabel}: {eventModeLabel(draft.schedule)}
        </p>
        <p>{scheduleSummary(draft.schedule)}</p>
        <p>
          {he.workflow.reminder}: {reminderLine(draft)}
        </p>
      </section>

      {showNextSend ? (
        <section className="rounded-xl border border-border bg-surface p-4 text-sm">
          <p className="text-xs text-muted-foreground">{he.studio.nextRun}</p>
          <p className="mt-1 font-medium">
            {status === "paused"
              ? he.studio.nextSendPaused
              : nextRunAt
                ? formatIsraelDateTime(nextRunAt)
                : he.studio.notSet}
          </p>
        </section>
      ) : null}
    </div>
  );
}
