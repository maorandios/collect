"use client";

import { he } from "@/lib/i18n/he";
import { fileLimitsLabel } from "@/lib/workflow/studio-display";
import { cn } from "@/lib/utils";

export function FileUpload({
  accept,
  maxFiles,
  maxFileSizeMb,
  allowedMimeTypes,
  disabled,
  pending,
  files,
  mode,
  onSelect,
}: {
  accept: string;
  maxFiles: number;
  maxFileSizeMb: number;
  allowedMimeTypes: string[];
  disabled?: boolean;
  pending?: boolean;
  files: string[];
  mode: "live" | "preview";
  onSelect?: (file: File) => void;
}) {
  const inactive = disabled || pending || files.length >= maxFiles || mode === "preview";

  return (
    <div className="space-y-2">
      <label
        className={cn(
          "flex min-h-24 cursor-pointer flex-col items-center justify-center rounded-xl border border-dashed border-border bg-background px-4 py-5 text-center",
          inactive ? "cursor-default opacity-70" : "hover:border-primary",
        )}
      >
        <span className="text-sm font-medium">{he.studio.chooseFile}</span>
        <span className="mt-1 text-xs text-muted-foreground">{he.studio.dropFile}</span>
        {mode === "live" ? (
          <input
            type="file"
            accept={accept}
            disabled={inactive}
            className="sr-only"
            onChange={(event) => {
              const selected = event.target.files?.[0];
              event.target.value = "";
              if (selected) {
                onSelect?.(selected);
              }
            }}
          />
        ) : null}
      </label>
      <p className="text-xs text-muted-foreground">
        {fileLimitsLabel({ allowedMimeTypes, maxFiles, maxFileSizeMb })}
      </p>
      {pending ? <p className="text-xs text-muted-foreground">{he.recipient.uploading}</p> : null}
      {files.map((name, index) => (
        <p key={`${name}-${index}`} className="text-xs text-muted-foreground">
          {name}
        </p>
      ))}
    </div>
  );
}
