"use client";

import { useState } from "react";

import { EmailPreview } from "@/components/workflows/wizard/email-preview";
import { PublicFormPreview } from "@/components/workflows/wizard/public-form-preview";
import { he } from "@/lib/i18n/he";
import type { WorkflowDraftDefinition } from "@/lib/workflow/draft-schema";
import { cn } from "@/lib/utils";

export function WizardPreviewPane({
  draft,
  mailboxEmail,
  senderName,
  appOrigin,
}: {
  draft: WorkflowDraftDefinition;
  mailboxEmail: string | null;
  senderName: string;
  appOrigin: string;
}) {
  const [tab, setTab] = useState<"email" | "form">("email");
  return (
    <aside className="flex h-full min-h-0 min-w-0 flex-1 flex-col overflow-hidden border-s border-border bg-background">
      <div className="flex gap-2 border-b border-border bg-surface px-6 py-3">
        {(
          [
            ["email", he.wizard.previewEmail],
            ["form", he.wizard.previewForm],
          ] as const
        ).map(([id, label]) => (
          <button
            key={id}
            type="button"
            onClick={() => setTab(id)}
            className={cn(
              "rounded-lg px-3 py-1.5 text-sm",
              tab === id ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:bg-hover",
            )}
          >
            {label}
          </button>
        ))}
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto p-6">
        {tab === "email" ? (
          <EmailPreview draft={draft} mailboxEmail={mailboxEmail} appOrigin={appOrigin} />
        ) : (
          <PublicFormPreview draft={draft} senderName={senderName} />
        )}
      </div>
    </aside>
  );
}
