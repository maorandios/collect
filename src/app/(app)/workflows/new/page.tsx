import { loadEmptyStudioState } from "@/app/(app)/workflows/studio-load";
import { WorkflowStudio } from "@/components/workflows/workflow-studio";

export default async function NewWorkflowPage() {
  const initial = await loadEmptyStudioState();
  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <WorkflowStudio initial={initial} />
    </div>
  );
}
