"use client";

import { FormFieldRenderer } from "@/components/forms/form-field-renderer";
import { Button } from "@/components/ui/button";
import { he } from "@/lib/i18n/he";
import { configuredFields } from "@/lib/workflow/draft-fields";
import type { WorkflowDraftDefinition } from "@/lib/workflow/draft-schema";

export function FormPreview({ draft }: { draft: WorkflowDraftDefinition }) {
  const fields = configuredFields(draft.fields);
  if (fields.length === 0) {
    return (
      <div className="rounded-xl border border-border bg-surface p-6 text-sm text-muted-foreground">
        {he.studio.formEmpty}
      </div>
    );
  }

  return (
    <div className="space-y-6 rounded-xl border border-border bg-surface p-6">
      {draft.name.trim() ? <h2 className="text-lg font-medium">{draft.name}</h2> : null}
      <div className="space-y-6">
        {fields.map((field) => (
          <FormFieldRenderer key={field.id} field={field} disabled />
        ))}
      </div>
      <Button type="button" className="h-10" disabled>
        {he.studio.previewSubmit}
      </Button>
    </div>
  );
}
