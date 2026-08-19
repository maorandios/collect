"use server";

import { revalidatePath } from "next/cache";

import { requireUser } from "@/lib/auth/require-user";
import { he } from "@/lib/i18n/he";
import { getConnectedMailboxForUser } from "@/lib/mailbox";
import { createSupabaseChatStore } from "@/lib/workflow/chat-store";
import { draftFromRecord } from "@/lib/workflow/chat-types";
import { parseWorkflowDraft, type WorkflowDraftDefinition } from "@/lib/workflow/draft-schema";
import { mergeEditorLocks, type EditorLockKey } from "@/lib/workflow/editor-locks";

export async function applyWorkflowDraftEdit({
  workflowId,
  expectedRevision,
  draft,
  lockKeys = [],
}: {
  workflowId?: string;
  expectedRevision: number;
  draft: unknown;
  lockKeys?: EditorLockKey[];
}) {
  const parsed = parseWorkflowDraft(draft);
  if (!parsed.success) {
    return { ok: false as const, status: 400, message: he.workflows.invalidJson };
  }

  const { user } = await requireUser();
  const mailbox = await getConnectedMailboxForUser(user.id);
  const store = createSupabaseChatStore();
  let record = workflowId ? await store.getOwned(workflowId, user.id) : null;
  if (workflowId && !record) {
    return { ok: false as const, status: 404, message: he.errors.notFound };
  }
  if (!record) {
    record = await store.createDraft(user.id);
  }
  if (record.status === "completed") {
    return { ok: false as const, status: 409, message: he.errors.cannotChangeCompleted, workflowId: record.id };
  }

  const nextDraft: WorkflowDraftDefinition = {
    ...parsed.data,
    senderMailboxId: mailbox?.id ?? parsed.data.senderMailboxId ?? null,
    editorLocks: mergeEditorLocks(parsed.data.editorLocks, lockKeys),
    fields: parsed.data.fields.map((field) =>
      field.id && field.id !== "pending" ? field : { ...field, id: crypto.randomUUID() },
    ),
  };

  try {
    const applied = await store.applyEdit({
      workflowId: record.id,
      userId: user.id,
      expectedRevision: workflowId ? expectedRevision : 0,
      draft: nextDraft,
    });
    revalidatePath("/workflows");
    revalidatePath(`/workflows/${record.id}`);
    return {
      ok: true as const,
      status: 200,
      workflowId: record.id,
      draft: nextDraft,
      revision: applied.newRevision,
    };
  } catch (error) {
    if (error instanceof Error && error.message === "revision_conflict") {
      const latest = await store.getOwned(record.id, user.id);
      return {
        ok: false as const,
        status: 409,
        message: he.studio.revisionReload,
        workflowId: record.id,
        draft: latest ? draftFromRecord(latest) : nextDraft,
        revision: latest?.draft_revision ?? record.draft_revision,
      };
    }
    return { ok: false as const, status: 500, message: he.errors.saveFailed, workflowId: record.id };
  }
}
