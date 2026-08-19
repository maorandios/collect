"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { requireUser } from "@/lib/auth/require-user";
import { getDevSchedulesEnabled } from "@/lib/env";
import { he } from "@/lib/i18n/he";
import { enqueueSendEmailJobs } from "@/lib/jobs/enqueue";
import { processDueJobs } from "@/lib/jobs/worker";
import { getConnectedMailboxForUser } from "@/lib/mailbox";
import { createRequestsForRun, mapRequestError } from "@/lib/requests/create";
import { computeNextRunAt } from "@/lib/schedule/next-run";
import {
  activateGuard,
  draftSaveRowPatch,
  parseEditorJson,
  publishedRowFromEditor,
  publishChangesGuard,
  requirePublishedEditorJson,
} from "@/lib/workflow/editor-contract";
import { activationPlan, publishChangesPlan, type WorkflowStatus } from "@/lib/workflow/lifecycle";
import { canPublish } from "@/lib/workflow/publish";
import { parseWorkflowDefinition, type WorkflowDefinition } from "@/lib/workflow/schema";

type WorkflowRow = {
  status: WorkflowStatus;
  name: string;
  definition: unknown;
  draft_definition: unknown;
  next_run_at: string | null;
  draft_revision: number | null;
};

async function loadWorkflow(
  supabase: Awaited<ReturnType<typeof requireUser>>["supabase"],
  userId: string,
  workflowId: string,
) {
  const { data } = await supabase
    .from("workflows")
    .select("status, name, definition, draft_definition, next_run_at, draft_revision")
    .eq("id", workflowId)
    .eq("user_id", userId)
    .is("deleted_at", null)
    .maybeSingle();
  return (data as WorkflowRow | null) ?? null;
}

async function dispatchRequests({
  workflowId,
  userId,
  mailboxId,
  definition,
  isTest,
  scheduledFor,
}: {
  workflowId: string;
  userId: string;
  mailboxId: string;
  definition: WorkflowDefinition;
  isTest: boolean;
  scheduledFor: Date;
}) {
  const created = await createRequestsForRun({
    workflowId,
    userId,
    mailboxId,
    definition,
    scheduledFor,
    isTest,
  });
  await enqueueSendEmailJobs(created, scheduledFor);
  if (definition.schedule.type === "send_now" || isTest) {
    await processDueJobs();
  }
  return created;
}

export async function saveWorkflowDraft({
  workflowId,
  jsonText,
}: {
  workflowId?: string;
  jsonText: string;
}) {
  const { supabase, user } = await requireUser();
  const parsed = parseEditorJson(jsonText);
  if (!parsed.ok) {
    return parsed;
  }

  const mailbox = await getConnectedMailboxForUser(user.id);
  const existing = workflowId ? await loadWorkflow(supabase, user.id, workflowId) : null;
  if (workflowId && !existing) {
    return { ok: false as const, message: he.errors.notFound };
  }

  const payload = draftSaveRowPatch({
    existing,
    draft: parsed.draft,
    mailboxId: mailbox?.id ?? null,
    userId: user.id,
  });

  if (workflowId) {
    const { error } = await supabase.from("workflows").update(payload).eq("id", workflowId);
    if (error) {
      return { ok: false as const, message: he.errors.saveFailed, workflowId };
    }
    revalidatePath("/workflows");
    return { ok: true as const, message: he.workflows.draftSaved, workflowId };
  }

  const { data, error } = await supabase.from("workflows").insert(payload).select("id").single();
  if (error || !data) {
    return { ok: false as const, message: he.errors.saveFailed };
  }

  revalidatePath("/workflows");
  return { ok: true as const, message: he.workflows.draftSaved, workflowId: data.id };
}

export async function activateWorkflow({
  workflowId,
  jsonText,
}: {
  workflowId?: string;
  jsonText: string;
}) {
  const { supabase, user } = await requireUser();
  const existing = workflowId ? await loadWorkflow(supabase, user.id, workflowId) : null;
  if (workflowId && !existing) {
    return { ok: false as const, message: he.errors.notFound };
  }

  const allowed = activateGuard(existing?.status);
  if (!allowed.ok) {
    return allowed;
  }

  const parsed = requirePublishedEditorJson(jsonText);
  if (!parsed.ok) {
    return parsed;
  }

  const definition = parsed.definition;
  if (!canPublish(definition, { allowDevMinutes: getDevSchedulesEnabled() })) {
    return { ok: false as const, message: he.errors.invalidWorkflow };
  }

  const mailbox = await getConnectedMailboxForUser(user.id);
  if (!mailbox) {
    return { ok: false as const, message: he.errors.gmailRequired };
  }

  const plan = activationPlan(definition);
  if (plan.missingNextRun) {
    return { ok: false as const, message: he.workflows.onceInPast };
  }

  const payload = publishedRowFromEditor({
    definition,
    mailboxId: mailbox.id,
    status: plan.status,
    nextRunAt: plan.nextRunAt,
  });

  let savedId = workflowId;
  if (workflowId) {
    const { error } = await supabase.from("workflows").update(payload).eq("id", workflowId);
    if (error) {
      return { ok: false as const, message: he.errors.saveFailed };
    }
  } else {
    const { data, error } = await supabase
      .from("workflows")
      .insert({ ...payload, user_id: user.id, draft_revision: 1 })
      .select("id")
      .single();
    if (error || !data) {
      return { ok: false as const, message: he.errors.saveFailed };
    }
    savedId = data.id;
  }

  if (!savedId) {
    return { ok: false as const, message: he.errors.saveFailed };
  }

  if (plan.dispatchNow) {
    try {
      await dispatchRequests({
        workflowId: savedId,
        userId: user.id,
        mailboxId: mailbox.id,
        definition,
        isTest: false,
        scheduledFor: new Date(),
      });
    } catch (error) {
      return { ok: false as const, message: mapRequestError(error) };
    }
    if (plan.completeAfterDispatch) {
      await supabase
        .from("workflows")
        .update({ status: "completed", next_run_at: null })
        .eq("id", savedId)
        .eq("user_id", user.id);
    }
    revalidatePath("/requests");
    revalidatePath("/workflows");
    redirect("/requests");
  }

  revalidatePath("/workflows");
  redirect("/workflows");
}

export async function publishWorkflowChanges({
  workflowId,
  jsonText,
}: {
  workflowId: string;
  jsonText: string;
}) {
  const { supabase, user } = await requireUser();
  const existing = await loadWorkflow(supabase, user.id, workflowId);
  if (!existing) {
    return { ok: false as const, message: he.errors.notFound };
  }

  const allowed = publishChangesGuard(existing.status);
  if (!allowed.ok) {
    return allowed;
  }

  const parsed = requirePublishedEditorJson(jsonText);
  if (!parsed.ok) {
    return parsed;
  }

  const definition = parsed.definition;
  if (!canPublish(definition, { allowDevMinutes: getDevSchedulesEnabled() })) {
    return { ok: false as const, message: he.errors.invalidWorkflow };
  }

  const mailbox = await getConnectedMailboxForUser(user.id);
  if (!mailbox) {
    return { ok: false as const, message: he.errors.gmailRequired };
  }

  const previousSchedule = (existing.definition as { schedule?: unknown } | null)?.schedule;
  const plan = publishChangesPlan({
    status: existing.status,
    previousSchedule,
    nextSchedule: definition.schedule,
    currentNextRunAt: existing.next_run_at,
  });

  const payload = publishedRowFromEditor({
    definition,
    mailboxId: mailbox.id,
    status: plan.status,
    nextRunAt: plan.nextRunAt,
  });

  const { error } = await supabase.from("workflows").update(payload).eq("id", workflowId);
  if (error) {
    return { ok: false as const, message: he.errors.saveFailed };
  }

  revalidatePath("/workflows");
  return { ok: true as const, message: he.workflows.changesApplied, workflowId };
}

export async function sendTestWorkflow({
  workflowId,
  jsonText,
}: {
  workflowId?: string;
  jsonText: string;
}) {
  const { supabase, user } = await requireUser();
  const parsed = requirePublishedEditorJson(jsonText);
  if (!parsed.ok) {
    return parsed;
  }

  const mailbox = await getConnectedMailboxForUser(user.id);
  if (!mailbox || !mailbox.email) {
    return { ok: false as const, message: he.errors.gmailRequired };
  }

  const existing = workflowId ? await loadWorkflow(supabase, user.id, workflowId) : null;
  if (workflowId && !existing) {
    return { ok: false as const, message: he.errors.notFound };
  }

  const draftPayload = draftSaveRowPatch({
    existing,
    draft: parsed.definition,
    mailboxId: mailbox.id,
    userId: user.id,
  });

  let savedId = workflowId;
  if (workflowId) {
    const { error } = await supabase.from("workflows").update(draftPayload).eq("id", workflowId);
    if (error) {
      return { ok: false as const, message: he.errors.saveFailed };
    }
  } else {
    const { data, error } = await supabase.from("workflows").insert(draftPayload).select("id").single();
    if (error || !data) {
      return { ok: false as const, message: he.errors.saveFailed };
    }
    savedId = data.id;
  }

  if (!savedId) {
    return { ok: false as const, message: he.errors.saveFailed };
  }

  try {
    await dispatchRequests({
      workflowId: savedId,
      userId: user.id,
      mailboxId: mailbox.id,
      definition: {
        ...parsed.definition,
        recipients: [{ name: user.email ?? mailbox.email, email: mailbox.email }],
      },
      isTest: true,
      scheduledFor: new Date(),
    });
  } catch (error) {
    return { ok: false as const, message: mapRequestError(error) };
  }

  revalidatePath("/requests");
  return {
    ok: true as const,
    message: he.workflows.testSent,
    workflowId: savedId,
  };
}

export async function pauseWorkflow(workflowId: string) {
  const { supabase, user } = await requireUser();
  const { error } = await supabase
    .from("workflows")
    .update({ status: "paused" })
    .eq("id", workflowId)
    .eq("user_id", user.id)
    .eq("status", "active")
    .is("deleted_at", null);
  if (error) {
    return { ok: false as const, message: he.errors.saveFailed };
  }
  revalidatePath("/workflows");
  return { ok: true as const, message: he.workflows.paused };
}

export async function resumeWorkflow(workflowId: string) {
  const { supabase, user } = await requireUser();
  const { data } = await supabase
    .from("workflows")
    .select("id, definition, next_run_at, status")
    .eq("id", workflowId)
    .eq("user_id", user.id)
    .eq("status", "paused")
    .is("deleted_at", null)
    .maybeSingle();
  if (!data) {
    return { ok: false as const, message: he.errors.notFound };
  }

  const parsed = parseWorkflowDefinition(data.definition);
  if (!parsed.success) {
    return { ok: false as const, message: he.workflows.invalidJson };
  }

  const now = new Date();
  let nextRunAt = data.next_run_at ? new Date(data.next_run_at) : computeNextRunAt(parsed.data.schedule, now);
  if (parsed.data.schedule.type !== "manual" && (!nextRunAt || nextRunAt.getTime() <= now.getTime())) {
    nextRunAt = computeNextRunAt(parsed.data.schedule, now);
  }
  if (parsed.data.schedule.type === "manual") {
    nextRunAt = null;
  }

  const { error } = await supabase
    .from("workflows")
    .update({
      status: "active",
      next_run_at: nextRunAt ? nextRunAt.toISOString() : null,
    })
    .eq("id", workflowId)
    .eq("user_id", user.id);
  if (error) {
    return { ok: false as const, message: he.errors.saveFailed };
  }
  revalidatePath("/workflows");
  return { ok: true as const, message: he.workflows.resumed };
}

export async function deleteWorkflow(workflowId: string) {
  const { supabase, user } = await requireUser();
  const { error } = await supabase
    .from("workflows")
    .update({ deleted_at: new Date().toISOString() })
    .eq("id", workflowId)
    .eq("user_id", user.id)
    .is("deleted_at", null);
  if (error) {
    return { ok: false as const, message: he.errors.saveFailed };
  }
  revalidatePath("/workflows");
  return { ok: true as const, message: he.workflows.deleted };
}
