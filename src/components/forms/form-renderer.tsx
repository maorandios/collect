"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";

import { FileUpload } from "@/components/forms/file-upload";
import { FormFieldRenderer } from "@/components/forms/form-field-renderer";
import { Button } from "@/components/ui/button";
import { he } from "@/lib/i18n/he";
import type { WorkflowDefinition, WorkflowField } from "@/lib/workflow/schema";

function inferMimeType(file: File) {
  if (file.type) {
    return file.type;
  }
  const extension = file.name.split(".").pop()?.toLowerCase();
  if (extension === "pdf") {
    return "application/pdf";
  }
  if (extension === "jpg" || extension === "jpeg") {
    return "image/jpeg";
  }
  if (extension === "png") {
    return "image/png";
  }
  if (extension === "webp") {
    return "image/webp";
  }
  return "";
}

type Answers = Record<string, unknown>;

async function touchOnce(touched: { current: boolean }) {
  if (touched.current) {
    return;
  }
  touched.current = true;
  await fetch("/api/public/touch", { method: "POST" });
}

function FileField({
  field,
  onInteract,
  initialFiles,
  disabled,
}: {
  field: Extract<WorkflowField, { type: "file" }>;
  onInteract: () => void;
  initialFiles: string[];
  disabled?: boolean;
}) {
  const [pending, setPending] = useState(false);
  const [files, setFiles] = useState<string[]>(initialFiles);

  async function uploadFile(selected: File) {
    const mimeType = inferMimeType(selected);
    onInteract();
    setPending(true);
    try {
      const signed = await fetch("/api/public/upload-url", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          fieldId: field.id,
          fileName: selected.name,
          mimeType,
          sizeBytes: selected.size,
        }),
      });
      const payload = (await signed.json()) as {
        message?: string;
        signedUrl?: string;
        path?: string;
      };
      if (!signed.ok || !payload.signedUrl || !payload.path) {
        toast.error(payload.message ?? he.errors.generic);
        return;
      }

      const upload = await fetch(payload.signedUrl, {
        method: "PUT",
        headers: {
          "Content-Type": mimeType,
        },
        body: selected,
      });
      if (!upload.ok) {
        toast.error(he.errors.generic);
        return;
      }

      const finalize = await fetch("/api/public/upload-finalize", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          fieldId: field.id,
          path: payload.path,
          originalName: selected.name,
          mimeType,
          sizeBytes: selected.size,
        }),
      });
      const done = (await finalize.json()) as { message?: string };
      if (!finalize.ok) {
        toast.error(done.message ?? he.errors.generic);
        return;
      }
      setFiles((current) => [...current, selected.name]);
      toast.success(he.recipient.uploaded);
    } finally {
      setPending(false);
    }
  }

  return (
    <div className="space-y-2">
      <FileUpload
        accept={field.allowedMimeTypes.join(",")}
        maxFiles={field.maxFiles}
        maxFileSizeMb={field.maxFileSizeMb}
        allowedMimeTypes={field.allowedMimeTypes}
        disabled={disabled}
        pending={pending}
        files={files}
        mode="live"
        onSelect={(selected) => {
          void uploadFile(selected);
        }}
      />
    </div>
  );
}

export function FormRenderer({
  definition,
  senderName,
  initialAnswers = {},
  initialFiles = [],
  readOnly = false,
  mode = "live",
}: {
  definition: Pick<WorkflowDefinition, "name" | "email" | "fields">;
  senderName: string;
  initialAnswers?: Answers;
  initialFiles?: { fieldId: string; name: string }[];
  readOnly?: boolean;
  mode?: "live" | "preview";
}) {
  const router = useRouter();
  const [answers, setAnswers] = useState<Answers>(initialAnswers);
  const [pending, setPending] = useState(false);
  const touched = useRef(false);
  const preview = mode === "preview";

  function update(fieldId: string, value: unknown) {
    if (preview) {
      return;
    }
    void touchOnce(touched);
    setAnswers((current) => ({ ...current, [fieldId]: value }));
  }

  async function saveDraft() {
    if (preview) {
      return;
    }
    setPending(true);
    try {
      await touchOnce(touched);
      const response = await fetch("/api/public/draft", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ answers }),
      });
      const payload = (await response.json()) as { message?: string };
      if (!response.ok) {
        toast.error(payload.message ?? he.errors.saveFailed);
        return;
      }
      toast.success(he.toast.saved);
    } finally {
      setPending(false);
    }
  }

  async function submit() {
    if (preview) {
      return;
    }
    setPending(true);
    try {
      await touchOnce(touched);
      const response = await fetch("/api/public/submit", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ answers }),
      });
      const payload = (await response.json()) as { message?: string };
      if (!response.ok) {
        toast.error(payload.message ?? he.errors.generic);
        return;
      }
      router.replace("/r/success");
    } finally {
      setPending(false);
    }
  }

  return (
    <div className="relative mx-auto w-full max-w-2xl rounded-xl border border-border bg-surface p-8 shadow-sm">
      {preview ? (
        <span className="absolute start-6 top-6 rounded-full bg-primary/10 px-2.5 py-1 text-xs text-primary">
          {he.studio.previewBadge}
        </span>
      ) : null}
      <p className="text-sm text-muted-foreground">{senderName}</p>
      <h1 className="mt-2 text-2xl font-medium">{definition.name || he.studio.notSet}</h1>
      {definition.email.body.trim() ? (
        <p className="mt-2 whitespace-pre-wrap text-sm text-muted-foreground">{definition.email.body}</p>
      ) : null}
      <form
        className="mt-8 space-y-6"
        onSubmit={(event) => {
          event.preventDefault();
          void submit();
        }}
      >
        {definition.fields.map((field) => (
          <FormFieldRenderer
            key={field.id}
            field={field}
            value={answers[field.id]}
            disabled={readOnly || preview}
            onChange={(value) => update(field.id, value)}
            fileInput={
              field.type === "file" ? (
                preview ? (
                  <FileUpload
                    accept={field.allowedMimeTypes.join(",")}
                    maxFiles={field.maxFiles}
                    maxFileSizeMb={field.maxFileSizeMb}
                    allowedMimeTypes={field.allowedMimeTypes}
                    files={[]}
                    mode="preview"
                  />
                ) : (
                  <FileField
                    field={field}
                    onInteract={() => void touchOnce(touched)}
                    initialFiles={initialFiles
                      .filter((file) => file.fieldId === field.id)
                      .map((file) => file.name)}
                    disabled={readOnly}
                  />
                )
              ) : undefined
            }
          />
        ))}
        <div className="flex gap-3">
          <Button type="submit" className="h-10" disabled={pending || readOnly || preview}>
            {he.recipient.submit}
          </Button>
          {preview ? null : (
            <Button type="button" variant="outline" className="h-10" disabled={pending || readOnly} onClick={() => void saveDraft()}>
              {he.recipient.saveDraft}
            </Button>
          )}
        </div>
      </form>
    </div>
  );
}
