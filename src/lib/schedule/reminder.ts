import type { WorkflowDefinition } from "@/lib/workflow/schema";

export function reminderDelayMs(
  reminder: WorkflowDefinition["reminder"],
  options: { allowMinutes?: boolean } = {},
) {
  if (!reminder.enabled) {
    return null;
  }

  if (options.allowMinutes && reminder.afterMinutes) {
    return reminder.afterMinutes * 60 * 1000;
  }

  if (reminder.afterHours) {
    return reminder.afterHours * 60 * 60 * 1000;
  }

  return null;
}
