import { emptyWorkflowDraft, parseWorkflowDraft, type WorkflowDraftDefinition } from "@/lib/workflow/draft-schema";
import type { WorkflowStatus } from "@/lib/workflow/lifecycle";
import { editorDefinitionSource } from "@/lib/workflow/normalize";
import { parseWorkflowSetupState, type WorkflowSetupState } from "@/lib/workflow/setup-state";

export type ChatWorkflowRecord = {
  id: string;
  status: WorkflowStatus;
  draft_definition: unknown;
  definition: unknown;
  draft_revision: number;
  setup_revision: number;
  deleted_at: string | null;
  setup_state?: unknown;
};

export type StoredChatMessage = {
  role: "user" | "assistant" | "error";
  content: string;
  client_turn_id: string;
};

export type ChatTurnStore = {
  createDraft(userId: string, options?: { intakeRequestId?: string }): Promise<ChatWorkflowRecord>;
  getOwned(workflowId: string, userId: string): Promise<ChatWorkflowRecord | null>;
  findMessage(
    workflowId: string,
    clientTurnId: string,
    role: StoredChatMessage["role"],
  ): Promise<StoredChatMessage | null>;
  insertMessage(input: {
    workflowId: string;
    userId: string;
    clientTurnId: string;
    role: StoredChatMessage["role"];
    content: string;
  }): Promise<void>;
  listRecent(workflowId: string, limit: number): Promise<StoredChatMessage[]>;
  applyTurn(input: {
    workflowId: string;
    userId: string;
    expectedRevision: number;
    draft: WorkflowDraftDefinition;
    clientTurnId: string;
    assistantContent: string;
  }): Promise<{ newRevision: number }>;
  applySetupTurn(input: {
    workflowId: string;
    userId: string;
    expectedDraftRevision: number;
    expectedSetupRevision: number;
    setup: WorkflowSetupState;
    clientTurnId: string;
    assistantContent: string;
  }): Promise<{ draftRevision: number; setupRevision: number }>;
  applySetupProposal(input: {
    workflowId: string;
    userId: string;
    expectedDraftRevision: number;
    expectedSetupRevision: number;
    setup?: WorkflowSetupState;
  }): Promise<{ newRevision: number; setupRevision: number; draft: WorkflowDraftDefinition }>;
  applyEdit(input: {
    workflowId: string;
    userId: string;
    expectedRevision: number;
    draft: WorkflowDraftDefinition;
  }): Promise<{ newRevision: number }>;
};

export function draftFromRecord(record: ChatWorkflowRecord): WorkflowDraftDefinition {
  const source = editorDefinitionSource(record.draft_definition, record.definition);
  const parsed = parseWorkflowDraft(source ?? {});
  return parsed.success ? parsed.data : emptyWorkflowDraft();
}

export function setupFromRecord(record: ChatWorkflowRecord): WorkflowSetupState | null {
  const parsed = parseWorkflowSetupState(record.setup_state);
  return parsed.success ? parsed.data : null;
}
