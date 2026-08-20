"use client";

import { useEffect, useMemo, useState } from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { buildRequestEmail } from "@/lib/email/render";
import { he } from "@/lib/i18n/he";
import type { WorkflowDraftDefinition } from "@/lib/workflow/draft-schema";
import type { EditorLockKey } from "@/lib/workflow/editor-locks";
import { mailboxSummary, recipientSummary } from "@/lib/workflow/studio-display";

export function StudioEmailTab({
  draft,
  mailboxEmail,
  appOrigin,
  readOnly,
  pending,
  saved,
  onEdit,
  onOpenForm,
}: {
  draft: WorkflowDraftDefinition;
  mailboxEmail: string | null;
  appOrigin: string;
  readOnly: boolean;
  pending: boolean;
  saved: boolean;
  onEdit: (draft: WorkflowDraftDefinition, locks: EditorLockKey[]) => void | Promise<boolean>;
  onOpenForm: () => void;
}) {
  const [mode, setMode] = useState<"edit" | "preview">("preview");
  const [subject, setSubject] = useState(draft.email.subject);
  const [body, setBody] = useState(draft.email.body);
  const [sourceSubject, setSourceSubject] = useState(draft.email.subject);
  const [sourceBody, setSourceBody] = useState(draft.email.body);
  if (draft.email.subject !== sourceSubject) {
    setSourceSubject(draft.email.subject);
    setSubject(draft.email.subject);
  }
  if (draft.email.body !== sourceBody) {
    setSourceBody(draft.email.body);
    setBody(draft.email.body);
  }

  const sampleLink = he.studio.magicLinkSample.replace(
    "{host}",
    appOrigin.replace(/\/$/, "") || "https://APP_HOST",
  );
  const preview = useMemo(
    () =>
      buildRequestEmail({
        businessName: he.productName,
        recipientName: draft.recipients[0]?.name ?? null,
        subject: subject || draft.email.subject,
        body: body || draft.email.body,
        magicLinkUrl: sampleLink,
        dueAt: null,
        isTest: false,
      }),
    [body, draft.email.body, draft.email.subject, draft.recipients, sampleLink, subject],
  );
  const previewHtml = preview.html.replace(
    "</body>",
    `<script>
      document.addEventListener("click", function (event) {
        var link = event.target && event.target.closest ? event.target.closest("a") : null;
        if (link) {
          event.preventDefault();
          parent.postMessage({ type: "studio-open-form" }, "*");
        }
      });
    </script></body>`,
  );

  useEffect(() => {
    function onMessage(event: MessageEvent) {
      if (event.data && event.data.type === "studio-open-form") {
        onOpenForm();
      }
    }
    window.addEventListener("message", onMessage);
    return () => window.removeEventListener("message", onMessage);
  }, [onOpenForm]);

  return (
    <div className="space-y-4 rounded-xl border border-border bg-surface p-6">
      <div className="flex gap-2">
        <button
          type="button"
          className={`rounded-lg px-3 py-1.5 text-sm ${mode === "preview" ? "bg-primary text-primary-foreground" : "text-muted-foreground"}`}
          onClick={() => setMode("preview")}
        >
          {he.studio.setup.emailPreview}
        </button>
        <button
          type="button"
          className={`rounded-lg px-3 py-1.5 text-sm ${mode === "edit" ? "bg-primary text-primary-foreground" : "text-muted-foreground"}`}
          onClick={() => setMode("edit")}
        >
          {he.studio.setup.emailEdit}
        </button>
      </div>
      {mode === "preview" ? (
        <div className="space-y-3">
          <div className="overflow-hidden rounded-xl border border-border bg-white text-right" dir="rtl">
            <div className="space-y-2 border-b border-border px-4 py-3 text-sm">
              <p>
                <span className="text-muted-foreground">{he.studio.emailFrom}: </span>
                {mailboxSummary(mailboxEmail)}
              </p>
              <p>
                <span className="text-muted-foreground">{he.studio.emailTo}: </span>
                {recipientSummary(draft)}
              </p>
              <p>
                <span className="text-muted-foreground">{he.workflow.emailSubject}: </span>
                {preview.subject || he.studio.notSet}
              </p>
            </div>
            <iframe title={he.studio.setup.emailPreview} className="h-[420px] w-full bg-white" srcDoc={previewHtml} />
          </div>
          <button type="button" className="text-sm font-medium text-primary hover:underline" onClick={onOpenForm}>
            {he.studio.openForm}
          </button>
          <p className="text-xs text-muted-foreground" dir="ltr">
            {sampleLink}
          </p>
          <p className="text-xs text-muted-foreground">{he.studio.magicLinkHint}</p>
        </div>
      ) : (
        <>
          <div>
            <p className="text-xs text-muted-foreground">{he.studio.emailFrom}</p>
            <p className="mt-1 text-sm">{mailboxSummary(mailboxEmail)}</p>
          </div>
          <div>
            <p className="text-xs text-muted-foreground">{he.studio.emailTo}</p>
            <p className="mt-1 text-sm">{recipientSummary(draft)}</p>
          </div>
          <div className="space-y-1">
            <label className="text-xs text-muted-foreground" htmlFor="studio-email-subject">
              {he.workflow.emailSubject}
            </label>
            <Input
              id="studio-email-subject"
              className="h-10"
              value={subject}
              disabled={readOnly}
              onChange={(event) => setSubject(event.target.value)}
            />
          </div>
          <div className="space-y-1">
            <label className="text-xs text-muted-foreground" htmlFor="studio-email-body">
              {he.workflow.emailBody}
            </label>
            <Textarea
              id="studio-email-body"
              className="min-h-40"
              value={body}
              disabled={readOnly}
              onChange={(event) => setBody(event.target.value)}
            />
          </div>
          <div className="space-y-2 rounded-xl border border-border bg-background p-4">
            <button type="button" className="text-sm font-medium text-primary hover:underline" onClick={onOpenForm}>
              {he.studio.openForm}
            </button>
            <p className="text-xs text-muted-foreground" dir="ltr">
              {sampleLink}
            </p>
            <p className="text-xs text-muted-foreground">{he.studio.magicLinkHint}</p>
          </div>
          <div className="flex items-center gap-3">
            <Button
              type="button"
              className="h-10"
              disabled={readOnly || pending || (subject === draft.email.subject && body === draft.email.body)}
              onClick={() => onEdit({ ...draft, email: { subject, body } }, ["emailSubject", "emailBody"])}
            >
              {pending ? he.studio.saving : he.studio.saveEdit}
            </Button>
            <p className="text-xs text-muted-foreground">{saved ? he.studio.saved : null}</p>
          </div>
        </>
      )}
    </div>
  );
}
