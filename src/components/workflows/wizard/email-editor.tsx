"use client";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { he } from "@/lib/i18n/he";
import { getDraftRecipient, getEmailEditingState, withEmailEditingState } from "@/lib/workflow/draft-canonical";
import type { WorkflowDraftDefinition } from "@/lib/workflow/draft-schema";
import { mailboxSummary } from "@/lib/workflow/studio-display";
import { defaultEmailBody, defaultEmailSubject } from "@/lib/workflow/setup-email";

export function EmailEditor({
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
  const recipient = getDraftRecipient(draft);
  const editing = getEmailEditingState(draft);
  const toLabel =
    [recipient.organizationName, recipient.contactName, recipient.email].filter(Boolean).join(" · ") ||
    he.studio.notSet;

  function updateEmail(subject: string, body: string, flags: { subject?: boolean; body?: boolean }) {
    onChange(
      withEmailEditingState(
        {
          ...draft,
          email: { subject, body },
          editorLocks: {
            ...draft.editorLocks,
            emailSubject: flags.subject ? true : draft.editorLocks?.emailSubject,
            emailBody: flags.body ? true : draft.editorLocks?.emailBody,
          },
        },
        {
          subjectManuallyEdited: flags.subject ? true : editing.subjectManuallyEdited,
          bodyManuallyEdited: flags.body ? true : editing.bodyManuallyEdited,
        },
      ),
    );
  }

  function resetFromForm() {
    const next = {
      ...draft,
      editorLocks: { ...draft.editorLocks, emailSubject: false, emailBody: false },
      emailEditingState: { subjectManuallyEdited: false, bodyManuallyEdited: false },
    };
    onChange({
      ...next,
      email: {
        subject: defaultEmailSubject(next) || draft.email.subject,
        body: defaultEmailBody(next) || draft.email.body,
      },
    });
  }

  return (
    <div className="space-y-4">
      <div>
        <p className="text-xs text-muted-foreground">{he.studio.emailFrom}</p>
        <p className="mt-1 text-sm">{mailboxSummary(mailboxEmail)}</p>
      </div>
      <div>
        <p className="text-xs text-muted-foreground">{he.studio.emailTo}</p>
        <p className="mt-1 text-sm">{toLabel}</p>
      </div>
      <div className="space-y-1">
        <label className="text-xs text-muted-foreground" htmlFor="wizard-email-subject">
          {he.workflow.emailSubject}
        </label>
        <Input
          id="wizard-email-subject"
          className="h-10"
          value={draft.email.subject}
          disabled={readOnly}
          onChange={(event) => updateEmail(event.target.value, draft.email.body, { subject: true })}
        />
      </div>
      <div className="space-y-1">
        <label className="text-xs text-muted-foreground" htmlFor="wizard-email-body">
          {he.workflow.emailBody}
        </label>
        <Textarea
          id="wizard-email-body"
          className="min-h-40"
          value={draft.email.body}
          disabled={readOnly}
          onChange={(event) => updateEmail(draft.email.subject, event.target.value, { body: true })}
        />
      </div>
      {readOnly ? null : (
        <Button type="button" variant="outline" className="h-10" onClick={resetFromForm}>
          {he.wizard.updateEmailFromForm}
        </Button>
      )}
    </div>
  );
}
