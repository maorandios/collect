"use client";

import { useMemo } from "react";

import { buildRequestEmail } from "@/lib/email/render";
import { he } from "@/lib/i18n/he";
import { getDraftRecipient } from "@/lib/workflow/draft-canonical";
import type { WorkflowDraftDefinition } from "@/lib/workflow/draft-schema";
import { mailboxSummary } from "@/lib/workflow/studio-display";

export function EmailPreview({
  draft,
  mailboxEmail,
  appOrigin,
}: {
  draft: WorkflowDraftDefinition;
  mailboxEmail: string | null;
  appOrigin: string;
}) {
  const recipient = getDraftRecipient(draft);
  const sampleLink = he.studio.magicLinkSample.replace(
    "{host}",
    appOrigin.replace(/\/$/, "") || "https://APP_HOST",
  );
  const preview = useMemo(
    () =>
      buildRequestEmail({
        businessName: he.productName,
        recipientName: recipient.contactName,
        subject: draft.email.subject,
        body: draft.email.body,
        magicLinkUrl: sampleLink,
        dueAt: null,
        isTest: false,
      }),
    [draft.email.body, draft.email.subject, recipient.contactName, sampleLink],
  );
  const toLabel =
    [recipient.organizationName, recipient.contactName, recipient.email].filter(Boolean).join(" · ") ||
    he.studio.notSet;

  return (
    <div className="space-y-3">
      <div className="overflow-hidden rounded-xl border border-border bg-white text-right" dir="rtl">
        <div className="space-y-2 border-b border-border px-4 py-3 text-sm">
          <p>
            <span className="text-muted-foreground">{he.studio.emailFrom}: </span>
            {mailboxSummary(mailboxEmail)}
          </p>
          <p>
            <span className="text-muted-foreground">{he.studio.emailTo}: </span>
            {toLabel}
          </p>
          <p>
            <span className="text-muted-foreground">{he.workflow.emailSubject}: </span>
            {preview.subject || he.studio.notSet}
          </p>
        </div>
        <iframe title={he.studio.setup.emailPreview} className="h-[420px] w-full bg-white" srcDoc={preview.html} />
      </div>
      <p className="text-xs text-muted-foreground">{he.studio.magicLinkHint}</p>
    </div>
  );
}
