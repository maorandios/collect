import { he } from "@/lib/i18n/he";
import { parseWorkflowDraft, type WorkflowDraftDefinition } from "@/lib/workflow/draft-schema";
import { omitDraftOnlyFields } from "@/lib/workflow/editor-locks";
import {
  activationPlan,
  publishActionForStatus,
  publishChangesPlan,
  type WorkflowStatus,
} from "@/lib/workflow/lifecycle";
import { normalizeWorkflowDefinition } from "@/lib/workflow/normalize";
import { parseWorkflowDefinition, type WorkflowDefinition } from "@/lib/workflow/schema";

export function parseEditorJson(jsonText: string) {
  try {
    const raw = JSON.parse(jsonText) as unknown;
    const published = parseWorkflowDefinition(raw);
    if (published.success) {
      const definition = normalizeWorkflowDefinition(published.data);
      return { ok: true as const, kind: "published" as const, definition, draft: definition };
    }
    const draft = parseWorkflowDraft(raw);
    if (draft.success) {
      return { ok: true as const, kind: "draft" as const, definition: null, draft: draft.data };
    }
    return { ok: false as const, message: he.workflows.invalidJson };
  } catch {
    return { ok: false as const, message: he.workflows.invalidJson };
  }
}

export function requirePublishedEditorJson(jsonText: string) {
  const parsed = parseEditorJson(jsonText);
  if (!parsed.ok || !parsed.definition) {
    return { ok: false as const, message: he.workflows.invalidJson };
  }
  return { ok: true as const, definition: parsed.definition };
}

export function activateGuard(status: WorkflowStatus | null | undefined) {
  if (status === "completed") {
    return { ok: false as const, message: he.errors.cannotChangeCompleted };
  }
  if (status && status !== "draft") {
    return { ok: false as const, message: he.errors.cannotActivateNonDraft };
  }
  return { ok: true as const };
}

export function publishChangesGuard(status: WorkflowStatus | null | undefined) {
  if (status === "completed") {
    return { ok: false as const, message: he.errors.cannotChangeCompleted };
  }
  if (status !== "active" && status !== "paused") {
    return { ok: false as const, message: he.errors.cannotPublishChanges };
  }
  return { ok: true as const };
}

function draftName(draft: { name?: string }, fallback?: string) {
  const name = draft.name?.trim();
  return name ? name : fallback || he.workflows.untitledDraft;
}

type ExistingDraftRow = {
  status: WorkflowStatus;
  name: string;
  draft_revision: number | null;
};

type DraftSaveInput = {
  existing: ExistingDraftRow | null;
  draft: WorkflowDefinition | WorkflowDraftDefinition;
  mailboxId: string | null;
  userId: string;
};

export function draftSaveRowPatch(args: DraftSaveInput & { existing: null }): {
  user_id: string;
  name: string;
  definition: null;
  draft_definition: (WorkflowDefinition | WorkflowDraftDefinition) & { senderMailboxId: string | null };
  status: "draft";
  sender_mailbox_id: string | null;
  next_run_at: null;
  draft_revision: number;
};
export function draftSaveRowPatch(args: DraftSaveInput & { existing: ExistingDraftRow }): {
  draft_definition: (WorkflowDefinition | WorkflowDraftDefinition) & { senderMailboxId: string | null };
  draft_revision: number;
  sender_mailbox_id: string | null;
  name?: string;
};
export function draftSaveRowPatch(args: DraftSaveInput): {
  user_id?: string;
  name?: string;
  definition?: null;
  draft_definition: (WorkflowDefinition | WorkflowDraftDefinition) & { senderMailboxId: string | null };
  status?: "draft";
  sender_mailbox_id: string | null;
  next_run_at?: null;
  draft_revision: number;
};
export function draftSaveRowPatch(args: DraftSaveInput) {
  const { existing, draft, mailboxId, userId } = args;
  const draftDefinition = {
    ...draft,
    senderMailboxId: mailboxId,
  };

  if (!existing) {
    return {
      user_id: userId,
      name: draftName(draft),
      definition: null,
      draft_definition: draftDefinition,
      status: "draft" as const,
      sender_mailbox_id: mailboxId,
      next_run_at: null,
      draft_revision: 1,
    };
  }

  const patch: {
    draft_definition: typeof draftDefinition;
    draft_revision: number;
    sender_mailbox_id: string | null;
    name?: string;
  } = {
    draft_definition: draftDefinition,
    draft_revision: (existing.draft_revision ?? 0) + 1,
    sender_mailbox_id: mailboxId,
  };

  if (existing.status === "draft") {
    patch.name = draftName(draft, existing.name);
  }

  return patch;
}

export function publishedRowFromEditor({
  definition,
  mailboxId,
  status,
  nextRunAt,
}: {
  definition: WorkflowDefinition;
  mailboxId: string;
  status: WorkflowStatus;
  nextRunAt: Date | null;
}) {
  const published = omitDraftOnlyFields({
    ...definition,
    senderMailboxId: mailboxId,
  });
  return {
    name: definition.name,
    definition: published,
    draft_definition: published,
    status,
    sender_mailbox_id: mailboxId,
    next_run_at: nextRunAt ? nextRunAt.toISOString() : null,
  };
}

export { activationPlan, publishActionForStatus, publishChangesPlan };
