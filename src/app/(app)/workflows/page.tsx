import Link from "next/link";

import { requireUser } from "@/lib/auth/require-user";
import { buttonVariants } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { WorkflowRowActions } from "@/components/workflows/workflow-row-actions";
import { he } from "@/lib/i18n/he";
import { cn } from "@/lib/utils";
import { formatIsraelDateTime } from "@/lib/dates";
import { scheduleTypeLabel } from "@/lib/schedule/labels";
import { parseWorkflowDefinition } from "@/lib/workflow/schema";

const statusLabels: Record<string, string> = {
  draft: he.statuses.draft,
  active: he.statuses.active,
  paused: he.statuses.paused,
  completed: he.statuses.completed,
};

const openStatuses = new Set(["scheduled", "sent", "opened", "in_progress"]);

export default async function WorkflowsPage() {
  const { supabase, user } = await requireUser();
  const [{ data: workflows }, { data: requestRows }] = await Promise.all([
    supabase
      .from("workflows")
      .select("id, name, status, next_run_at, definition, updated_at, deleted_at")
      .eq("user_id", user.id)
      .is("deleted_at", null)
      .order("created_at", { ascending: false }),
    supabase
      .from("requests")
      .select("workflow_id, status, is_test, updated_at")
      .eq("user_id", user.id)
      .eq("is_test", false),
  ]);

  const openCounts = new Map<string, number>();
  const lastActivity = new Map<string, string>();
  for (const row of requestRows ?? []) {
    if (openStatuses.has(row.status)) {
      openCounts.set(row.workflow_id, (openCounts.get(row.workflow_id) ?? 0) + 1);
    }
    const current = lastActivity.get(row.workflow_id);
    if (!current || new Date(row.updated_at).getTime() > new Date(current).getTime()) {
      lastActivity.set(row.workflow_id, row.updated_at);
    }
  }

  return (
    <div className="flex h-full min-h-full flex-col">
      <header className="flex items-center justify-between gap-4 border-b border-border bg-surface px-8 py-5">
        <h1 className="text-xl font-medium">{he.workflows.title}</h1>
        <Link
          href="/workflows/new"
          className={cn(buttonVariants({ size: "lg" }), "h-10 px-4")}
        >
          {he.actions.createWorkflow}
        </Link>
      </header>
      <section className="flex-1 p-8">
        {!workflows?.length ? (
          <div className="flex h-full items-center justify-center rounded-xl border border-border bg-surface text-center shadow-sm">
            <div>
              <p className="text-lg font-medium">{he.workflows.emptyTitle}</p>
              <p className="mt-2 text-sm text-muted-foreground">
                {he.workflows.emptyDescription}
              </p>
            </div>
          </div>
        ) : (
          <div className="overflow-hidden rounded-xl border border-border bg-surface shadow-sm">
            <Table>
              <TableHeader>
                <TableRow className="hover:bg-transparent">
                  <TableHead>{he.workflows.columns.name}</TableHead>
                  <TableHead>{he.workflows.columns.schedule}</TableHead>
                  <TableHead>{he.workflows.columns.nextRun}</TableHead>
                  <TableHead>{he.workflows.columns.lastActivity}</TableHead>
                  <TableHead>{he.workflows.columns.openRequests}</TableHead>
                  <TableHead>{he.workflows.columns.status}</TableHead>
                  <TableHead className="text-end">{he.workflows.columns.actions}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {workflows.map((workflow) => {
                  const parsed = parseWorkflowDefinition(workflow.definition);
                  const schedule = parsed.success
                    ? scheduleTypeLabel(parsed.data.schedule)
                    : "—";
                  return (
                    <TableRow key={workflow.id}>
                      <TableCell>
                        <Link href={`/workflows/${workflow.id}`} className="hover:underline">
                          {workflow.name}
                        </Link>
                      </TableCell>
                      <TableCell>{schedule}</TableCell>
                      <TableCell>{formatIsraelDateTime(workflow.next_run_at)}</TableCell>
                      <TableCell>
                        {formatIsraelDateTime(lastActivity.get(workflow.id) ?? workflow.updated_at)}
                      </TableCell>
                      <TableCell>{openCounts.get(workflow.id) ?? 0}</TableCell>
                      <TableCell>{statusLabels[workflow.status] ?? workflow.status}</TableCell>
                      <TableCell>
                        <WorkflowRowActions workflowId={workflow.id} status={workflow.status} />
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </div>
        )}
      </section>
    </div>
  );
}
