"use server";

import { revalidatePath } from "next/cache";

import { requireUser } from "@/lib/auth/require-user";
import { he } from "@/lib/i18n/he";
import { createSupabaseChatStore } from "@/lib/workflow/chat-store";
import { draftFromRecord, setupFromRecord } from "@/lib/workflow/chat-types";
import { parseWorkflowDraft } from "@/lib/workflow/draft-schema";
import { parseWorkflowSetupState } from "@/lib/workflow/setup-state";

export async function applyWorkflowSetupProposal({
  workflowId,
  expectedRevision,
  expectedSetupRevision,
  setupState,
}: {
  workflowId: string;
  expectedRevision: number;
  expectedSetupRevision: number;
  setupState?: unknown;
}) {
  const { user } = await requireUser();
  const store = createSupabaseChatStore();
  const record = await store.getOwned(workflowId, user.id);
  if (!record) {
    return { ok: false as const, status: 404, message: he.errors.notFound };
  }
  if (record.status === "completed") {
    return { ok: false as const, status: 409, message: he.errors.cannotChangeCompleted, workflowId };
  }
  if (
    record.draft_revision !== expectedRevision ||
    record.setup_revision !== expectedSetupRevision
  ) {
    const latest = await store.getOwned(workflowId, user.id);
    return {
      ok: false as const,
      status: 409,
      message: he.workflows.revisionConflict,
      workflowId,
      draft: latest ? draftFromRecord(latest) : draftFromRecord(record),
      revision: latest?.draft_revision ?? record.draft_revision,
      setupRevision: latest?.setup_revision ?? record.setup_revision,
      setupState: latest ? setupFromRecord(latest) : setupFromRecord(record),
    };
  }
  const fromClient = parseWorkflowSetupState(setupState);
  const setup = setupFromRecord(record) ?? (fromClient.success ? fromClient.data : null);
  if (!setup || setup.status !== "review") {
    return { ok: false as const, status: 409, message: he.studio.setup.reviewPrompt, workflowId };
  }
  const parsed = parseWorkflowDraft(setup.proposal);
  if (!parsed.success) {
    return { ok: false as const, status: 400, message: he.workflows.invalidJson, workflowId };
  }
  try {
    const applied = await store.applySetupProposal({
      workflowId,
      userId: user.id,
      expectedDraftRevision: expectedRevision,
      expectedSetupRevision,
      setup,
    });
    revalidatePath("/workflows");
    revalidatePath(`/workflows/${workflowId}`);
    return {
      ok: true as const,
      status: 200,
      workflowId,
      draft: applied.draft,
      revision: applied.newRevision,
      setupRevision: applied.setupRevision,
    };
  } catch (error) {
    const latest = await store.getOwned(workflowId, user.id);
    if (error instanceof Error && error.message === "setup_conflict") {
      return {
        ok: false as const,
        status: 409,
        message: he.studio.setup.conflict,
        workflowId,
        draft: latest ? draftFromRecord(latest) : draftFromRecord(record),
        revision: latest?.draft_revision ?? record.draft_revision,
        setupRevision: latest?.setup_revision ?? record.setup_revision,
        setupState: latest ? setupFromRecord(latest) : setupFromRecord(record),
        setupConflict: true,
      };
    }
    if (error instanceof Error && (error.message === "revision_conflict" || error.message === "not_review")) {
      return {
        ok: false as const,
        status: 409,
        message: error.message === "not_review" ? he.studio.setup.reviewPrompt : he.workflows.revisionConflict,
        workflowId,
        draft: latest ? draftFromRecord(latest) : draftFromRecord(record),
        revision: latest?.draft_revision ?? record.draft_revision,
        setupRevision: latest?.setup_revision ?? record.setup_revision,
        setupState: latest ? setupFromRecord(latest) : setupFromRecord(record),
      };
    }
    return { ok: false as const, status: 500, message: he.errors.saveFailed, workflowId };
  }
}
