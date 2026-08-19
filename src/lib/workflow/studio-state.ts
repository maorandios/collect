import type { WorkflowDraftDefinition } from "@/lib/workflow/draft-schema";
import { emptyWorkflowDraft, parseWorkflowDraft } from "@/lib/workflow/draft-schema";
import type { WorkflowStatus } from "@/lib/workflow/lifecycle";
import { editorDefinitionSource, hasUnpublishedDraftChanges } from "@/lib/workflow/normalize";
import {
  getCompletionState,
  type CompletionIssue,
  type MailboxCompletionStatus,
} from "@/lib/workflow/completion";
import { computeReadyToPublish, getDraftBlockers } from "@/lib/workflow/readiness";
import type { WorkflowSetupState } from "@/lib/workflow/setup-state";
import { parseWorkflowSetupState } from "@/lib/workflow/setup-state";

export type StudioMessage = {
  id: string;
  role: "user" | "assistant" | "error";
  content: string;
  clientTurnId: string | null;
};

export type StudioInitialState = {
  workflowId?: string;
  status: WorkflowStatus;
  draft: WorkflowDraftDefinition;
  published: unknown;
  revision: number;
  nextRunAt: string | null;
  messages: StudioMessage[];
  mailboxEmail: string | null;
  hasMailbox: boolean;
  mailboxStatus: MailboxCompletionStatus;
  blockers: string[];
  warnings: string[];
  readyToPublish: boolean;
  hasUnpublishedChanges: boolean;
  conversationIssues: CompletionIssue[];
  externalIssues: CompletionIssue[];
  nextQuestions: CompletionIssue[];
  draftComplete: boolean;
  businessName: string;
  appOrigin: string;
  setupState: WorkflowSetupState | null;
  setupConflict: boolean;
  setupRevision: number;
};

function completionFields(
  draft: WorkflowDraftDefinition,
  hasMailbox: boolean,
  mailboxStatus: MailboxCompletionStatus,
) {
  const completion = getCompletionState(draft, { hasMailbox, mailboxStatus });
  return {
    blockers: getDraftBlockers(draft, { hasMailbox, mailboxStatus }),
    readyToPublish: computeReadyToPublish(draft, { hasMailbox, mailboxStatus }),
    conversationIssues: completion.conversationIssues,
    externalIssues: completion.externalIssues,
    nextQuestions: completion.nextQuestions,
    draftComplete: completion.draftComplete,
  };
}

export function emptyStudioState(
  mailboxEmail: string | null,
  hasMailbox: boolean,
  mailboxStatus: MailboxCompletionStatus = hasMailbox ? "connected" : "disconnected",
  extras: { businessName?: string; appOrigin?: string } = {},
): StudioInitialState {
  const draft = emptyWorkflowDraft();
  return {
    status: "draft",
    draft,
    published: null,
    revision: 0,
    nextRunAt: null,
    messages: [],
    mailboxEmail,
    hasMailbox,
    mailboxStatus,
    warnings: [],
    hasUnpublishedChanges: false,
    businessName: extras.businessName ?? "",
    appOrigin: extras.appOrigin ?? "",
    setupState: null,
    setupConflict: false,
    setupRevision: 0,
    ...completionFields(draft, hasMailbox, mailboxStatus),
  };
}

export function studioStateFromRow({
  workflowId,
  status,
  draftDefinition,
  definition,
  revision,
  nextRunAt,
  messages,
  mailboxEmail,
  hasMailbox,
  mailboxStatus = hasMailbox ? "connected" : "disconnected",
  businessName = "",
  appOrigin = "",
  setupState = null,
  setupRevision = 0,
}: {
  workflowId: string;
  status: string;
  draftDefinition: unknown;
  definition: unknown;
  revision: number;
  nextRunAt: string | null;
  messages: StudioMessage[];
  mailboxEmail: string | null;
  hasMailbox: boolean;
  mailboxStatus?: MailboxCompletionStatus;
  businessName?: string;
  appOrigin?: string;
  setupState?: unknown;
  setupRevision?: number;
}): StudioInitialState {
  const parsed = parseWorkflowDraft(editorDefinitionSource(draftDefinition, definition) ?? {});
  const draft = parsed.success ? parsed.data : emptyWorkflowDraft();
  const workflowStatus = (status as WorkflowStatus) ?? "draft";
  const setup = parseWorkflowSetupState(setupState);
  return {
    workflowId,
    status: workflowStatus,
    draft,
    published: definition,
    revision,
    nextRunAt,
    messages,
    mailboxEmail,
    hasMailbox,
    mailboxStatus,
    businessName,
    appOrigin,
    warnings: [],
    hasUnpublishedChanges: hasUnpublishedDraftChanges(draft, definition),
    setupState: setup.success ? setup.data : null,
    setupConflict: setup.success ? setup.data.conflict : false,
    setupRevision,
    ...completionFields(draft, hasMailbox, mailboxStatus),
  };
}
