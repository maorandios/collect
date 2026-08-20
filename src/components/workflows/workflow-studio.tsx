"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";

import {
  activateWorkflow,
  publishWorkflowChanges,
  saveWorkflowDraft,
  sendTestWorkflow,
} from "@/app/(app)/workflows/actions";
import { applyWorkflowDraftEdit } from "@/app/(app)/workflows/draft-edit";
import { applyWorkflowSetupProposal } from "@/app/(app)/workflows/setup-apply";
import { loadStudioState } from "@/app/(app)/workflows/studio-load";
import { StudioChatPane } from "@/components/workflows/studio-chat-pane";
import { StudioProcessPane } from "@/components/workflows/studio-process-pane";
import { he } from "@/lib/i18n/he";
import { completionBlockerMessages, getCompletionState, type CompletionIssue } from "@/lib/workflow/completion";
import type { WorkflowDraftDefinition } from "@/lib/workflow/draft-schema";
import type { EditorLockKey } from "@/lib/workflow/editor-locks";
import { mergeEditorLocks } from "@/lib/workflow/editor-locks";
import { publishActionForStatus } from "@/lib/workflow/lifecycle";
import { hasUnpublishedDraftChanges } from "@/lib/workflow/normalize";
import { computeReadyToPublish, getDraftBlockers } from "@/lib/workflow/readiness";
import { stashStudioState, takeStashedStudioState } from "@/lib/workflow/studio-session";
import { conversationModeOf, isBlankDraft, type WorkflowSetupState } from "@/lib/workflow/setup-state";
import type { StudioInitialState, StudioMessage } from "@/lib/workflow/studio-state";

const MAX_MESSAGE_LENGTH = 4000;

type ChatResponse = {
  message?: string;
  workflowId?: string;
  draft?: WorkflowDraftDefinition;
  revision?: number;
  assistantMessage?: string;
  blockers?: string[];
  warnings?: string[];
  readyToPublish?: boolean;
  conversationIssues?: CompletionIssue[];
  externalIssues?: CompletionIssue[];
  nextQuestions?: CompletionIssue[];
  draftComplete?: boolean;
  setupState?: WorkflowSetupState | null;
  nextQuestion?: WorkflowSetupState["nextQuestion"];
  setupConflict?: boolean;
  setupRevision?: number;
  aiUsed?: boolean;
  setupAction?: "apply";
};

export function WorkflowStudio({ initial }: { initial: StudioInitialState }) {
  const router = useRouter();
  const [state, setState] = useState<StudioInitialState>(() => {
    if (!initial.workflowId) {
      return initial;
    }
    return takeStashedStudioState(initial.workflowId) ?? initial;
  });
  const [composer, setComposer] = useState("");
  const [chatPending, setChatPending] = useState(false);
  const [actionPending, setActionPending] = useState(false);
  const [retryTurn, setRetryTurn] = useState<{ clientTurnId: string; message: string } | null>(null);
  const [emailSaved, setEmailSaved] = useState(false);
  const composerRef = useRef<HTMLTextAreaElement | null>(null);
  const revisionRef = useRef(state.revision);
  const setupRevisionRef = useRef(state.setupRevision);
  const pending = chatPending || actionPending;
  const readOnly = state.status === "completed";
  const tooLong = composer.length > MAX_MESSAGE_LENGTH;

  useEffect(() => {
    revisionRef.current = state.revision;
  }, [state.revision]);

  useEffect(() => {
    setupRevisionRef.current = state.setupRevision;
  }, [state.setupRevision]);

  function focusComposer(prompt?: string) {
    if (prompt) {
      setComposer(prompt);
    }
    window.setTimeout(() => {
      composerRef.current?.focus();
      const node = composerRef.current;
      if (node) {
        node.selectionStart = node.value.length;
        node.selectionEnd = node.value.length;
      }
    }, 0);
  }

  async function sendMessage(text: string, existingTurnId?: string) {
    const message = text.trim();
    if (!message || chatPending || readOnly) {
      return;
    }
    if (message.length > MAX_MESSAGE_LENGTH) {
      return;
    }

    const clientTurnId = existingTurnId ?? crypto.randomUUID();
    if (!existingTurnId && state.setupState?.status === "review" && message === he.studio.setup.buildProcess) {
      await applyProposal();
      return;
    }
    const userMessage: StudioMessage = {
      id: `user-${clientTurnId}`,
      role: "user",
      content: message,
      clientTurnId,
    };

    if (!existingTurnId) {
      setState((current) => ({ ...current, messages: [...current.messages, userMessage] }));
      setComposer("");
    } else {
      setState((current) => ({
        ...current,
        messages: current.messages.filter((item) => item.role !== "error"),
      }));
    }
    setRetryTurn({ clientTurnId, message });
    setChatPending(true);

    const expectedRevision = revisionRef.current;
    const expectedSetupRevision = setupRevisionRef.current;
    const workflowIdAtSend = state.workflowId;
    try {
      const response = await fetch("/api/workflows/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          workflowId: workflowIdAtSend,
          message,
          clientTurnId,
          expectedRevision,
          expectedSetupRevision,
          setupState: state.setupState,
        }),
      });
      const payload = (await response.json()) as ChatResponse;

      if (response.status === 409) {
        toast.error(he.studio.revisionReload);
        const workflowId = payload.workflowId ?? workflowIdAtSend;
        if (workflowId) {
          const fresh = await loadStudioState(workflowId);
          if (fresh) {
            setState(fresh);
            setRetryTurn(null);
          }
        }
        return;
      }

      if (!response.ok) {
        setState((current) => ({
          ...current,
          messages: [
            ...current.messages.filter((item) => item.role !== "error"),
            {
              id: `error-${clientTurnId}`,
              role: "error",
              content: payload.message ?? he.studio.retryHint,
              clientTurnId,
            },
          ],
        }));
        return;
      }

      const createdId = payload.workflowId && payload.workflowId !== workflowIdAtSend ? payload.workflowId : null;
      setState((latest) => {
        const draft = payload.draft ?? latest.draft;
        const setupState = payload.setupState ?? latest.setupState;
        const completion = getCompletionState(draft, {
          hasMailbox: latest.hasMailbox,
          mailboxStatus: latest.mailboxStatus,
        });
        const next: StudioInitialState = {
          ...latest,
          workflowId: payload.workflowId ?? latest.workflowId,
          draft,
          revision: payload.revision ?? latest.revision,
          setupRevision: payload.setupRevision ?? latest.setupRevision,
          blockers: payload.blockers ?? completionBlockerMessages(completion),
          warnings: payload.warnings ?? [],
          readyToPublish: payload.readyToPublish ?? completion.readyToPublish,
          hasUnpublishedChanges: hasUnpublishedDraftChanges(draft, latest.published),
          conversationIssues: payload.conversationIssues ?? completion.conversationIssues,
          externalIssues: payload.externalIssues ?? completion.externalIssues,
          nextQuestions: payload.nextQuestions ?? [],
          draftComplete: payload.draftComplete ?? completion.draftComplete,
          setupState,
          setupConflict: payload.setupConflict ?? false,
          messages: [
            ...latest.messages.filter((item) => item.clientTurnId !== clientTurnId && item.role !== "error"),
            userMessage,
            {
              id: `assistant-${clientTurnId}`,
              role: "assistant",
              content: payload.assistantMessage ?? "",
              clientTurnId,
            },
          ],
        };
        if (createdId) {
          stashStudioState(next);
        }
        return next;
      });
      setRetryTurn(null);

      if (payload.setupAction === "apply") {
        await applyProposal();
      }

      if (createdId) {
        router.replace(`/workflows/${createdId}`);
      }
    } catch {
      setState((current) => ({
        ...current,
        messages: [
          ...current.messages.filter((item) => item.role !== "error"),
          {
            id: `error-${clientTurnId}`,
            role: "error",
            content: he.studio.retryHint,
            clientTurnId,
          },
        ],
      }));
    } finally {
      setChatPending(false);
    }
  }

  async function runAction(handler: () => Promise<{ ok: boolean; message: string; workflowId?: string }>) {
    const previousId = state.workflowId;
    setActionPending(true);
    try {
      const result = await handler();
      if (!result.ok) {
        toast.error(result.message);
        return;
      }
      toast.success(result.message);
      const workflowId = result.workflowId ?? previousId;
      if (!workflowId) {
        return;
      }
      const fresh = await loadStudioState(workflowId);
      const next = fresh ?? { ...state, workflowId };
      setState(next);
      if (workflowId !== previousId) {
        stashStudioState(next);
        router.replace(`/workflows/${workflowId}`);
      }
    } finally {
      setActionPending(false);
    }
  }

  async function persistDraftEdit(next: WorkflowDraftDefinition, locks: EditorLockKey[]) {
    if (readOnly) {
      return false;
    }
    const withLocks = {
      ...next,
      editorLocks: mergeEditorLocks(next.editorLocks, locks),
    };
    setActionPending(true);
    setEmailSaved(false);
    const previousId = state.workflowId;
    try {
      const result = await applyWorkflowDraftEdit({
        workflowId: previousId,
        expectedRevision: revisionRef.current,
        draft: withLocks,
        lockKeys: locks,
      });
      if (!result.ok) {
        if (result.status === 409 && result.workflowId) {
          toast.error(result.message);
          const fresh = await loadStudioState(result.workflowId);
          if (fresh) {
            setState(fresh);
          }
          return false;
        }
        toast.error(result.message);
        return false;
      }
      setState((current) => {
        const completion = getCompletionState(result.draft, {
          hasMailbox: current.hasMailbox,
          mailboxStatus: current.mailboxStatus,
        });
        const setupStale =
          current.setupState != null &&
          current.setupState.status !== "completed" &&
          conversationModeOf(current.setupState) !== "edit" &&
          current.setupState.baseDraftRevision !== result.revision;
        return {
          ...current,
          workflowId: result.workflowId,
          draft: result.draft,
          revision: result.revision,
          blockers: getDraftBlockers(result.draft, {
            hasMailbox: current.hasMailbox,
            mailboxStatus: current.mailboxStatus,
          }),
          readyToPublish: computeReadyToPublish(result.draft, {
            hasMailbox: current.hasMailbox,
            mailboxStatus: current.mailboxStatus,
          }),
          hasUnpublishedChanges: hasUnpublishedDraftChanges(result.draft, current.published),
          conversationIssues: completion.conversationIssues,
          externalIssues: completion.externalIssues,
          nextQuestions: completion.nextQuestions,
          draftComplete: completion.draftComplete,
          setupState: setupStale ? { ...current.setupState!, conflict: true } : current.setupState,
          setupConflict: setupStale,
        };
      });
      revisionRef.current = result.revision;
      if (locks.includes("emailSubject") || locks.includes("emailBody")) {
        setEmailSaved(true);
      }
      toast.success(he.studio.changeSaved);
      if (result.workflowId && result.workflowId !== previousId) {
        stashStudioState({
          ...state,
          workflowId: result.workflowId,
          draft: result.draft,
          revision: result.revision,
        });
        router.replace(`/workflows/${result.workflowId}`);
      }
      return true;
    } catch {
      toast.error(he.errors.saveFailed);
      return false;
    } finally {
      setActionPending(false);
    }
  }

  async function applyProposal() {
    if (!state.workflowId) {
      return;
    }
    setActionPending(true);
    try {
      const result = await applyWorkflowSetupProposal({
        workflowId: state.workflowId,
        expectedRevision: revisionRef.current,
        expectedSetupRevision: setupRevisionRef.current,
        setupState: state.setupState,
      });
      if (!result.ok) {
        toast.error(result.message);
        if (result.status === 409) {
          const fresh = await loadStudioState(state.workflowId);
          if (fresh) {
            setState(fresh);
          }
        }
        return;
      }
      const fresh = await loadStudioState(state.workflowId);
      if (fresh) {
        const hasBuilt = fresh.messages.some((item) => item.content === he.studio.setup.processBuilt);
        setState({
          ...fresh,
          setupState: fresh.setupState
            ? {
                ...fresh.setupState,
                status: "completed",
                conversationMode: "edit",
                pendingEdit: null,
                nextQuestion: null,
              }
            : fresh.setupState,
          messages: hasBuilt
            ? fresh.messages
            : [
                ...fresh.messages,
                {
                  id: `assistant-built-${Date.now()}`,
                  role: "assistant",
                  content: he.studio.setup.processBuilt,
                  clientTurnId: null,
                },
              ],
        });
        revisionRef.current = fresh.revision;
        setupRevisionRef.current = fresh.setupRevision;
      }
    } finally {
      setActionPending(false);
    }
  }

  function onPublish() {
    const jsonText = JSON.stringify(state.draft);
    const publishAction = publishActionForStatus(state.status);
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

  return (
    <div className="flex h-full min-h-0 w-full flex-1 overflow-hidden overflow-x-hidden">
      <StudioChatPane
        messages={state.messages}
        pending={chatPending}
        composer={composer}
        onComposerChange={setComposer}
        onSend={() => void sendMessage(composer)}
        onRetry={() => {
          if (retryTurn) {
            void sendMessage(retryTurn.message, retryTurn.clientTurnId);
          }
        }}
        onExample={(prompt) => focusComposer(prompt)}
        onBuild={() => void applyProposal()}
        onQuickReply={(label) => void sendMessage(label)}
        readOnly={readOnly}
        tooLong={tooLong}
        setupState={state.setupState}
        hasExistingDraft={!isBlankDraft(state.draft)}
        status={state.status}
        composerRef={composerRef}
      />
      <StudioProcessPane
        draft={state.draft}
        status={state.status}
        mailboxEmail={state.mailboxEmail}
        senderName={state.businessName}
        appOrigin={state.appOrigin}
        nextRunAt={state.nextRunAt}
        conversationIssues={state.conversationIssues}
        externalIssues={state.externalIssues}
        readyToPublish={state.readyToPublish}
        hasUnpublishedChanges={state.hasUnpublishedChanges}
        pending={pending}
        emailSaved={emailSaved}
        readOnly={readOnly}
        setupState={state.setupState}
        onDraftEdit={(draft, locks) => persistDraftEdit(draft, locks)}
        onSaveDraft={() =>
          void runAction(() => saveWorkflowDraft({ workflowId: state.workflowId, jsonText: JSON.stringify(state.draft) }))
        }
        onSendTest={() =>
          void runAction(() => sendTestWorkflow({ workflowId: state.workflowId, jsonText: JSON.stringify(state.draft) }))
        }
        onPublish={onPublish}
      />
    </div>
  );
}
