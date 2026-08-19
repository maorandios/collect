import { Button } from "@/components/ui/button";
import { he } from "@/lib/i18n/he";
import type { WorkflowDraftDefinition } from "@/lib/workflow/draft-schema";
import type { WorkflowSetupState } from "@/lib/workflow/setup-state";

const WEEKDAY_SHORT = [
  he.studio.setup.weekdaySunday,
  he.studio.setup.weekdayMonday,
  he.studio.setup.weekdayTuesday,
  he.studio.setup.weekdayWednesday,
  he.studio.setup.weekdayThursday,
  he.studio.setup.weekdayFriday,
  he.studio.setup.weekdaySaturday,
];

function fieldLine(draft: WorkflowDraftDefinition) {
  return draft.fields.map((field) => {
    const kind =
      field.type === "file"
        ? he.studio.setup.fieldTypeFile
        : field.type === "confirmation"
          ? he.studio.setup.fieldTypeConfirmation
          : he.studio.setup.fieldTypeText;
    return `${field.label} — ${kind}`;
  });
}

function scheduleLine(draft: WorkflowDraftDefinition) {
  const schedule = draft.schedule;
  if (!schedule) {
    return he.studio.notSet;
  }
  if (schedule.type === "manual") {
    return he.workflow.manual;
  }
  if (schedule.type === "send_now") {
    return he.workflow.sendNow;
  }
  if (schedule.type === "weekly") {
    const day = schedule.weekday == null ? he.studio.weekdayNotSet : (WEEKDAY_SHORT[schedule.weekday] ?? String(schedule.weekday));
    return `${he.workflow.weekly}. ${he.studio.weeklyOn.replace("{day}", day)}${schedule.time ? ` ${he.studio.setup.atTime.replace("{time}", schedule.time)}` : ""}`;
  }
  if (schedule.type === "monthly") {
    const day = schedule.day == null ? he.studio.monthDayNotSet : String(schedule.day);
    return `${he.workflow.monthly}. ${he.studio.monthlyOn.replace("{day}", day)}${schedule.time ? ` ${he.studio.setup.atTime.replace("{time}", schedule.time)}` : ""}`;
  }
  return `${he.workflow.once}${schedule.date ? ` ${schedule.date}` : ""}${schedule.time ? ` ${schedule.time}` : ""}`;
}

function reminderLine(setup: WorkflowSetupState) {
  if (setup.reminderDecision === "declined" || !setup.proposal.reminder.enabled) {
    return he.workflow.reminderOff;
  }
  const hours = setup.proposal.reminder.afterHours;
  if (hours === 24) {
    return he.studio.reminderAfterDay;
  }
  if (hours === 48) {
    return he.studio.reminderAfterTwoDays;
  }
  if (hours === 168) {
    return he.studio.reminderAfterWeek;
  }
  return he.workflow.reminderOn.replace("{hours}", String(hours ?? ""));
}

export function StudioReviewCard({
  setup,
  hasExistingDraft,
  pending,
  onBuild,
  onChange,
}: {
  setup: WorkflowSetupState;
  hasExistingDraft: boolean;
  pending: boolean;
  onBuild: () => void;
  onChange: () => void;
}) {
  const draft = setup.proposal;
  const recipient = draft.recipients[0];
  return (
    <div className="space-y-4 rounded-xl border border-border bg-background p-4">
      <div>
        <p className="text-xs text-muted-foreground">{he.studio.setup.reviewCollect}</p>
        <ul className="mt-1 space-y-1 text-sm">
          {fieldLine(draft).map((line) => (
            <li key={line}>{line}</li>
          ))}
        </ul>
      </div>
      <div>
        <p className="text-xs text-muted-foreground">{he.studio.setup.reviewRecipient}</p>
        <p className="mt-1 text-sm">{recipient?.name?.trim() || he.studio.notSet}</p>
        <p className="text-sm" dir="ltr">
          {recipient?.email?.trim() || he.studio.notSet}
        </p>
      </div>
      <div>
        <p className="text-xs text-muted-foreground">{he.studio.setup.reviewTrigger}</p>
        <p className="mt-1 text-sm">{scheduleLine(draft)}</p>
      </div>
      <div>
        <p className="text-xs text-muted-foreground">{he.studio.setup.reviewReminder}</p>
        <p className="mt-1 text-sm">{reminderLine(setup)}</p>
      </div>
      <div>
        <p className="text-xs text-muted-foreground">{he.studio.setup.reviewEmail}</p>
        <p className="mt-1 text-sm font-medium">{draft.email.subject || he.studio.notSet}</p>
        <p className="mt-1 whitespace-pre-wrap text-sm text-muted-foreground">{draft.email.body}</p>
      </div>
      <div className="flex flex-wrap gap-2">
        <Button type="button" className="h-10" disabled={pending} onClick={onBuild}>
          {hasExistingDraft ? he.studio.setup.applyChanges : he.studio.setup.buildProcess}
        </Button>
        <Button type="button" variant="outline" className="h-10" disabled={pending} onClick={onChange}>
          {he.studio.setup.changeDetails}
        </Button>
      </div>
    </div>
  );
}
