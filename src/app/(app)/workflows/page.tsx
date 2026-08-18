import Link from "next/link";

import { requireUser } from "@/lib/auth/require-user";
import { buttonVariants } from "@/components/ui/button";
import { he } from "@/lib/i18n/he";
import { cn } from "@/lib/utils";
import { formatIsraelDateTime } from "@/lib/dates";

export default async function WorkflowsPage() {
  const { supabase, user } = await requireUser();
  const { data: workflows } = await supabase
    .from("workflows")
    .select("id, name, status, next_run_at, definition, deleted_at")
    .eq("user_id", user.id)
    .is("deleted_at", null)
    .order("created_at", { ascending: false });

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
            <table className="w-full text-sm">
              <thead className="border-b border-border text-start">
                <tr className="text-muted-foreground">
                  <th className="px-4 py-3 font-medium">{he.workflows.columns.name}</th>
                  <th className="px-4 py-3 font-medium">{he.workflows.columns.recipients}</th>
                  <th className="px-4 py-3 font-medium">{he.workflows.columns.nextRun}</th>
                  <th className="px-4 py-3 font-medium">{he.workflows.columns.status}</th>
                </tr>
              </thead>
              <tbody>
                {workflows.map((workflow) => {
                  const definition = workflow.definition as { recipients?: unknown[] } | null;
                  const recipients = Array.isArray(definition?.recipients)
                    ? definition.recipients.length
                    : 0;
                  return (
                    <tr key={workflow.id} className="border-b border-border last:border-0">
                      <td className="px-4 py-3">
                        <Link href={`/workflows/${workflow.id}`} className="hover:underline">
                          {workflow.name}
                        </Link>
                      </td>
                      <td className="px-4 py-3">{recipients}</td>
                      <td className="px-4 py-3">{formatIsraelDateTime(workflow.next_run_at)}</td>
                      <td className="px-4 py-3">
                        {workflow.status === "active" ? he.statuses.active : workflow.status === "paused" ? he.statuses.paused : he.statuses.draft}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}
