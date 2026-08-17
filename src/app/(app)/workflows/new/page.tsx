import { requireUser } from "@/lib/auth/require-user";
import { he } from "@/lib/i18n/he";

export default async function NewWorkflowPage() {
  await requireUser();

  return (
    <div className="flex h-full min-h-full flex-col">
      <header className="border-b border-border bg-surface px-8 py-5">
        <h1 className="text-xl font-medium">{he.workflows.newTitle}</h1>
      </header>
      <section className="flex flex-1 items-center justify-center p-8">
        <div className="max-w-lg rounded-xl border border-border bg-surface px-12 py-16 text-center shadow-sm">
          <p className="text-lg font-medium">{he.workflows.newTitle}</p>
          <p className="mt-2 text-sm text-muted-foreground">
            {he.workflows.newDescription}
          </p>
        </div>
      </section>
    </div>
  );
}
