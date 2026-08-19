"use client";

import { useState } from "react";
import Link from "next/link";

import { StudioEmailTab } from "@/components/workflows/studio-email-tab";
import { StudioFormTab } from "@/components/workflows/studio-form-tab";
import { StudioSummaryTab } from "@/components/workflows/studio-summary-tab";
import { StatusBadge } from "@/components/status/status-badge";
import { Button } from "@/components/ui/button";
import { he } from "@/lib/i18n/he";
import type { CompletionIssue } from "@/lib/workflow/completion";
import type { WorkflowDraftDefinition } from "@/lib/workflow/draft-schema";
import type { EditorLockKey } from "@/lib/workflow/editor-locks";
import { publishActionForStatus, type WorkflowStatus } from "@/lib/workflow/lifecycle";
import type { WorkflowSetupState } from "@/lib/workflow/setup-state";
import { hidePublishActionsDuringSetup, leftPaneIsEmpty, leftPaneShowsPendingBanner } from "@/lib/workflow/setup-ui";
import { definedText } from "@/lib/workflow/studio-display";
import { cn } from "@/lib/utils";

type TabId = "summary" | "email" | "form";

export function StudioProcessPane({
  draft,
  status,
  mailboxEmail,
  senderName,
  appOrigin,
  nextRunAt,
  conversationIssues,
  externalIssues,
  readyToPublish,
  hasUnpublishedChanges,
  pending,
  emailSaved,
  readOnly,
  setupState,
  onDraftEdit,
  onSaveDraft,
  onSendTest,
  onPublish,
}: {
  draft: WorkflowDraftDefinition;
  status: WorkflowStatus;
  mailboxEmail: string | null;
  senderName: string;
  appOrigin: string;
  nextRunAt: string | null;
  conversationIssues: CompletionIssue[];
  externalIssues: CompletionIssue[];
  readyToPublish: boolean;
  hasUnpublishedChanges: boolean;
  pending: boolean;
  emailSaved: boolean;
  readOnly: boolean;
  setupState: WorkflowSetupState | null;
  onDraftEdit: (draft: WorkflowDraftDefinition, locks: EditorLockKey[]) => void;
  onSaveDraft: () => void;
  onSendTest: () => void;
  onPublish: () => void;
}) {
  const [tab, setTab] = useState<TabId>("summary");
  const publishAction = publishActionForStatus(status);
  const showEmpty = leftPaneIsEmpty(setupState, draft);
  const showBanner = leftPaneShowsPendingBanner(setupState, draft);
  const hidePublish = hidePublishActionsDuringSetup(setupState, draft);
  const primaryDisabled =
    pending ||
    readOnly ||
    hidePublish ||
    (publishAction === "activate" && !readyToPublish) ||
    (publishAction === "publishChanges" && (!readyToPublish || !hasUnpublishedChanges));

  return (
    <section className="flex h-full min-h-0 min-w-0 flex-[3] flex-col overflow-hidden bg-background">
      <div className="flex items-center justify-between gap-3 border-b border-border bg-surface px-6 py-4">
        <div className="min-w-0">
          <p className="truncate text-lg font-medium">{showEmpty ? "\u00a0" : definedText(draft.name)}</p>
        </div>
        <StatusBadge status={status} />
      </div>
      {showEmpty ? null : (
      <div className="flex gap-2 border-b border-border bg-surface px-6 py-3">
        {(
          [
            ["summary", he.studio.tabSummary],
            ["email", he.studio.tabEmail],
            ["form", he.studio.tabForm],
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
      )}
      <div className="min-h-0 flex-1 overflow-x-hidden overflow-y-auto p-6">
        {showEmpty ? (
          <div className="flex h-full flex-col items-center justify-center text-center">
            <p className="text-lg font-medium">{he.studio.setup.emptyTitle}</p>
            <p className="mt-2 max-w-sm text-sm leading-6 text-muted-foreground">{he.studio.setup.emptyBody}</p>
          </div>
        ) : (
          <>
            {showBanner ? (
              <p className="mb-4 rounded-xl border border-border bg-surface px-4 py-3 text-sm">{he.studio.setup.pendingBanner}</p>
            ) : null}
            {tab === "summary" ? (
              <StudioSummaryTab
                draft={draft}
                mailboxEmail={mailboxEmail}
                nextRunAt={nextRunAt}
                conversationIssues={conversationIssues}
                externalIssues={externalIssues}
                readOnly={readOnly}
                onEdit={onDraftEdit}
                onOpenForm={() => setTab("form")}
              />
            ) : null}
            {tab === "email" ? (
              <StudioEmailTab
                draft={draft}
                mailboxEmail={mailboxEmail}
                appOrigin={appOrigin}
                readOnly={readOnly}
                pending={pending}
                saved={emailSaved}
                onEdit={onDraftEdit}
                onOpenForm={() => setTab("form")}
              />
            ) : null}
            {tab === "form" ? (
              <StudioFormTab draft={draft} senderName={senderName} readOnly={readOnly} onEdit={onDraftEdit} />
            ) : null}
          </>
        )}
      </div>
      <div className="border-t border-border bg-surface px-6 py-4">
        <div className="flex flex-wrap gap-3">
          <Button type="button" variant="outline" className="h-10" disabled={pending || readOnly} onClick={onSaveDraft}>
            {pending ? he.loading.saving : he.actions.saveDraft}
          </Button>
          {hidePublish ? null : (
          <Button
            type="button"
            variant="outline"
            className="h-10"
            disabled={pending || readOnly || !readyToPublish}
            onClick={onSendTest}
          >
            {pending ? he.workflows.sendingTest : he.actions.sendTest}
          </Button>
          )}
          {hidePublish || publishAction === "none" ? null : (
            <Button type="button" className="h-10" disabled={primaryDisabled} onClick={onPublish}>
              {publishAction === "publishChanges" ? he.actions.applyChanges : he.actions.publish}
            </Button>
          )}
          {externalIssues.some((issue) => issue.category === "mailbox") ? (
            <Link href="/settings" className="inline-flex h-10 items-center text-sm text-primary hover:underline">
              {he.actions.connectGmail}
            </Link>
          ) : null}
        </div>
      </div>
    </section>
  );
}
