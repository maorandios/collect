"use client";

import { FormFieldRenderer } from "@/components/forms/form-field-renderer";
import { FileUpload } from "@/components/forms/file-upload";
import { Button } from "@/components/ui/button";
import { he } from "@/lib/i18n/he";
import { isUnconfiguredField } from "@/lib/workflow/draft-fields";
import type { WorkflowDraftDefinition } from "@/lib/workflow/draft-schema";
import type { WorkflowField } from "@/lib/workflow/schema";

export function PublicFormPreview({
  draft,
  senderName,
}: {
  draft: WorkflowDraftDefinition;
  senderName: string;
}) {
  return (
    <div className="relative mx-auto w-full max-w-2xl rounded-xl border border-border bg-surface p-8 shadow-sm">
      <span className="absolute start-6 top-6 rounded-full bg-primary/10 px-2.5 py-1 text-xs text-primary">
        {he.studio.previewBadge}
      </span>
      <p className="text-sm text-muted-foreground">{senderName}</p>
      <h1 className="mt-2 text-2xl font-medium">{draft.name || he.studio.notSet}</h1>
      {draft.email.body.trim() ? (
        <p className="mt-2 whitespace-pre-wrap text-sm text-muted-foreground">{draft.email.body}</p>
      ) : null}
      <div className="mt-8 space-y-6">
        {draft.fields.length === 0 ? (
          <p className="text-sm text-muted-foreground">{he.studio.formEmpty}</p>
        ) : (
          draft.fields.map((field) =>
            isUnconfiguredField(field) ? (
              <div key={field.id} className="rounded-xl border border-dashed border-border bg-muted/70 p-4">
                <p className="text-sm font-medium">{field.label}</p>
                <p className="mt-1 text-xs text-muted-foreground">{he.studio.setup.chooseInputType}</p>
              </div>
            ) : (
              <FormFieldRenderer
                key={field.id}
                field={field as WorkflowField}
                disabled
                fileInput={
                  field.type === "file" ? (
                    <FileUpload
                      accept={field.allowedMimeTypes.join(",")}
                      maxFiles={field.maxFiles}
                      maxFileSizeMb={field.maxFileSizeMb}
                      allowedMimeTypes={field.allowedMimeTypes}
                      files={[]}
                      mode="preview"
                    />
                  ) : undefined
                }
              />
            ),
          )
        )}
        <Button type="button" className="h-10" disabled>
          {he.recipient.submit}
        </Button>
      </div>
    </div>
  );
}
