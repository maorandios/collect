import { createAdminClient } from "@/lib/supabase/admin";
import { buildRequestEmail } from "@/lib/email/render";
import { getDevSchedulesEnabled } from "@/lib/env";
import { he } from "@/lib/i18n/he";
import { enqueueSendReminderJob } from "@/lib/jobs/enqueue";
import { getOwnedMailbox } from "@/lib/mailbox";
import { buildMagicLinkUrl, createMagicLinkToken } from "@/lib/magic-link/token";
import { isNylasError, sendGrantMessage } from "@/lib/nylas/client";
import { reminderDelayMs } from "@/lib/schedule/reminder";
import { parseWorkflowDefinition } from "@/lib/workflow/schema";

type JobRow = {
  id: string;
  type: string;
  status: string;
  attempts: number;
  max_attempts: number;
  idempotency_key: string;
  payload: { requestId?: string; providerMessageId?: string; reminderDueAt?: string };
};

export type JobProcessCounters = {
  processedJobs: number;
  succeededJobs: number;
  failedJobs: number;
  skippedJobs: number;
};

type JobOutcome = "succeeded" | "failed" | "skipped" | "retried";

function backoffMs(attempts: number) {
  const minutes = Math.min(30, 2 ** Math.max(0, attempts - 1));
  return minutes * 60 * 1000;
}

async function markRequestFailed(admin: ReturnType<typeof createAdminClient>, requestId: string) {
  await admin
    .from("requests")
    .update({ status: "failed" })
    .eq("id", requestId)
    .neq("status", "completed");
  await admin.from("request_events").insert({
    request_id: requestId,
    type: "send_failed",
    payload: {},
  });
}

async function skipJob(admin: ReturnType<typeof createAdminClient>, jobId: string, lastError: string) {
  const skipped = await admin
    .from("jobs")
    .update({
      status: "skipped",
      processing_started_at: null,
      last_error: lastError,
    })
    .eq("id", jobId);
  if (!skipped.error) {
    return;
  }
  await admin
    .from("jobs")
    .update({
      status: "succeeded",
      processing_started_at: null,
      last_error: lastError,
    })
    .eq("id", jobId);
}

function requestPayload(job: JobRow) {
  return job.payload && typeof job.payload === "object" ? job.payload : {};
}

async function loadRequest(admin: ReturnType<typeof createAdminClient>, requestId: string) {
  const { data } = await admin
    .from("requests")
    .select(
      "id, user_id, mailbox_id, recipient_name, recipient_email, status, definition_snapshot, token_version, token_expires_at, is_test, scheduled_for, sent_at, reminder_due_at, reminder_sent_at",
    )
    .eq("id", requestId)
    .maybeSingle();
  return data;
}

async function processSendEmailJob(job: JobRow): Promise<JobOutcome> {
  const admin = createAdminClient();
  const requestId = requestPayload(job).requestId;
  if (!requestId) {
    await admin
      .from("jobs")
      .update({ status: "failed", last_error: "invalid_payload", processing_started_at: null })
      .eq("id", job.id);
    return "failed";
  }

  const requestRow = await loadRequest(admin, requestId);
  if (!requestRow) {
    await admin
      .from("jobs")
      .update({ status: "failed", last_error: "invalid_payload", processing_started_at: null })
      .eq("id", job.id);
    return "failed";
  }

  if (requestRow.status === "completed" || requestRow.status === "failed") {
    await admin
      .from("jobs")
      .update({ status: "succeeded", processing_started_at: null })
      .eq("id", job.id);
    return "succeeded";
  }

  const sent = await sendRequestEmail(admin, job, requestRow, false);
  if (sent === "succeeded" && !requestRow.reminder_due_at) {
    await maybeEnqueueReminder(admin, requestRow);
  }
  return sent;
}

async function processSendReminderJob(job: JobRow): Promise<JobOutcome> {
  const admin = createAdminClient();
  const payload = requestPayload(job);
  const requestId = payload.requestId;
  if (!requestId) {
    await admin
      .from("jobs")
      .update({ status: "failed", last_error: "invalid_payload", processing_started_at: null })
      .eq("id", job.id);
    return "failed";
  }

  const requestRow = await loadRequest(admin, requestId);
  if (!requestRow) {
    await skipJob(admin, job.id, "missing_request");
    return "skipped";
  }

  const parsed = parseWorkflowDefinition(requestRow.definition_snapshot);
  const expired =
    requestRow.status === "expired" ||
    (requestRow.token_expires_at
      ? new Date(requestRow.token_expires_at).getTime() <= Date.now()
      : false);

  if (
    requestRow.status === "completed" ||
    expired ||
    requestRow.reminder_sent_at ||
    !parsed.success ||
    !parsed.data.reminder.enabled ||
    !requestRow.sent_at
  ) {
    await skipJob(admin, job.id, "reminder_not_needed");
    return "skipped";
  }

  if (!requestRow.mailbox_id) {
    await skipJob(admin, job.id, "missing_mailbox");
    return "skipped";
  }

  const mailbox = await getOwnedMailbox(requestRow.user_id, requestRow.mailbox_id);
  if (!mailbox || mailbox.status !== "connected" || !mailbox.nylas_grant_id) {
    await skipJob(admin, job.id, "mailbox_disconnected");
    return "skipped";
  }

  const outcome = await sendRequestEmail(admin, job, requestRow, true);
  if (outcome === "succeeded") {
    await admin
      .from("requests")
      .update({ reminder_sent_at: new Date().toISOString() })
      .eq("id", requestId)
      .is("reminder_sent_at", null);
    await admin.from("request_events").insert({
      request_id: requestId,
      type: "reminder_sent",
      payload: {},
    });
  }
  return outcome;
}

async function maybeEnqueueReminder(
  admin: ReturnType<typeof createAdminClient>,
  requestRow: NonNullable<Awaited<ReturnType<typeof loadRequest>>>,
) {
  const parsed = parseWorkflowDefinition(requestRow.definition_snapshot);
  if (!parsed.success) {
    return;
  }
  const delay = reminderDelayMs(parsed.data.reminder, {
    allowMinutes: getDevSchedulesEnabled(),
  });
  if (!delay || !requestRow.sent_at) {
    return;
  }

  const reminderDueAt = new Date(new Date(requestRow.sent_at).getTime() + delay).toISOString();
  await admin
    .from("requests")
    .update({ reminder_due_at: reminderDueAt })
    .eq("id", requestRow.id)
    .is("reminder_due_at", null);
  await enqueueSendReminderJob({
    requestId: requestRow.id,
    reminderDueAt,
  });
}

async function sendRequestEmail(
  admin: ReturnType<typeof createAdminClient>,
  job: JobRow,
  requestRow: NonNullable<Awaited<ReturnType<typeof loadRequest>>>,
  isReminder: boolean,
): Promise<JobOutcome> {
  if (!requestRow.mailbox_id) {
    await failOrRetry(admin, job, requestRow.id, "invalid_payload", true);
    return job.attempts >= job.max_attempts ? "failed" : "retried";
  }

  const mailbox = await getOwnedMailbox(requestRow.user_id, requestRow.mailbox_id);
  if (!mailbox) {
    await failOrRetry(admin, job, requestRow.id, "invalid_payload", true);
    return job.attempts >= job.max_attempts ? "failed" : "retried";
  }

  if (mailbox.status !== "connected" || !mailbox.nylas_grant_id) {
    await admin
      .from("mailboxes")
      .update({ status: "needs_reauth" })
      .eq("id", mailbox.id)
      .eq("user_id", requestRow.user_id);
    await admin
      .from("jobs")
      .update({
        status: "pending",
        processing_started_at: null,
        last_error: "needs_reauth",
        run_at: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
      })
      .eq("id", job.id);
    return "retried";
  }

  const parsed = parseWorkflowDefinition(requestRow.definition_snapshot);
  if (!parsed.success || !requestRow.token_expires_at) {
    await failOrRetry(admin, job, requestRow.id, "invalid_payload", true);
    return "failed";
  }

  const { data: profile } = await admin
    .from("profiles")
    .select("business_name, display_name")
    .eq("id", requestRow.user_id)
    .maybeSingle();

  const token = createMagicLinkToken({
    requestId: requestRow.id,
    tokenVersion: requestRow.token_version,
    expiresAt: requestRow.token_expires_at,
  });
  const magicLinkUrl = buildMagicLinkUrl(token);
  const dueAt =
    parsed.data.schedule.type === "once"
      ? `${parsed.data.schedule.date}T${parsed.data.schedule.time}:00`
      : null;
  const email = buildRequestEmail({
    businessName: profile?.business_name || profile?.display_name || he.productName,
    recipientName: requestRow.recipient_name,
    subject: parsed.data.email.subject,
    body: parsed.data.email.body,
    magicLinkUrl,
    dueAt,
    isTest: requestRow.is_test,
    isReminder,
  });

  try {
    const sent = await sendGrantMessage({
      grantId: mailbox.nylas_grant_id,
      idempotencyKey: job.idempotency_key,
      subject: email.subject,
      body: email.html,
      toEmail: requestRow.recipient_email,
      toName: requestRow.recipient_name,
    });

    const sentAt = new Date().toISOString();
    await admin
      .from("jobs")
      .update({
        status: "succeeded",
        processing_started_at: null,
        last_error: null,
        payload: {
          ...job.payload,
          providerMessageId: sent.messageId,
        },
      })
      .eq("id", job.id);

    if (!isReminder) {
      await admin
        .from("requests")
        .update({ status: "sent", sent_at: requestRow.sent_at ?? sentAt })
        .eq("id", requestRow.id)
        .in("status", ["scheduled", "draft", "sent"]);

      await admin.from("request_events").insert({
        request_id: requestRow.id,
        type: "email_sent",
        payload: { providerMessageId: sent.messageId, idempotent: sent.idempotentResponse },
      });

      if (!requestRow.sent_at) {
        requestRow.sent_at = sentAt;
      }
    }

    return "succeeded";
  } catch (error) {
    if (isNylasError(error) && (error.status === 401 || error.status === 403)) {
      await admin
        .from("mailboxes")
        .update({ status: "needs_reauth" })
        .eq("id", mailbox.id)
        .eq("user_id", requestRow.user_id);
      await admin
        .from("jobs")
        .update({
          status: "pending",
          processing_started_at: null,
          last_error: "needs_reauth",
          run_at: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
        })
        .eq("id", job.id);
      return "retried";
    }

    if (isNylasError(error) && (error.status === 429 || error.status >= 500)) {
      await failOrRetry(admin, job, requestRow.id, "temporary", false);
      return job.attempts >= job.max_attempts ? "failed" : "retried";
    }

    if (isNylasError(error) && error.status === 409 && error.type === "api.concurrent_idempotent_request") {
      await admin
        .from("jobs")
        .update({
          status: "pending",
          processing_started_at: null,
          last_error: "temporary",
          run_at: new Date(Date.now() + 15_000).toISOString(),
        })
        .eq("id", job.id);
      return "retried";
    }

    await failOrRetry(admin, job, requestRow.id, "invalid_payload", true);
    return "failed";
  }
}

async function failOrRetry(
  admin: ReturnType<typeof createAdminClient>,
  job: JobRow,
  requestId: string,
  lastError: string,
  permanent: boolean,
) {
  if (permanent || job.attempts >= job.max_attempts) {
    await admin
      .from("jobs")
      .update({
        status: "failed",
        processing_started_at: null,
        last_error: lastError,
      })
      .eq("id", job.id);
    if ((job.attempts >= job.max_attempts || permanent) && job.type === "send_email") {
      await markRequestFailed(admin, requestId);
    }
    return;
  }

  await admin
    .from("jobs")
    .update({
      status: "pending",
      processing_started_at: null,
      last_error: lastError,
      run_at: new Date(Date.now() + backoffMs(job.attempts)).toISOString(),
    })
    .eq("id", job.id);
}

export async function processDueJobs(limit = 50): Promise<JobProcessCounters> {
  const admin = createAdminClient();
  const { data, error } = await admin.rpc("claim_due_jobs", { p_limit: limit });
  if (error) {
    throw error;
  }

  const jobs = (data ?? []) as JobRow[];
  const counters: JobProcessCounters = {
    processedJobs: jobs.length,
    succeededJobs: 0,
    failedJobs: 0,
    skippedJobs: 0,
  };

  for (const job of jobs) {
    let outcome: JobOutcome = "retried";
    if (job.type === "send_email") {
      outcome = await processSendEmailJob(job);
    } else if (job.type === "send_reminder") {
      outcome = await processSendReminderJob(job);
    } else {
      await admin
        .from("jobs")
        .update({
          status: "pending",
          processing_started_at: null,
          run_at: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000).toISOString(),
        })
        .eq("id", job.id);
      outcome = "retried";
    }

    if (outcome === "succeeded") {
      counters.succeededJobs += 1;
    } else if (outcome === "failed") {
      counters.failedJobs += 1;
    } else if (outcome === "skipped") {
      counters.skippedJobs += 1;
    }
  }

  return counters;
}
