import { he } from "@/lib/i18n/he";
import { isOnceInThePast } from "@/lib/schedule/next-run";
import type { WorkflowDefinition } from "@/lib/workflow/schema";

export function getPublishIssues(
  definition: WorkflowDefinition,
  options: { now?: Date; allowDevMinutes?: boolean } = {},
) {
  const issues: string[] = [];
  const fieldIds = new Set<string>();

  if (definition.recipients.length === 0) {
    issues.push(he.workflows.missingRecipients);
  }

  if (definition.fields.length === 0) {
    issues.push(he.workflows.missingFields);
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

  if (isOnceInThePast(definition.schedule, options.now)) {
    issues.push(he.workflows.onceInPast);
  }

  return issues;
}

export function canPublish(
  definition: WorkflowDefinition,
  options: { now?: Date; allowDevMinutes?: boolean } = {},
) {
  return getPublishIssues(definition, options).length === 0;
}
