"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import Link from "next/link";

import {
  activateWorkflow,
  publishWorkflowChanges,
  sendTestWorkflow,
} from "@/app/(app)/workflows/actions";
import { applyWorkflowDraftEdit } from "@/app/(app)/workflows/draft-edit";
import { loadStudioState } from "@/app/(app)/workflows/studio-load";
import { StatusBadge } from "@/components/status/status-badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { FormFieldsEditor } from "@/components/workflows/wizard/form-fields-editor";
import { WizardPreviewPane } from "@/components/workflows/wizard/wizard-preview-pane";
import { WizardStepEmailForm } from "@/components/workflows/wizard/wizard-step-email-form";
import { WizardStepRecipient } from "@/components/workflows/wizard/wizard-step-recipient";
import { WizardStepReview } from "@/components/workflows/wizard/wizard-step-review";
import { WizardStepSchedule } from "@/components/workflows/wizard/wizard-step-schedule";
import { WizardStepper } from "@/components/workflows/wizard/wizard-stepper";
import { he } from "@/lib/i18n/he";
import { materializePublishedDefinition } from "@/lib/workflow/draft-canonical";
import { createDraftSaveQueue, type DraftSaveStatus } from "@/lib/workflow/draft-save-queue";
import type { WorkflowDraftDefinition } from "@/lib/workflow/draft-schema";
import { parseWorkflowDraft } from "@/lib/workflow/draft-schema";
import { hasUnpublishedDraftChanges } from "@/lib/workflow/normalize";
import { publishActionForStatus } from "@/lib/workflow/lifecycle";
import { isBlankDraft } from "@/lib/workflow/setup-state";
import { syncProposalEmail } from "@/lib/workflow/setup-email";
import { stashStudioState } from "@/lib/workflow/studio-session";
import type { StudioInitialState } from "@/lib/workflow/studio-state";
import { getWizardCompletion, type WizardStepId } from "@/lib/workflow/wizard-completion";

function saveStatusLabel(status: DraftSaveStatus) {
  if (status === "saving") {
    return he.studio.saving;
  }
  if (status === "saved") {
    return he.studio.saved;
  }
  if (status === "error") {
    return he.wizard.saveError;
  }
  return "";
}

export function WorkflowWizard({
  initial,
  initialStep = "items",
}: {
  initial: StudioInitialState;
  initialStep?: WizardStepId;
}) {
  const router = useRouter();
  const [state, setState] = useState(initial);
  const [step, setStep] = useState<WizardStepId>(initialStep);
  const [saveStatus, setSaveStatus] = useState<DraftSaveStatus>("idle");
  const [actionPending, setActionPending] = useState(false);
  const [dismissedHydrate, setDismissedHydrate] = useState(false);
  const workflowIdRef = useRef(initial.workflowId);
  const queueRef = useRef<ReturnType<typeof createDraftSaveQueue> | null>(null);
  const pendingDraftRef = useRef<WorkflowDraftDefinition | null>(null);
  const readOnly = state.status === "completed";
  const completion = useMemo(() => getWizardCompletion(state.draft), [state.draft]);
  const publishAction = publishActionForStatus(state.status);
  const unpublished = hasUnpublishedDraftChanges(state.draft, state.published);
  const setupProposal = state.setupState?.proposal;
  const showHydrateBanner =
    !dismissedHydrate &&
    !readOnly &&
    isBlankDraft(state.draft) &&
    Boolean(setupProposal && !isBlankDraft(setupProposal));

  useEffect(() => {
    workflowIdRef.current = state.workflowId;
  }, [state.workflowId]);

  useEffect(() => {
    const created = createDraftSaveQueue({
      debounceMs: 400,
      save: async ({ draft, expectedRevision }) =>
        applyWorkflowDraftEdit({
          workflowId: workflowIdRef.current,
          expectedRevision,
          draft,
        }),
      onStatus: setSaveStatus,
      onResult: (result) => {
        if (!result.ok) {
          if (result.status === 409 && result.workflowId) {
            toast.error(result.message);
            void loadStudioState(result.workflowId).then((fresh) => {
              if (fresh) {
                workflowIdRef.current = fresh.workflowId;
                setState(fresh);
                created.setRevision(fresh.revision);
              }
            });
          } else {
            toast.error(result.message);
          }
          return;
        }
        const previousId = workflowIdRef.current;
        workflowIdRef.current = result.workflowId;
        setState((current) => {
          const next = {
            ...current,
            workflowId: result.workflowId,
            draft: result.draft,
            revision: result.revision,
            hasUnpublishedChanges: hasUnpublishedDraftChanges(result.draft, current.published),
          };
          if (result.workflowId !== current.workflowId) {
            stashStudioState(next);
          }
          return next;
        });
        if (result.workflowId !== previousId) {
          router.replace(`/workflows/${result.workflowId}`);
        }
      },
    });
    created.setRevision(initial.revision);
    queueRef.current = created;
    if (pendingDraftRef.current) {
      created.enqueue(pendingDraftRef.current);
      pendingDraftRef.current = null;
    }
    return () => {
      created.dispose();
      queueRef.current = null;
    };
  }, [initial.revision, router]);

  useEffect(() => {
    queueRef.current?.setRevision(state.revision);
  }, [state.revision]);

  function editDraft(next: WorkflowDraftDefinition) {
    if (readOnly) {
      return;
    }
    const synced = syncProposalEmail(next);
    setState((current) => ({
      ...current,
      draft: synced,
      hasUnpublishedChanges: hasUnpublishedDraftChanges(synced, current.published),
    }));
    const queue = queueRef.current;
    if (queue) {
      queue.enqueue(synced);
    } else {
      pendingDraftRef.current = synced;
    }
  }

  async function runAction(handler: () => Promise<{ ok: boolean; message: string; workflowId?: string }>) {
    await queueRef.current?.flush();
    setActionPending(true);
    try {
      const result = await handler();
      if (!result.ok) {
        toast.error(result.message);
        return;
      }
      toast.success(result.message);
      const workflowId = result.workflowId ?? state.workflowId;
      if (!workflowId) {
        return;
      }
      const fresh = await loadStudioState(workflowId);
      if (fresh) {
        setState(fresh);
        queueRef.current?.setRevision(fresh.revision);
      }
    } finally {
      setActionPending(false);
    }
  }

  function publishedJson() {
    const materialized = materializePublishedDefinition(state.draft);
    if (materialized.success) {
      return JSON.stringify(materialized.data);
    }
    return JSON.stringify(state.draft);
  }

  function onPublish() {
    const jsonText = publishedJson();
    if (publishAction === "publishChanges") {
      if (!state.workflowId) {
        toast.error(he.errors.notFound);
        return;
      }
      void runAction(() => publishWorkflowChanges({ workflowId: state.workflowId as string, jsonText }));
      return;
    }
    if (publishAction === "activate") {
      void runAction(() => activateWorkflow({ workflowId: state.workflowId, jsonText }));
    }
  }

  function continueSetupDraft() {
    if (!setupProposal) {
      return;
    }
    const parsed = parseWorkflowDraft(setupProposal);
    if (!parsed.success) {
      toast.error(he.workflows.invalidJson);
      return;
    }
    if (!isBlankDraft(state.draft)) {
      toast.error(he.studio.revisionReload);
      return;
    }
    setDismissedHydrate(true);
    editDraft(parsed.data);
  }

  const pending = actionPending || saveStatus === "saving";
  const activateBlocked =
    readOnly ||
    pending ||
    publishAction === "none" ||
    (publishAction === "activate" && (!completion.readyToPublish || !state.hasMailbox)) ||
    (publishAction === "publishChanges" && (!completion.readyToPublish || !unpublished || !state.hasMailbox));
  const activationIssue = completion.steps.activation.issues[0] ?? null;

  return (
    <div className="flex h-full min-h-0 w-full flex-1 overflow-hidden">
      <section className="flex h-full min-h-0 min-w-0 flex-[3] flex-col overflow-hidden bg-background">
        <div className="flex items-center justify-between gap-3 border-b border-border bg-surface px-6 py-4">
          <div className="min-w-0 flex-1">
            {readOnly ? (
              <p className="truncate text-lg font-medium">{state.draft.name || he.workflows.untitledDraft}</p>
            ) : (
              <Input
                className="h-10 max-w-md"
                value={state.draft.name}
                placeholder={he.workflow.name}
                onChange={(event) => editDraft({ ...state.draft, name: event.target.value })}
              />
            )}
          </div>
          <div className="flex items-center gap-3">
            <p className="text-xs text-muted-foreground">{saveStatusLabel(saveStatus)}</p>
            <StatusBadge status={state.status} />
          </div>
        </div>
        <WizardStepper current={step} completion={completion} onSelect={setStep} />
        <div className="min-h-0 flex-1 overflow-y-auto p-6">
          {showHydrateBanner ? (
            <div className="mb-4 space-y-3 rounded-xl border border-border bg-surface px-4 py-3 text-sm">
              <p>{he.wizard.setupDraftBanner}</p>
              <div className="flex flex-wrap gap-2">
                <Button type="button" className="h-9" onClick={continueSetupDraft}>
                  {he.wizard.continueSetupDraft}
                </Button>
                <Button type="button" variant="outline" className="h-9" onClick={() => setDismissedHydrate(true)}>
                  {he.wizard.restartSetupDraft}
                </Button>
              </div>
            </div>
          ) : null}
          {step === "items" ? (
            <div className="space-y-4">
              <h2 className="text-lg font-medium">{he.wizard.itemsTitle}</h2>
              <FormFieldsEditor draft={state.draft} readOnly={readOnly} onChange={editDraft} />
            </div>
          ) : null}
          {step === "recipient" ? (
            <WizardStepRecipient draft={state.draft} readOnly={readOnly} onChange={editDraft} />
          ) : null}
          {step === "schedule" ? (
            <WizardStepSchedule draft={state.draft} readOnly={readOnly} onChange={editDraft} />
          ) : null}
          {step === "preview" ? (
            <WizardStepEmailForm
              draft={state.draft}
              mailboxEmail={state.mailboxEmail}
              readOnly={readOnly}
              onChange={editDraft}
            />
          ) : null}
          {step === "activation" ? (
            <WizardStepReview
              draft={state.draft}
              status={state.status}
              nextRunAt={state.nextRunAt}
              hasUnpublishedChanges={unpublished}
            />
          ) : null}
        </div>
        <div className="border-t border-border bg-surface px-6 py-4">
          <div className="flex flex-wrap items-center gap-3">
            <Button
              type="button"
              variant="outline"
              className="h-10"
              disabled={pending || readOnly}
              onClick={() => void queueRef.current?.flush()}
            >
              {he.actions.saveDraft}
            </Button>
            <Button
              type="button"
              variant="outline"
              className="h-10"
              disabled={pending || readOnly || !completion.readyToPublish || !state.hasMailbox}
              onClick={() =>
                void runAction(() =>
                  sendTestWorkflow({ workflowId: state.workflowId, jsonText: publishedJson() }),
                )
              }
            >
              {he.actions.sendTest}
            </Button>
            {publishAction === "none" ? null : (
              <Button type="button" className="h-10" disabled={activateBlocked} onClick={onPublish}>
                {publishAction === "publishChanges" ? he.actions.applyChanges : he.actions.publish}
              </Button>
            )}
            {!state.hasMailbox ? (
              <Link href="/settings" className="inline-flex h-10 items-center text-sm text-primary hover:underline">
                {he.actions.connectGmail}
              </Link>
            ) : null}
            {activationIssue ? <p className="w-full text-sm text-muted-foreground">{activationIssue}</p> : null}
          </div>
        </div>
      </section>
      <WizardPreviewPane
        draft={state.draft}
        mailboxEmail={state.mailboxEmail}
        senderName={state.businessName}
        appOrigin={state.appOrigin}
      />
    </div>
  );
}
