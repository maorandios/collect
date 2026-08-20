import { he } from "@/lib/i18n/he";
import { isOnceInThePast } from "@/lib/schedule/next-run";
import { unconfiguredFieldsMessage } from "@/lib/workflow/draft-fields";
import type { DraftSchedule, WorkflowDraftDefinition } from "@/lib/workflow/draft-schema";
import { TIMEZONE, type WorkflowDefinition, type WorkflowSchedule } from "@/lib/workflow/schema";

type PublishableDefinition = WorkflowDefinition | WorkflowDraftDefinition;

function scheduleTime(schedule: DraftSchedule | WorkflowSchedule | undefined) {
  if (!schedule || !("time" in schedule)) {
    return null;
  }
  return schedule.time ?? null;
}

export function getSchedulePublishIssues(schedule: DraftSchedule | WorkflowSchedule | undefined) {
  if (!schedule) {
    return [he.workflows.missingEventMode];
  }
  if (schedule.type === "send_now" || schedule.type === "manual") {
    return [];
  }
  const issues: string[] = [];
  if (schedule.type === "once") {
    if (!schedule.date) {
      issues.push(he.workflows.missingScheduleDate);
    }
    if (!scheduleTime(schedule)) {
      issues.push(he.workflows.missingScheduleTime);
    }
    return issues;
  }
  if (schedule.type === "weekly") {
    if (schedule.weekday == null) {
      issues.push(he.workflows.missingScheduleWeekday);
    }
    if (!scheduleTime(schedule)) {
      issues.push(he.workflows.missingScheduleTime);
    }
    return issues;
  }
  if (schedule.day == null) {
    issues.push(he.workflows.missingScheduleDay);
  }
  if (!scheduleTime(schedule)) {
    issues.push(he.workflows.missingScheduleTime);
  }
  return issues;
}

function asOnceSchedule(schedule: Extract<DraftSchedule | WorkflowSchedule, { type: "once" }>): WorkflowSchedule | null {
  if (!schedule.date || !scheduleTime(schedule)) {
    return null;
  }
  return {
    type: "once",
    date: schedule.date,
    time: schedule.time as string,
    timezone: schedule.timezone ?? TIMEZONE,
  };
}

export function getPublishIssues(
  definition: PublishableDefinition,
  options: { now?: Date; allowDevMinutes?: boolean } = {},
) {
  const issues: string[] = [];
  const fieldIds = new Set<string>();
  const recipientMode = definition.recipientMode ?? "fixed";
  const schedule = definition.schedule;

  if (!definition.name.trim()) {
    issues.push(he.workflows.missingName);
  }
  if (!definition.email.subject.trim() || !definition.email.body.trim()) {
    issues.push(he.workflows.missingEmail);
  }

  issues.push(...getSchedulePublishIssues(schedule));

  if (recipientMode === "at_launch") {
    if (schedule && schedule.type !== "manual") {
      issues.push(he.workflows.atLaunchNeedsManual);
    }
  } else if (definition.recipients.every((item) => !item.email?.trim())) {
    issues.push(he.workflows.missingRecipients);
  }

  if (definition.fields.length === 0) {
    issues.push(he.workflows.missingFields);
  }

  const unconfiguredMessage = unconfiguredFieldsMessage(definition.fields);
  if (unconfiguredMessage) {
    issues.push(unconfiguredMessage);
  }

  for (const field of definition.fields) {
    if (fieldIds.has(field.id)) {
      issues.push(he.workflows.duplicateFieldId);
    }
    fieldIds.add(field.id);
  }

  const hasHours = Boolean(definition.reminder.afterHours);
  const hasDevMinutes = Boolean(options.allowDevMinutes && definition.reminder.afterMinutes);
  if (definition.reminder.enabled && !hasHours && !hasDevMinutes) {
    issues.push(he.workflows.missingReminderHours);
  }

  if (schedule?.type === "once") {
    const once = asOnceSchedule(schedule);
    if (once && isOnceInThePast(once, options.now)) {
      issues.push(he.workflows.onceInPast);
    }
  }

  return issues;
}

export function canPublish(
  definition: PublishableDefinition,
  options: { now?: Date; allowDevMinutes?: boolean } = {},
) {
  return getPublishIssues(definition, options).length === 0;
}
