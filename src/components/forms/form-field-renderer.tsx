"use client";

import type { ReactNode } from "react";

import { FileUpload } from "@/components/forms/file-upload";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { he } from "@/lib/i18n/he";
import type { WorkflowField } from "@/lib/workflow/schema";

export function FormFieldRenderer({
  field,
  value,
  onChange,
  disabled,
  fileInput,
  fileNames = [],
}: {
  field: WorkflowField;
  value?: unknown;
  onChange?: (value: unknown) => void;
  disabled?: boolean;
  fileInput?: ReactNode;
  fileNames?: string[];
}) {
  const requiredLabel = field.required ? he.studio.required : he.studio.optional;

  return (
    <div className="space-y-2">
      <Label htmlFor={field.id}>
        {field.label}
        <span className="font-normal text-muted-foreground"> · {requiredLabel}</span>
      </Label>
      {field.helpText ? <p className="text-xs text-muted-foreground">{field.helpText}</p> : null}
      {field.type === "short_text" ? (
        <Input
          id={field.id}
          className="h-10"
          required={field.required}
          value={String(value ?? "")}
          disabled={disabled}
          onChange={(event) => onChange?.(event.target.value)}
        />
      ) : null}
      {field.type === "long_text" ? (
        <Textarea
          id={field.id}
          required={field.required}
          value={String(value ?? "")}
          disabled={disabled}
          onChange={(event) => onChange?.(event.target.value)}
        />
      ) : null}
      {field.type === "number" ? (
        <Input
          id={field.id}
          type="number"
          className="h-10"
          required={field.required}
          value={value === undefined || value === null ? "" : String(value)}
          disabled={disabled}
          onChange={(event) => onChange?.(Number(event.target.value))}
        />
      ) : null}
      {field.type === "date" ? (
        <Input
          id={field.id}
          type="date"
          className="h-10"
          required={field.required}
          value={String(value ?? "")}
          disabled={disabled}
          onChange={(event) => onChange?.(event.target.value)}
        />
      ) : null}
      {field.type === "confirmation" ? (
        <label className="flex items-center gap-2 text-sm">
          <input
            id={field.id}
            type="checkbox"
            checked={value === true}
            disabled={disabled}
            onChange={(event) => onChange?.(event.target.checked)}
          />
          {field.label}
        </label>
      ) : null}
      {field.type === "file" ? (
        <div className="space-y-2">
          {fileInput ?? (
            <FileUpload
              accept={(field.allowedMimeTypes ?? []).join(",")}
              maxFiles={field.maxFiles ?? 1}
              maxFileSizeMb={field.maxFileSizeMb ?? 10}
              allowedMimeTypes={field.allowedMimeTypes ?? []}
              files={fileNames}
              mode="preview"
            />
          )}
          {fileNames.map((name, index) => (
            <p key={`${name}-${index}`} className="text-xs text-muted-foreground">
              {name}
            </p>
          ))}
        </div>
      ) : null}
    </div>
  );
}
