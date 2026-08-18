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
import { formatIsraelDateTime } from "@/lib/dates";
import { he } from "@/lib/i18n/he";
import { relatedName } from "@/lib/supabase/relations";
import { cn } from "@/lib/utils";

const statusLabels: Record<string, string> = {
  draft: he.statuses.draft,
  scheduled: he.statuses.scheduled,
  sent: he.statuses.sent,
  opened: he.statuses.opened,
  in_progress: he.statuses.in_progress,
  completed: he.statuses.completed,
  failed: he.statuses.failed,
  expired: he.statuses.expired,
};

export default async function RequestsPage() {
  const { supabase, user } = await requireUser();
  const { data: rows } = await supabase
    .from("requests")
    .select("id, recipient_name, recipient_email, scheduled_for, status, updated_at, workflows(name)")
    .eq("user_id", user.id)
    .eq("is_test", false)
    .order("created_at", { ascending: false });

  return (
    <div className="flex h-full min-h-full flex-col">
      <header className="flex items-center justify-between gap-4 border-b border-border bg-surface px-8 py-5">
        <h1 className="text-xl font-medium">{he.requests.title}</h1>
        <Link
          href="/workflows/new"
          className={cn(buttonVariants({ size: "lg" }), "h-10 px-4")}
        >
          {he.actions.createWorkflow}
        </Link>
      </header>
      <section className="flex-1 p-8">
        <div className="h-full overflow-hidden rounded-xl border border-border bg-surface shadow-sm">
          <Table>
            <TableHeader>
              <TableRow className="hover:bg-transparent">
                <TableHead>{he.requests.columns.workflow}</TableHead>
                <TableHead>{he.requests.columns.recipient}</TableHead>
                <TableHead>{he.requests.columns.email}</TableHead>
                <TableHead>{he.requests.columns.scheduledFor}</TableHead>
                <TableHead>{he.requests.columns.status}</TableHead>
                <TableHead>{he.requests.columns.lastActivity}</TableHead>
                <TableHead>{he.requests.columns.actions}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {!rows?.length ? (
                <TableRow className="hover:bg-transparent">
                  <TableCell colSpan={7} className="h-48 text-center">
                    <p className="font-medium text-foreground">{he.requests.emptyTitle}</p>
                    <p className="mt-2 text-sm text-muted-foreground">
                      {he.requests.emptyDescription}
                    </p>
                  </TableCell>
                </TableRow>
              ) : (
                rows.map((row) => (
                  <TableRow key={row.id}>
                    <TableCell>{relatedName(row.workflows)}</TableCell>
                    <TableCell>{row.recipient_name ?? "—"}</TableCell>
                    <TableCell>{row.recipient_email}</TableCell>
                    <TableCell>{formatIsraelDateTime(row.scheduled_for)}</TableCell>
                    <TableCell>{statusLabels[row.status] ?? row.status}</TableCell>
                    <TableCell>{formatIsraelDateTime(row.updated_at)}</TableCell>
                    <TableCell>
                      <Link href={`/requests/${row.id}`} className="hover:underline">
                        {he.actions.viewRequest}
                      </Link>
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </div>
      </section>
    </div>
  );
}
