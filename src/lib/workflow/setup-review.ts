import { formatReminderDelayHe } from "@/lib/schedule/labels";
import { unescapeEmailAddress } from "@/lib/email/escape";
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

export function reviewFieldLines(draft: WorkflowDraftDefinition) {
  return draft.fields.map((field) => field.label);
}

export function reviewScheduleLine(draft: WorkflowDraftDefinition) {
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
    const time = schedule.time ? ` · ${schedule.time}` : "";
    return `${he.workflow.weekly} · ${he.studio.weeklyOn.replace("{day}", day)}${time}`;
  }
  if (schedule.type === "monthly") {
    const endOfMonth = schedule.monthlyDayMode === "end_of_month";
    const day = endOfMonth
      ? he.studio.monthlyEndOfMonth
      : schedule.day == null
        ? he.studio.monthDayNotSet
        : he.studio.monthlyOn.replace("{day}", String(schedule.day));
    const time = schedule.time ? ` · ${schedule.time}` : "";
    return `${he.workflow.monthly} · ${day}${time}`;
  }
  return `${he.workflow.once}${schedule.date ? ` ${schedule.date}` : ""}${schedule.time ? ` ${schedule.time}` : ""}`;
}

export function reviewContactLine(setup: WorkflowSetupState) {
  const identity = setup.recipientIdentity;
  if (identity.contactResolution === "no_fixed_contact") {
    return he.studio.setup.noFixedContact;
  }
  if (identity.contactResolution === "named" && identity.contactName?.trim()) {
    return identity.contactName.trim();
  }
  return he.studio.notSet;
}

export function reviewReminderLine(setup: WorkflowSetupState) {
  if (setup.reminderDecision === "declined" || !setup.proposal.reminder.enabled) {
    return he.workflow.reminderOff;
  }
  const hours = setup.proposal.reminder.afterHours;
  if (!hours) {
    return he.workflow.reminderOff;
  }
  return formatReminderDelayHe(hours);
}

export function buildSetupReviewModel(setup: WorkflowSetupState) {
  const recipient = setup.proposal.recipients[0];
  return {
    fields: reviewFieldLines(setup.proposal),
    organizationName: setup.recipientIdentity.organizationName?.trim() || recipient?.organizationName?.trim() || null,
    contactName: reviewContactLine(setup),
    email: unescapeEmailAddress(setup.recipientIdentity.email?.trim() || recipient?.email?.trim() || ""),
    schedule: reviewScheduleLine(setup.proposal),
    reminder: reviewReminderLine(setup),
    includesEmailContent: false as const,
  };
}
