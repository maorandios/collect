import { computeNextRunAt } from "@/lib/schedule/next-run";
import type { WorkflowDefinition, WorkflowSchedule } from "@/lib/workflow/schema";

export type WorkflowStatus = "draft" | "active" | "paused" | "completed";
export type WorkflowPublishAction = "activate" | "publishChanges" | "none";

export function publishActionForStatus(status: WorkflowStatus | null | undefined): WorkflowPublishAction {
  if (!status || status === "draft") {
    return "activate";
  }
  if (status === "active" || status === "paused") {
    return "publishChanges";
  }
  return "none";
}

export function nextRunAtAfterPublishedScheduleChange({
  previousSchedule,
  nextSchedule,
  currentNextRunAt,
  now = new Date(),
}: {
  previousSchedule: unknown;
  nextSchedule: WorkflowSchedule;
  currentNextRunAt: string | null;
  now?: Date;
}) {
  const scheduleUnchanged = JSON.stringify(previousSchedule) === JSON.stringify(nextSchedule);

  if (nextSchedule.type === "send_now" || nextSchedule.type === "manual") {
    if (scheduleUnchanged) {
      return currentNextRunAt ? new Date(currentNextRunAt) : null;
    }
    return null;
  }

  if (scheduleUnchanged) {
    return currentNextRunAt ? new Date(currentNextRunAt) : computeNextRunAt(nextSchedule, now);
  }

  return computeNextRunAt(nextSchedule, now);
}

export function activationPlan(definition: WorkflowDefinition, now = new Date()) {
  if (definition.schedule.type === "send_now") {
    return {
      status: "active" as const,
      nextRunAt: null as Date | null,
      dispatchNow: true,
      completeAfterDispatch: true,
      missingNextRun: false,
    };
  }

  if (definition.schedule.type === "manual") {
    return {
      status: "active" as const,
      nextRunAt: null,
      dispatchNow: false,
      completeAfterDispatch: false,
      missingNextRun: false,
    };
  }

  const nextRunAt = computeNextRunAt(definition.schedule, now);
  return {
    status: "active" as const,
    nextRunAt,
    dispatchNow: false,
    completeAfterDispatch: false,
    missingNextRun: !nextRunAt,
  };
}

export function publishChangesPlan({
  status,
  previousSchedule,
  nextSchedule,
  currentNextRunAt,
  now = new Date(),
}: {
  status: WorkflowStatus;
  previousSchedule: unknown;
  nextSchedule: WorkflowSchedule;
  currentNextRunAt: string | null;
  now?: Date;
}) {
  return {
    status,
    dispatchNow: false,
    resume: false,
    nextRunAt: nextRunAtAfterPublishedScheduleChange({
      previousSchedule,
      nextSchedule,
      currentNextRunAt,
      now,
    }),
  };
}
