"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";

import { saveWorkflowDraft, activateWorkflow } from "@/app/(app)/workflows/actions";
import { Button } from "@/components/ui/button";
import { JsonEditor } from "@/components/workflows/json-editor";
import { PreviewPanel } from "@/components/workflows/preview-panel";
import { he } from "@/lib/i18n/he";
import { roniExampleWorkflow } from "@/lib/workflow/example";
import { parseWorkflowDefinition, type WorkflowDefinition } from "@/lib/workflow/schema";

export function WorkflowEditor({
  workflowId,
  initialJson,
}: {
  workflowId?: string;
  initialJson?: string;
}) {
  const router = useRouter();
  const [id, setId] = useState(workflowId);
  const [jsonText, setJsonText] = useState(
    initialJson ?? JSON.stringify(roniExampleWorkflow, null, 2),
  );
  const [pending, setPending] = useState(false);

  const parsed = useMemo(() => {
    try {
      return parseWorkflowDefinition(JSON.parse(jsonText));
    } catch {
      return { success: false as const, error: null, data: undefined };
    }
  }, [jsonText]);

  const definition: WorkflowDefinition | null = parsed.success ? parsed.data : null;
  const issues = parsed.success
    ? []
    : [he.workflows.invalidJson];

  async function onSaveDraft() {
    setPending(true);
    try {
      const result = await saveWorkflowDraft({ workflowId: id, jsonText });
      if (result.ok) {
        if (result.workflowId) {
          setId(result.workflowId);
          if (result.workflowId !== id) {
            router.replace(`/workflows/${result.workflowId}`);
          } else {
            router.refresh();
          }
        }
        toast.success(result.message);
      } else {
        toast.error(result.message);
      }
    } finally {
      setPending(false);
    }
  }

  async function onActivate() {
    setPending(true);
    try {
      const result = await activateWorkflow({ workflowId: id, jsonText });
      if (result.ok) {
        toast.success(result.message);
      } else {
        toast.error(result.message);
      }
    } finally {
      setPending(false);
    }
  }

  return (
    <div className="grid h-full min-h-0 grid-cols-1 overflow-hidden xl:grid-cols-2">
      <section className="flex min-h-0 flex-col border-b border-border xl:border-b-0 xl:border-e">
        <div className="flex items-center justify-between gap-3 border-b border-border bg-surface px-6 py-4">
          <div>
            <h1 className="text-lg font-medium">{he.workflows.newTitle}</h1>
            <p className="text-sm text-muted-foreground">{he.workflows.jsonHelp}</p>
          </div>
          <Button
            type="button"
            variant="outline"
            className="h-9"
            onClick={() => setJsonText(JSON.stringify(roniExampleWorkflow, null, 2))}
          >
            {he.actions.loadExample}
          </Button>
        </div>
        <div dir="ltr" className="min-h-0 flex-1 p-6">
          <JsonEditor value={jsonText} onChange={setJsonText} />
        </div>
        <div className="flex gap-3 border-t border-border bg-surface px-6 py-4">
          <Button type="button" variant="outline" className="h-10" disabled={pending} onClick={onSaveDraft}>
            {pending ? he.loading.saving : he.actions.saveDraft}
          </Button>
          <Button type="button" className="h-10" disabled={pending} onClick={onActivate}>
            {he.actions.publish}
          </Button>
        </div>
      </section>
      <section className="min-h-0 bg-background p-6">
        <PreviewPanel definition={definition} issues={issues} />
      </section>
    </div>
  );
}
