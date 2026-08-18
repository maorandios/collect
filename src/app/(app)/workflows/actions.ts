"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { requireUser } from "@/lib/auth/require-user";
import { he } from "@/lib/i18n/he";
import { createRequestsForRun, mapRequestError } from "@/lib/requests/create";
import { canPublish } from "@/lib/workflow/publish";
import { parseWorkflowDefinition } from "@/lib/workflow/schema";

function parseJsonText(jsonText: string) {
  try {
    return parseWorkflowDefinition(JSON.parse(jsonText));
  } catch {
    return { success: false as const };
  }
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

  const definition = parsed.data;
  const payload = {
    user_id: user.id,
    name: definition.name,
    definition,
    status: "draft",
    sender_mailbox_id: definition.senderMailboxId,
    next_run_at: null,
  };

  if (workflowId) {
    const { error } = await supabase.from("workflows").update(payload).eq("id", workflowId);
    if (error) {
      return { ok: false as const, message: he.errors.saveFailed };
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
  const parsed = parseJsonText(jsonText);
  if (!parsed.success) {
    return { ok: false as const, message: he.workflows.invalidJson };
  }

  const definition = parsed.data;
  if (!canPublish(definition)) {
    return { ok: false as const, message: he.errors.invalidWorkflow };
  }

  const now = new Date();
  const payload = {
    user_id: user.id,
    name: definition.name,
    definition,
    status: "active",
    sender_mailbox_id: definition.senderMailboxId,
    next_run_at: definition.schedule.type === "send_now" ? null : now.toISOString(),
  };

  let id = workflowId;
  if (id) {
    const { error } = await supabase.from("workflows").update(payload).eq("id", id);
    if (error) {
      return { ok: false as const, message: he.errors.saveFailed };
    }
  } else {
    const { data, error } = await supabase.from("workflows").insert(payload).select("id").single();
    if (error || !data) {
      return { ok: false as const, message: he.errors.saveFailed };
    }
    id = data.id;
  }

  if (!id) {
    return { ok: false as const, message: he.errors.saveFailed };
  }

  try {
    await createRequestsForRun({
      workflowId: id,
      userId: user.id,
      mailboxId: definition.senderMailboxId,
      definition,
      scheduledFor: now,
      isTest: false,
    });
  } catch (error) {
    return { ok: false as const, message: mapRequestError(error) };
  }

  revalidatePath("/requests");
  revalidatePath("/workflows");
  redirect("/requests");
}
