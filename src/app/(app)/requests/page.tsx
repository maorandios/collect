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
import { he } from "@/lib/i18n/he";
import { cn } from "@/lib/utils";

export default async function RequestsPage() {
  await requireUser();

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
              <TableRow className="hover:bg-transparent">
                <TableCell colSpan={7} className="h-48 text-center">
                  <p className="font-medium text-foreground">
                    {he.requests.emptyTitle}
                  </p>
                  <p className="mt-2 text-sm text-muted-foreground">
                    {he.requests.emptyDescription}
                  </p>
                </TableCell>
              </TableRow>
            </TableBody>
          </Table>
        </div>
      </section>
    </div>
  );
}
