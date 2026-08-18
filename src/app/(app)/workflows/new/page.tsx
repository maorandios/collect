import { requireUser } from "@/lib/auth/require-user";
import { WorkflowEditor } from "./workflow-editor";

export default async function NewWorkflowPage() {
  await requireUser();
  return <WorkflowEditor />;
}
