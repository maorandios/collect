import { createAdminClient } from "@/lib/supabase/admin";
import { sendEmailIdempotencyKey, sendReminderIdempotencyKey } from "@/lib/jobs/keys";

export { sendEmailIdempotencyKey, sendReminderIdempotencyKey };

export async function enqueueSendEmailJobs(
  requests: { id: string }[],
  runAt = new Date(),
) {
  if (requests.length === 0) {
    return [];
  }

  const admin = createAdminClient();
  const rows = requests.map((request) => ({
    type: "send_email" as const,
    status: "pending" as const,
    run_at: runAt.toISOString(),
    payload: { requestId: request.id },
    idempotency_key: sendEmailIdempotencyKey(request.id),
  }));

  const { data, error } = await admin
    .from("jobs")
    .upsert(rows, { onConflict: "idempotency_key", ignoreDuplicates: true })
    .select("id, idempotency_key");

  if (error) {
    throw error;
  }

  return data ?? [];
}

export async function enqueueSendReminderJob({
  requestId,
  reminderDueAt,
}: {
  requestId: string;
  reminderDueAt: string;
}) {
  const admin = createAdminClient();
  const { data, error } = await admin
    .from("jobs")
    .upsert(
      {
        type: "send_reminder" as const,
        status: "pending" as const,
        run_at: reminderDueAt,
        payload: { requestId, reminderDueAt },
        idempotency_key: sendReminderIdempotencyKey(requestId, reminderDueAt),
      },
      { onConflict: "idempotency_key", ignoreDuplicates: true },
    )
    .select("id, idempotency_key")
    .maybeSingle();

  if (error) {
    throw error;
  }

  return data;
}
