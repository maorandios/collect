import { notFound } from "next/navigation";

import { loadStudioState } from "@/app/(app)/workflows/studio-load";
import { WorkflowStudio } from "@/components/workflows/workflow-studio";
import { WorkflowWizard } from "@/components/workflows/wizard/workflow-wizard";
import { getWorkflowWizardEnabled } from "@/lib/env";
import { parseWizardStep } from "@/lib/workflow/wizard-completion";

export default async function EditWorkflowPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ step?: string }>;
}) {
  const { id } = await params;
  const { step } = await searchParams;
  const initial = await loadStudioState(id);
  if (!initial) {
    notFound();
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      {getWorkflowWizardEnabled() ? (
        <WorkflowWizard initial={initial} initialStep={parseWizardStep(step)} />
      ) : (
        <WorkflowStudio initial={initial} />
      )}
    </div>
  );
}
