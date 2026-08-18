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
import { canPublish } from "@/lib/workflow/publish";
import { parseWorkflowDefinition, type WorkflowDefinition } from "@/lib/workflow/schema";

function parseJsonText(jsonText: string) {
  try {
    return parseWorkflowDefinition(JSON.parse(jsonText));
  } catch {
    return { success: false as const };
  }
}

type WorkflowStatus = "draft" | "active" | "paused" | "completed";

async function saveWorkflowRecord({
  supabase,
  userId,
  workflowId,
  definition,
  mailboxId,
  status,
  nextRunAt,
}: {
  supabase: Awaited<ReturnType<typeof requireUser>>["supabase"];
  userId: string;
  workflowId?: string;
  definition: WorkflowDefinition;
  mailboxId: string | null;
  status: WorkflowStatus;
  nextRunAt: Date | null;
}) {
  const payload = {
    user_id: userId,
    name: definition.name,
    definition: {
      ...definition,
      senderMailboxId: mailboxId,
    },
    status,
    sender_mailbox_id: mailboxId,
    next_run_at: nextRunAt ? nextRunAt.toISOString() : null,
  };

  if (workflowId) {
    const { error } = await supabase.from("workflows").update(payload).eq("id", workflowId);
    if (error) {
      return { ok: false as const, message: he.errors.saveFailed, workflowId };
    }
    return { ok: true as const, workflowId };
  }

  const { data, error } = await supabase.from("workflows").insert(payload).select("id").single();
  if (error || !data) {
    return { ok: false as const, message: he.errors.saveFailed };
  }
  return { ok: true as const, workflowId: data.id };
}

export async function saveWorkflowDraft({
  workflowId,
  jsonText,
}: {
  workflowId?: string;
  jsonText: string;
}) {
  const { supabase, user } = await requireUser();
  const parsed = parseJsonText(jsonText);
  if (!parsed.success) {
    return { ok: false as const, message: he.workflows.invalidJson };
  }

  const mailbox = await getConnectedMailboxForUser(user.id);
  let status: WorkflowStatus = "draft";
  let nextRunAt: Date | null = null;
  if (workflowId) {
    const { data: existing } = await supabase
      .from("workflows")
      .select("status, definition, next_run_at")
      .eq("id", workflowId)
      .eq("user_id", user.id)
      .maybeSingle();
    if (existing?.status === "active" || existing?.status === "paused") {
      status = existing.status;
      const previousSchedule = (existing.definition as { schedule?: unknown } | null)?.schedule;
      const scheduleChanged =
        JSON.stringify(previousSchedule) !== JSON.stringify(parsed.data.schedule);
      if (scheduleChanged) {
        nextRunAt = computeNextRunAt(parsed.data.schedule);
      } else {
        nextRunAt = existing.next_run_at ? new Date(existing.next_run_at) : computeNextRunAt(parsed.data.schedule);
      }
    }
  }

  const saved = await saveWorkflowRecord({
    supabase,
    userId: user.id,
    workflowId,
    definition: parsed.data,
    mailboxId: mailbox?.id ?? null,
    status,
    nextRunAt: status === "draft" || status === "completed" ? null : nextRunAt,
  });
  if (!saved.ok) {
    return saved;
  }

  revalidatePath("/workflows");
  return { ok: true as const, message: he.workflows.draftSaved, workflowId: saved.workflowId };
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

export async function activateWorkflow({
  workflowId,
  jsonText,
}: {
  workflowId?: string;
  jsonText: string;
}) {
  const { supabase, user } = await requireUser();
  const parsed = parseJsonText(jsonText);
  if (!parsed.success) {
    return { ok: false as const, message: he.workflows.invalidJson };
  }

  const definition = parsed.data;
  if (!canPublish(definition, { allowDevMinutes: getDevSchedulesEnabled() })) {
    return { ok: false as const, message: he.errors.invalidWorkflow };
  }

  const mailbox = await getConnectedMailboxForUser(user.id);
  if (!mailbox) {
    return { ok: false as const, message: he.errors.gmailRequired };
  }

  const isSendNow = definition.schedule.type === "send_now";
  const nextRunAt = isSendNow ? null : computeNextRunAt(definition.schedule);
  if (!isSendNow && !nextRunAt) {
    return { ok: false as const, message: he.workflows.onceInPast };
  }

  const saved = await saveWorkflowRecord({
    supabase,
    userId: user.id,
    workflowId,
    definition,
    mailboxId: mailbox.id,
    status: "active",
    nextRunAt,
  });
  if (!saved.ok || !saved.workflowId) {
    return { ok: false as const, message: he.errors.saveFailed };
  }

  if (isSendNow) {
    try {
      await dispatchRequests({
        workflowId: saved.workflowId,
        userId: user.id,
        mailboxId: mailbox.id,
        definition,
        isTest: false,
        scheduledFor: new Date(),
      });
    } catch (error) {
      return { ok: false as const, message: mapRequestError(error) };
    }
    await supabase
      .from("workflows")
      .update({ next_run_at: null })
      .eq("id", saved.workflowId)
      .eq("user_id", user.id);
    await supabase
      .from("workflows")
      .update({ status: "completed", next_run_at: null })
      .eq("id", saved.workflowId)
      .eq("user_id", user.id);
    revalidatePath("/requests");
    revalidatePath("/workflows");
    redirect("/requests");
  }

  revalidatePath("/workflows");
  redirect("/workflows");
}

export async function sendTestWorkflow({
  workflowId,
  jsonText,
}: {
  workflowId?: string;
  jsonText: string;
}) {
  const { supabase, user } = await requireUser();
  const parsed = parseJsonText(jsonText);
  if (!parsed.success) {
    return { ok: false as const, message: he.workflows.invalidJson };
  }

  const mailbox = await getConnectedMailboxForUser(user.id);
  if (!mailbox || !mailbox.email) {
    return { ok: false as const, message: he.errors.gmailRequired };
  }

  const saved = await saveWorkflowRecord({
    supabase,
    userId: user.id,
    workflowId,
    definition: parsed.data,
    mailboxId: mailbox.id,
    status: "draft",
    nextRunAt: null,
  });
  if (!saved.ok || !saved.workflowId) {
    return { ok: false as const, message: he.errors.saveFailed };
  }

  try {
    await dispatchRequests({
      workflowId: saved.workflowId,
      userId: user.id,
      mailboxId: mailbox.id,
      definition: {
        ...parsed.data,
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
    workflowId: saved.workflowId,
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
  if (!nextRunAt || nextRunAt.getTime() <= now.getTime()) {
    nextRunAt = computeNextRunAt(parsed.data.schedule, now);
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
