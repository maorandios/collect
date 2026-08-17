import Link from "next/link";

import { requireUser } from "@/lib/auth/require-user";
import { buttonVariants } from "@/components/ui/button";
import { he } from "@/lib/i18n/he";
import { cn } from "@/lib/utils";

export default async function WorkflowsPage() {
  await requireUser();

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
      <section className="flex flex-1 items-center justify-center p-8">
        <div className="rounded-xl border border-border bg-surface px-12 py-16 text-center shadow-sm">
          <p className="text-lg font-medium">{he.workflows.emptyTitle}</p>
          <p className="mt-2 text-sm text-muted-foreground">
            {he.workflows.emptyDescription}
          </p>
        </div>
      </section>
    </div>
  );
}
