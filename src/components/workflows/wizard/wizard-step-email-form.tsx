"use client";

import { EmailEditor } from "@/components/workflows/wizard/email-editor";
import { he } from "@/lib/i18n/he";
import type { WorkflowDraftDefinition } from "@/lib/workflow/draft-schema";

export function WizardStepEmailForm({
  draft,
  mailboxEmail,
  readOnly,
  onChange,
}: {
  draft: WorkflowDraftDefinition;
  mailboxEmail: string | null;
  readOnly: boolean;
  onChange: (draft: WorkflowDraftDefinition) => void;
}) {
  return (
    <div className="space-y-4">
      <h2 className="text-lg font-medium">{he.wizard.emailFormTitle}</h2>
      <EmailEditor draft={draft} mailboxEmail={mailboxEmail} readOnly={readOnly} onChange={onChange} />
    </div>
  );
}
