import { he } from "@/lib/i18n/he";
import type { WorkflowDefinition } from "@/lib/workflow/schema";

export function getPublishIssues(definition: WorkflowDefinition) {
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

  if (definition.reminder.enabled && !definition.reminder.afterHours) {
    issues.push(he.workflows.missingReminderHours);
  }

  return issues;
}

export function canPublish(definition: WorkflowDefinition) {
  return getPublishIssues(definition).length === 0;
}
