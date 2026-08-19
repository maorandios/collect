import "server-only";

import { enqueueSendEmailJobs } from "@/lib/jobs/enqueue";
import { processDueJobs, type JobProcessCounters } from "@/lib/jobs/worker";
import { createRequestsForRun } from "@/lib/requests/create";
import { computeFollowingRun } from "@/lib/schedule/next-run";
import { createAdminClient } from "@/lib/supabase/admin";
import { parseWorkflowDefinition } from "@/lib/workflow/schema";

type WorkflowRow = {
  id: string;
  user_id: string;
  definition: unknown;
  sender_mailbox_id: string | null;
  next_run_at: string | null;
  status: string;
};

const WORKFLOW_LIMIT = 20;
const JOB_LIMIT = 50;

export type CronTickCounters = JobProcessCounters & {
  claimedWorkflows: number;
  createdRequests: number;
};

export async function runCronTick(): Promise<CronTickCounters> {
  const admin = createAdminClient();
  const { data, error } = await admin.rpc("claim_due_workflows", { p_limit: WORKFLOW_LIMIT });
  if (error) {
    throw error;
  }

  const workflows = (data ?? []) as WorkflowRow[];
  let createdRequests = 0;

  for (const workflow of workflows) {
    createdRequests += await processClaimedWorkflow(admin, workflow);
  }

  const jobCounters = await processDueJobs(JOB_LIMIT);
  return {
    claimedWorkflows: workflows.length,
    createdRequests,
    ...jobCounters,
  };
}

async function processClaimedWorkflow(
  admin: ReturnType<typeof createAdminClient>,
  workflow: WorkflowRow,
) {
  const parsed = parseWorkflowDefinition(workflow.definition);
  const scheduledFor = workflow.next_run_at ? new Date(workflow.next_run_at) : null;

  if (!parsed.success || !scheduledFor || parsed.data.schedule.type === "send_now" || parsed.data.schedule.type === "manual") {
    await admin
      .from("workflows")
      .update({
        next_run_at: null,
        run_claimed_at: null,
        status: parsed.success && parsed.data.schedule.type === "send_now" ? "completed" : workflow.status,
      })
      .eq("id", workflow.id);
    return 0;
  }

  const created = await createRequestsForRun({
    workflowId: workflow.id,
    userId: workflow.user_id,
    mailboxId: workflow.sender_mailbox_id,
    definition: parsed.data,
    scheduledFor,
    isTest: false,
  });

  await enqueueSendEmailJobs(created, scheduledFor);

  const following = computeFollowingRun(parsed.data.schedule, scheduledFor, new Date());
  const complete = parsed.data.schedule.type === "once" || !following;
  await admin
    .from("workflows")
    .update({
      next_run_at: following ? following.toISOString() : null,
      run_claimed_at: null,
    })
    .eq("id", workflow.id)
    .eq("status", "active");
  if (complete) {
    await admin
      .from("workflows")
      .update({ status: "completed", next_run_at: null, run_claimed_at: null })
      .eq("id", workflow.id);
  }

  return created.length;
}
