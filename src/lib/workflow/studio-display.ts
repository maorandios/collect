import { formatReminderDelayHe, weekdayLabel } from "@/lib/schedule/labels";
import { fileFormatLabel } from "@/lib/workflow/file-formats";
import { he } from "@/lib/i18n/he";
import type { DraftSchedule, WorkflowDraftDefinition } from "@/lib/workflow/draft-schema";

export function monthlyEditorDayValue(schedule: Extract<DraftSchedule, { type: "monthly" }>) {
  if (schedule.monthlyDayMode === "end_of_month") {
    return "end_of_month";
  }
  return schedule.day != null ? String(schedule.day) : "";
}

export function shouldShowNextSendCard(
  status: "draft" | "active" | "paused" | "completed",
  schedule: DraftSchedule | undefined,
) {
  if (status === "draft" || status === "completed") {
    return false;
  }
  if (!schedule || schedule.type === "manual" || schedule.type === "send_now") {
    return false;
  }
  return status === "active" || status === "paused";
}

export function definedText(value: string | null | undefined) {
  const trimmed = value?.trim();
  return trimmed ? trimmed : he.studio.notSet;
}

export function mailboxSummary(mailboxEmail: string | null | undefined) {
  const trimmed = mailboxEmail?.trim();
  return trimmed ? trimmed : he.studio.gmailNotConnected;
}

export function eventModeLabel(schedule: DraftSchedule | undefined) {
  if (!schedule) {
    return he.studio.notSet;
  }
  if (schedule.type === "send_now") {
    return he.studio.eventMode.sendNow;
  }
  if (schedule.type === "manual") {
    return he.studio.eventMode.manual;
  }
  if (schedule.type === "once") {
    return he.studio.eventMode.once;
  }
  if (schedule.type === "weekly") {
    return he.studio.eventMode.weekly;
  }
  return he.studio.eventMode.monthly;
}

function timePart(time: string | null | undefined) {
  return time?.trim() ? time : he.studio.timeNotSet;
}

export function scheduleSummary(schedule: DraftSchedule | undefined) {
  if (!schedule) {
    return he.studio.notSet;
  }
  if (schedule.type === "send_now") {
    return he.studio.eventMode.sendNow;
  }
  if (schedule.type === "manual") {
    return he.studio.eventMode.manual;
  }
  if (schedule.type === "once") {
    const date = schedule.date?.trim() ? schedule.date : he.studio.dateNotSet;
    return `${date} · ${timePart(schedule.time)}`;
  }
  if (schedule.type === "weekly") {
    const day = schedule.weekday == null ? he.studio.weekdayNotSet : weekdayLabel(schedule.weekday);
    return `${he.studio.weeklyOn.replace("{day}", day)} · ${timePart(schedule.time)}`;
  }
  const dayLabel =
    schedule.monthlyDayMode === "end_of_month"
      ? he.studio.monthlyEndOfMonth
      : schedule.day != null
        ? he.studio.monthlyOn.replace("{day}", String(schedule.day))
        : he.studio.monthDayNotSet;
  return `${dayLabel} · ${timePart(schedule.time)}`;
}

export function nextRunSummary(schedule: DraftSchedule | undefined) {
  if (
    schedule &&
    (schedule.type === "monthly" || schedule.type === "weekly" || schedule.type === "once") &&
    !schedule.time
  ) {
    return he.studio.nextRunAfterTime;
  }
  if (
    schedule &&
    ((schedule.type === "weekly" && schedule.weekday != null && schedule.time) ||
      (schedule.type === "monthly" && schedule.day != null && schedule.time) ||
      (schedule.type === "once" && schedule.date && schedule.time))
  ) {
    return he.studio.nextRunAfterActivate;
  }
  return he.studio.notSet;
}

export function reminderSummary(draft: WorkflowDraftDefinition) {
  if (!draft.reminder.enabled) {
    return he.workflow.reminderOff;
  }
  if (!draft.reminder.afterHours) {
    return he.studio.notSet;
  }
  return `תזכורת ${formatReminderDelayHe(draft.reminder.afterHours)}`;
}

export function recipientSummary(draft: WorkflowDraftDefinition) {
  if (draft.recipientMode === "at_launch") {
    return he.studio.atLaunchRecipients;
  }
  const named = draft.recipients
    .map((recipient) => {
      const organization = recipient.organizationName?.trim();
      const name = recipient.name?.trim();
      const email = recipient.email?.trim();
      const contact =
        organization && name && name !== organization
          ? `${organization} · ${name}`
          : organization || name;
      if (contact && email) {
        return `${contact} · ${email}`;
      }
      return contact || email;
    })
    .filter((value): value is string => Boolean(value));
  if (named.length === 0) {
    return he.studio.notSet;
  }
  return named.join(" · ");
}

export function fieldCountLabel(count: number) {
  if (count === 0) {
    return he.studio.notSet;
  }
  return he.studio.fieldCount.replace("{count}", String(count));
}

export function mimeTypeLabel(mimeType: string) {
  if (mimeType === "application/pdf") {
    return "PDF";
  }
  if (mimeType === "image/jpeg") {
    return "JPEG";
  }
  if (mimeType === "image/png") {
    return "PNG";
  }
  if (mimeType === "image/webp") {
    return "WebP";
  }
  return mimeType;
}

export function fileLimitsSimpleLabel(field: { allowedMimeTypes?: string[]; maxFileSizeMb: number }) {
  return he.studio.fileLimitsSimple
    .replace("{types}", he.studio.setup.formatAll)
    .replace("{maxMb}", String(field.maxFileSizeMb ?? 10));
}

export function fileLimitsLabel(field: {
  allowedMimeTypes: string[];
  maxFiles: number;
  maxFileSizeMb: number;
}) {
  const types = fileFormatLabel(field.allowedMimeTypes ?? []);
  const template = (field.maxFiles ?? 1) === 1 ? he.studio.fileLimitsOne : he.studio.fileLimits;
  return template
    .replace("{types}", types)
    .replace("{maxFiles}", String(field.maxFiles ?? 1))
    .replace("{maxMb}", String(field.maxFileSizeMb ?? 10));
}
