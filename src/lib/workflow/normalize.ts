import type { WorkflowDefinition } from "@/lib/workflow/schema";
import { omitDraftOnlyFields } from "@/lib/workflow/editor-locks";

export function normalizeWorkflowDefinition(definition: WorkflowDefinition): WorkflowDefinition {
  return {
    ...definition,
    recipientMode: definition.recipientMode ?? "fixed",
  };
}

export function editorDefinitionSource(draft: unknown, published: unknown) {
  return draft ?? published ?? null;
}

export function comparableDraft(value: unknown) {
  if (!value || typeof value !== "object") {
    return value ?? null;
  }
  return omitDraftOnlyFields(value as Record<string, unknown>);
}

export function hasUnpublishedDraftChanges(draft: unknown, published: unknown) {
  return JSON.stringify(comparableDraft(draft)) !== JSON.stringify(comparableDraft(published));
}
