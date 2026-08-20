"use client";

import { useState } from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { he } from "@/lib/i18n/he";
import { getDraftRecipient, withDraftRecipient } from "@/lib/workflow/draft-canonical";
import type { WorkflowDraftDefinition } from "@/lib/workflow/draft-schema";
import { emailValidationMessage, validateEmail, type EmailValidationResult } from "@/lib/workflow/setup-parse";

export function WizardStepRecipient({
  draft,
  readOnly,
  onChange,
}: {
  draft: WorkflowDraftDefinition;
  readOnly: boolean;
  onChange: (draft: WorkflowDraftDefinition) => void;
}) {
  const recipient = getDraftRecipient(draft);
  const [emailValue, setEmailValue] = useState(recipient.email ?? "");
  const [typo, setTypo] = useState<Extract<EmailValidationResult, { valid: false }> | null>(null);

  function commit(next: ReturnType<typeof getDraftRecipient>) {
    onChange(withDraftRecipient(draft, next));
  }

  function onEmailBlur(raw: string) {
    if (!raw.trim()) {
      setTypo(null);
      commit({ ...recipient, email: null });
      return;
    }
    const checked = validateEmail(raw);
    if (checked.valid) {
      setTypo(null);
      setEmailValue(checked.normalizedEmail);
      commit({ ...recipient, email: checked.normalizedEmail });
      return;
    }
    setTypo(checked);
  }

  return (
    <div className="space-y-4">
      <h2 className="text-lg font-medium">{he.wizard.recipientTitle}</h2>
      <div className="space-y-1">
        <label className="text-xs text-muted-foreground" htmlFor="wizard-org">
          {he.wizard.organizationName}
        </label>
        <Input
          id="wizard-org"
          className="h-10"
          disabled={readOnly}
          value={recipient.organizationName ?? ""}
          onChange={(event) => commit({ ...recipient, organizationName: event.target.value || null })}
        />
      </div>
      <label className="flex items-center gap-2 text-sm">
        <input
          type="checkbox"
          disabled={readOnly}
          checked={recipient.contactResolution === "no_fixed_contact"}
          onChange={(event) =>
            commit({
              ...recipient,
              contactResolution: event.target.checked ? "no_fixed_contact" : recipient.contactName ? "named" : "pending",
              contactName: event.target.checked ? null : recipient.contactName,
            })
          }
        />
        {he.studio.setup.noFixedContact}
      </label>
      {recipient.contactResolution === "no_fixed_contact" ? null : (
        <div className="space-y-1">
          <label className="text-xs text-muted-foreground" htmlFor="wizard-contact">
            {he.wizard.contactName}
          </label>
          <Input
            id="wizard-contact"
            className="h-10"
            disabled={readOnly}
            value={recipient.contactName ?? ""}
            onChange={(event) =>
              commit({
                ...recipient,
                contactName: event.target.value || null,
                contactResolution: event.target.value.trim() ? "named" : "pending",
              })
            }
          />
        </div>
      )}
      <div className="space-y-1">
        <label className="text-xs text-muted-foreground" htmlFor="wizard-email">
          {he.studio.recipientEmail}
        </label>
        <Input
          id="wizard-email"
          className="h-10"
          dir="ltr"
          disabled={readOnly}
          value={emailValue}
          onChange={(event) => setEmailValue(event.target.value)}
          onBlur={(event) => onEmailBlur(event.target.value)}
        />
      </div>
      {typo ? (
        <div className="space-y-2 rounded-xl border border-border bg-surface p-4 text-sm">
          <p>{emailValidationMessage(typo)}</p>
          {typo.suggestion ? (
            <div className="flex flex-wrap gap-2">
              <Button
                type="button"
                className="h-9"
                onClick={() => {
                  commit({ ...recipient, email: typo.suggestion ?? null });
                  setEmailValue(typo.suggestion ?? "");
                  setTypo(null);
                }}
              >
                {he.studio.setup.emailTypoYes}
              </Button>
              <Button type="button" variant="outline" className="h-9" onClick={() => setTypo(null)}>
                {he.studio.setup.emailTypoRewrite}
              </Button>
            </div>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
