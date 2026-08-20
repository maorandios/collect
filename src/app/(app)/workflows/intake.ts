"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { requireUser } from "@/lib/auth/require-user";
import { getWorkflowWizardEnabled } from "@/lib/env";
import { he } from "@/lib/i18n/he";
import { getConnectedMailboxForUser } from "@/lib/mailbox";
import { extractInitialWorkflowWithOpenAI } from "@/lib/openai/setup-extract";
import { TIMEZONE } from "@/lib/workflow/schema";
import { createSupabaseChatStore, findOwnedByIntakeRequestId } from "@/lib/workflow/chat-store";
import { draftFromRecord } from "@/lib/workflow/chat-types";
import {
  draftFromIntakeExtraction,
  resolveIntakeRecord,
  shouldRunIntakeExtraction,
} from "@/lib/workflow/intake-draft";
import type { WorkflowDraftDefinition } from "@/lib/workflow/draft-schema";

const MAX_DESCRIPTION_LENGTH = 4000;

const intakeRequestSchema = z.object({
  clientRequestId: z.string().uuid(),
  workflowId: z.string().uuid().optional(),
});

const buildIntakeSchema = intakeRequestSchema.extend({
  description: z.string().trim().min(1).max(MAX_DESCRIPTION_LENGTH),
});

type IntakeOk = { ok: true; workflowId: string };
type IntakeError = { ok: false; message: string; workflowId?: string };

function jerusalemToday() {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: TIMEZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
}

async function loadOrCreateIntakeWorkflow({
  userId,
  clientRequestId,
  workflowId,
}: {
  userId: string;
  clientRequestId: string;
  workflowId?: string;
}) {
  const store = createSupabaseChatStore();
  const remembered = workflowId ? await store.getOwned(workflowId, userId) : null;
  const foundByRequestId = await findOwnedByIntakeRequestId(userId, clientRequestId);
  const resolved = resolveIntakeRecord({
    clientRequestId,
    remembered: remembered
      ? { id: remembered.id, intakeRequestId: draftFromRecord(remembered).intakeRequestId }
      : null,
    foundByRequestId: foundByRequestId ? { id: foundByRequestId.id } : null,
  });

  if (!resolved.shouldCreate) {
    const record =
      remembered?.id === resolved.workflowId
        ? remembered
        : await store.getOwned(resolved.workflowId as string, userId);
    if (!record) {
      return { ok: false as const, message: he.errors.notFound };
    }
    return { ok: true as const, record, store };
  }

  const created = await store.createDraft(userId, { intakeRequestId: clientRequestId });
  return { ok: true as const, record: created, store };
}

export async function buildWizardDraft(input: {
  clientRequestId: string;
  description: string;
  workflowId?: string;
}): Promise<IntakeOk | IntakeError> {
  if (!getWorkflowWizardEnabled()) {
    return { ok: false, message: he.errors.forbidden };
  }
  const parsed = buildIntakeSchema.safeParse(input);
  if (!parsed.success) {
    const tooLong = parsed.error.issues.some((issue) => issue.path[0] === "description" && issue.code === "too_big");
    return {
      ok: false,
      message: tooLong ? he.workflows.chatMessageTooLong : he.workflows.invalidChatRequest,
    };
  }

  const { user } = await requireUser();
  const mailbox = await getConnectedMailboxForUser(user.id);

  let loaded;
  try {
    loaded = await loadOrCreateIntakeWorkflow({
      userId: user.id,
      clientRequestId: parsed.data.clientRequestId,
      workflowId: parsed.data.workflowId,
    });
  } catch {
    return { ok: false, message: he.errors.saveFailed };
  }
  if (!loaded.ok) {
    return loaded;
  }

  const currentDraft = draftFromRecord(loaded.record);
  if (!shouldRunIntakeExtraction(currentDraft)) {
    revalidatePath("/workflows");
    revalidatePath(`/workflows/${loaded.record.id}`);
    return { ok: true, workflowId: loaded.record.id };
  }

  try {
    const { extraction } = await extractInitialWorkflowWithOpenAI({
      userMessage: parsed.data.description,
      mailboxEmail: mailbox?.email ?? null,
      today: jerusalemToday(),
    });
    const draft: WorkflowDraftDefinition = draftFromIntakeExtraction({
      userMessage: parsed.data.description,
      extraction,
      intakeRequestId: parsed.data.clientRequestId,
      mailboxId: mailbox?.id ?? null,
    });
    const expectedRevision = loaded.record.draft_revision;
    try {
      await loaded.store.applyEdit({
        workflowId: loaded.record.id,
        userId: user.id,
        expectedRevision,
        draft,
      });
    } catch (error) {
      if (!(error instanceof Error && error.message === "revision_conflict")) {
        throw error;
      }
      const latest = await loaded.store.getOwned(loaded.record.id, user.id);
      if (!latest || shouldRunIntakeExtraction(draftFromRecord(latest))) {
        return { ok: false, message: he.wizard.intakeFailed, workflowId: loaded.record.id };
      }
    }
    revalidatePath("/workflows");
    revalidatePath(`/workflows/${loaded.record.id}`);
    return { ok: true, workflowId: loaded.record.id };
  } catch {
    return { ok: false, message: he.wizard.intakeFailed, workflowId: loaded.record.id };
  }
}

export async function startEmptyWizardDraft(input: {
  clientRequestId: string;
  workflowId?: string;
}): Promise<IntakeOk | IntakeError> {
  if (!getWorkflowWizardEnabled()) {
    return { ok: false, message: he.errors.forbidden };
  }
  const parsed = intakeRequestSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, message: he.workflows.invalidChatRequest };
  }

  const { user } = await requireUser();

  try {
    const loaded = await loadOrCreateIntakeWorkflow({
      userId: user.id,
      clientRequestId: parsed.data.clientRequestId,
      workflowId: parsed.data.workflowId,
    });
    if (!loaded.ok) {
      return loaded;
    }
    revalidatePath("/workflows");
    revalidatePath(`/workflows/${loaded.record.id}`);
    return { ok: true, workflowId: loaded.record.id };
  } catch {
    return { ok: false, message: he.errors.saveFailed };
  }
}
