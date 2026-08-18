"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
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

  async function onChange(event: React.ChangeEvent<HTMLInputElement>) {
    const selected = event.target.files?.[0];
    event.target.value = "";
    if (!selected) {
      return;
    }
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
      <Input
        type="file"
        accept={field.allowedMimeTypes.join(",")}
        disabled={disabled || pending || files.length >= field.maxFiles}
        onChange={onChange}
        className="h-10"
      />
      {pending ? <p className="text-xs text-muted-foreground">{he.recipient.uploading}</p> : null}
      {files.map((name, index) => (
        <p key={`${name}-${index}`} className="text-xs text-muted-foreground">
          {name}
        </p>
      ))}
    </div>
  );
}

export function FormRenderer({
  definition,
  senderName,
  initialAnswers = {},
  initialFiles = [],
  readOnly = false,
}: {
  definition: WorkflowDefinition;
  senderName: string;
  initialAnswers?: Answers;
  initialFiles?: { fieldId: string; name: string }[];
  readOnly?: boolean;
}) {
  const router = useRouter();
  const [answers, setAnswers] = useState<Answers>(initialAnswers);
  const [pending, setPending] = useState(false);
  const touched = useRef(false);

  function update(fieldId: string, value: unknown) {
    void touchOnce(touched);
    setAnswers((current) => ({ ...current, [fieldId]: value }));
  }

  async function saveDraft() {
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
    <div className="mx-auto w-full max-w-2xl rounded-xl border border-border bg-surface p-8 shadow-sm">
      <p className="text-sm text-muted-foreground">{senderName}</p>
      <h1 className="mt-2 text-2xl font-medium">{definition.name}</h1>
      <p className="mt-2 whitespace-pre-wrap text-sm text-muted-foreground">
        {definition.email.body}
      </p>
      <form
        className="mt-8 space-y-6"
        onSubmit={(event) => {
          event.preventDefault();
          void submit();
        }}
      >
        {definition.fields.map((field) => (
          <div key={field.id} className="space-y-2">
            <Label htmlFor={field.id}>
              {field.label}
              {field.required ? ` · ${he.validation.required}` : ""}
            </Label>
            {field.helpText ? (
              <p className="text-xs text-muted-foreground">{field.helpText}</p>
            ) : null}
            {field.type === "short_text" ? (
              <Input
                id={field.id}
                className="h-10"
                required={field.required}
                value={String(answers[field.id] ?? "")}
                disabled={readOnly}
                onChange={(event) => update(field.id, event.target.value)}
              />
            ) : null}
            {field.type === "long_text" ? (
              <Textarea
                id={field.id}
                required={field.required}
                value={String(answers[field.id] ?? "")}
                disabled={readOnly}
                onChange={(event) => update(field.id, event.target.value)}
              />
            ) : null}
            {field.type === "number" ? (
              <Input
                id={field.id}
                type="number"
                className="h-10"
                required={field.required}
                value={answers[field.id] === undefined || answers[field.id] === null ? "" : String(answers[field.id])}
                disabled={readOnly}
                onChange={(event) => update(field.id, Number(event.target.value))}
              />
            ) : null}
            {field.type === "date" ? (
              <Input
                id={field.id}
                type="date"
                className="h-10"
                required={field.required}
                value={String(answers[field.id] ?? "")}
                disabled={readOnly}
                onChange={(event) => update(field.id, event.target.value)}
              />
            ) : null}
            {field.type === "confirmation" ? (
              <label className="flex items-center gap-2 text-sm">
                <input
                  id={field.id}
                  type="checkbox"
                  checked={answers[field.id] === true}
                  disabled={readOnly}
                  onChange={(event) => update(field.id, event.target.checked)}
                />
                {field.label}
              </label>
            ) : null}
            {field.type === "file" ? (
              <FileField
                field={field}
                onInteract={() => void touchOnce(touched)}
                initialFiles={initialFiles
                  .filter((file) => file.fieldId === field.id)
                  .map((file) => file.name)}
                disabled={readOnly}
              />
            ) : null}
          </div>
        ))}
        <div className="flex gap-3">
          <Button type="submit" className="h-10" disabled={pending || readOnly}>
            {he.recipient.submit}
          </Button>
          <Button type="button" variant="outline" className="h-10" disabled={pending || readOnly} onClick={() => void saveDraft()}>
            {he.recipient.saveDraft}
          </Button>
        </div>
      </form>
    </div>
  );
}
