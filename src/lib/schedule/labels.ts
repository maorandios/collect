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
  return `${he.workflow.monthly} · ${schedule.day} · ${schedule.time}`;
}
