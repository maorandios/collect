import { loadEmptyStudioState } from "@/app/(app)/workflows/studio-load";
import { WorkflowStudio } from "@/components/workflows/workflow-studio";
import { WizardIntake } from "@/components/workflows/wizard/wizard-intake";
import { getWorkflowWizardEnabled } from "@/lib/env";

export default async function NewWorkflowPage() {
  if (getWorkflowWizardEnabled()) {
    return (
      <div className="flex min-h-0 flex-1 flex-col">
        <WizardIntake />
      </div>
    );
  }

  const initial = await loadEmptyStudioState();
  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <WorkflowStudio initial={initial} />
    </div>
  );
}
