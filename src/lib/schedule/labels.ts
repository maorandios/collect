import { he } from "@/lib/i18n/he";
import type { WorkflowDefinition, WorkflowSchedule } from "@/lib/workflow/schema";
import { WEEKDAY } from "@/lib/workflow/schema";

export const WEEKDAY_LABELS = [
  he.workflow.sunday,
  he.workflow.monday,
  he.workflow.tuesday,
  he.workflow.wednesday,
  he.workflow.thursday,
  he.workflow.friday,
  he.workflow.saturday,
] as const;

export function formatReminderDelayHe(afterHours: number): string {
  if (afterHours % 168 === 0) {
    const weeks = afterHours / 168;
    if (weeks === 1) {
      return "אחרי שבוע";
    }
    if (weeks === 2) {
      return "אחרי שבועיים";
    }
    return `אחרי ${weeks} שבועות`;
  }
  if (afterHours % 24 === 0) {
    const days = afterHours / 24;
    if (days === 1) {
      return "אחרי יום";
    }
    if (days === 2) {
      return "אחרי יומיים";
    }
    return `אחרי ${days} ימים`;
  }
  if (afterHours === 1) {
    return "אחרי שעה";
  }
  if (afterHours === 2) {
    return "אחרי שעתיים";
  }
  return `אחרי ${afterHours} שעות`;
}

export function weekdayLabel(weekday: number) {
  return WEEKDAY_LABELS[weekday] ?? String(weekday);
}

export { WEEKDAY };

export function scheduleTypeLabel(schedule: WorkflowSchedule) {
  if (schedule.type === "send_now") {
    return he.workflow.sendNow;
  }
  if (schedule.type === "once") {
    return he.workflow.once;
  }
  if (schedule.type === "weekly") {
    return he.workflow.weekly;
  }
  if (schedule.type === "manual") {
    return he.workflow.manual;
  }
  return he.workflow.monthly;
}

export function scheduleLabel(definition: WorkflowDefinition) {
  const schedule = definition.schedule;
  if (schedule.type === "send_now") {
    return he.workflow.sendNow;
  }
  if (schedule.type === "once") {
    return `${he.workflow.once} · ${schedule.date} ${schedule.time}`;
  }
  if (schedule.type === "weekly") {
    return `${he.workflow.weekly} · ${weekdayLabel(schedule.weekday)} · ${schedule.time}`;
  }
  if (schedule.type === "manual") {
    return he.workflow.manual;
  }
  return `${he.workflow.monthly} · ${schedule.day} · ${schedule.time}`;
}
