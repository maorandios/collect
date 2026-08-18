import { he } from "@/lib/i18n/he";
import { createAdminClient } from "@/lib/supabase/admin";
import type { WorkflowDefinition } from "@/lib/workflow/schema";

const DEFAULT_EXPIRY_DAYS = 14;
const TEST_EXPIRY_HOURS = 2;

type CreateRequestsInput = {
  workflowId: string;
  userId: string;
  mailboxId: string | null;
  definition: WorkflowDefinition;
  scheduledFor: Date;
  isTest?: boolean;
};

export async function createRequestsForRun(input: CreateRequestsInput) {
  const admin = createAdminClient();
  const scheduledFor = input.scheduledFor.toISOString();
  const expiresAt = new Date(
    input.isTest
      ? Date.now() + TEST_EXPIRY_HOURS * 60 * 60 * 1000
      : Date.now() + DEFAULT_EXPIRY_DAYS * 24 * 60 * 60 * 1000,
  );

  let recipients = input.definition.recipients;
  if (!input.isTest) {
    const { data: existing } = await admin
      .from("requests")
      .select("recipient_email")
      .eq("workflow_id", input.workflowId)
      .eq("scheduled_for", scheduledFor)
      .eq("is_test", false);
    const alreadyCreated = new Set(
      (existing ?? []).map((row) => row.recipient_email.toLowerCase()),
    );
    recipients = recipients.filter(
      (recipient) => !alreadyCreated.has(recipient.email.toLowerCase()),
    );
    if (recipients.length === 0) {
      const { data: current } = await admin
        .from("requests")
        .select("id, recipient_email")
        .eq("workflow_id", input.workflowId)
        .eq("scheduled_for", scheduledFor)
        .eq("is_test", false);
      return current ?? [];
    }
  }

  const rows = recipients.map((recipient) => ({
    workflow_id: input.workflowId,
    user_id: input.userId,
    mailbox_id: input.mailboxId,
    recipient_name: recipient.name,
    recipient_email: recipient.email,
    scheduled_for: scheduledFor,
    status: "scheduled",
    definition_snapshot: input.definition,
    token_version: 1,
    token_expires_at: expiresAt.toISOString(),
    is_test: Boolean(input.isTest),
    sent_at: null,
    reminder_due_at: null,
  }));

  const { data, error } = await admin.from("requests").insert(rows).select("id, recipient_email");

  if (error) {
    if (error.code === "23505") {
      const { data: current } = await admin
        .from("requests")
        .select("id, recipient_email")
        .eq("workflow_id", input.workflowId)
        .eq("scheduled_for", scheduledFor)
        .eq("is_test", Boolean(input.isTest));
      return current ?? [];
    }
    throw error;
  }

  if (data) {
    await admin.from("request_events").insert(
      data.map((request) => ({
        request_id: request.id,
        type: "request_created",
        payload: { recipientEmail: request.recipient_email, isTest: Boolean(input.isTest) },
      })),
    );
  }

  return data ?? [];
}

export function mapRequestError(error: unknown) {
  if (error instanceof Error && error.message === "duplicate_request") {
    return he.errors.duplicateRequest;
  }
  return he.errors.saveFailed;
}
