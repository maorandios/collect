import { he } from "@/lib/i18n/he";
import type { DraftField, WorkflowDraftDefinition } from "@/lib/workflow/draft-schema";
import type { WorkflowField } from "@/lib/workflow/schema";

export function isUnconfiguredField(field: DraftField): field is Extract<DraftField, { type: "unconfigured" }> {
  return field.type === "unconfigured";
}

export function unconfiguredFields(fields: DraftField[]) {
  return fields.filter(isUnconfiguredField);
}

export function configuredFields(fields: DraftField[]): WorkflowField[] {
  return fields.filter((field): field is Exclude<DraftField, { type: "unconfigured" }> => field.type !== "unconfigured");
}

export function unconfiguredField(id: string, label: string): DraftField {
  return {
    id,
    type: "unconfigured",
    label,
    required: true,
    helpText: null,
  };
}

export function unconfiguredFieldsMessage(fields: DraftField[]) {
  const pending = unconfiguredFields(fields);
  if (pending.length === 0) {
    return null;
  }
  if (pending.length === 1) {
    return he.studio.setup.unconfiguredOne.replace("{label}", pending[0]?.label ?? "");
  }
  return he.studio.setup.unconfiguredMany.replace("{count}", String(pending.length));
}

export function draftHasUnconfiguredFields(draft: Pick<WorkflowDraftDefinition, "fields">) {
  return draft.fields.some(isUnconfiguredField);
}
