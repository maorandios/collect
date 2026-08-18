"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";
import { useRouter } from "next/navigation";
import Link from "next/link";

import { pauseWorkflow, resumeWorkflow, deleteWorkflow } from "@/app/(app)/workflows/actions";
import { Button, buttonVariants } from "@/components/ui/button";
import { he } from "@/lib/i18n/he";
import { cn } from "@/lib/utils";

export function WorkflowRowActions({
  workflowId,
  status,
}: {
  workflowId: string;
  status: string;
}) {
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const [, startTransition] = useTransition();

  async function run(action: () => Promise<{ ok: boolean; message: string }>) {
    setPending(true);
    try {
      const result = await action();
      if (result.ok) {
        toast.success(result.message);
        startTransition(() => router.refresh());
      } else {
        toast.error(result.message);
      }
    } finally {
      setPending(false);
    }
  }

  return (
    <div className="flex flex-wrap justify-end gap-2">
      {status === "active" ? (
        <Button
          type="button"
          variant="outline"
          className="h-8 px-3"
          disabled={pending}
          onClick={() => void run(() => pauseWorkflow(workflowId))}
        >
          {he.actions.pause}
        </Button>
      ) : null}
      {status === "paused" ? (
        <Button
          type="button"
          variant="outline"
          className="h-8 px-3"
          disabled={pending}
          onClick={() => void run(() => resumeWorkflow(workflowId))}
        >
          {he.actions.resume}
        </Button>
      ) : null}
      <Link
        href={`/workflows/${workflowId}`}
        className={cn(buttonVariants({ variant: "outline" }), "h-8 px-3")}
      >
        {he.actions.edit}
      </Link>
      <Button
        type="button"
        variant="outline"
        className="h-8 px-3"
        disabled={pending}
        onClick={() => {
          if (!window.confirm(he.workflows.deleteConfirm)) {
            return;
          }
          void run(() => deleteWorkflow(workflowId));
        }}
      >
        {he.actions.delete}
      </Button>
    </div>
  );
}
