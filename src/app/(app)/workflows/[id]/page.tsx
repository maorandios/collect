import { notFound } from "next/navigation";

import { loadStudioState } from "@/app/(app)/workflows/studio-load";
import { WorkflowStudio } from "@/components/workflows/workflow-studio";

export default async function EditWorkflowPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const initial = await loadStudioState(id);
  if (!initial) {
    notFound();
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <WorkflowStudio initial={initial} />
    </div>
  );
}
