import { requireUser } from "@/lib/auth/require-user";
import { WorkflowEditor } from "./workflow-editor";

export default async function NewWorkflowPage() {
  const { supabase, user } = await requireUser();
  const { data: mailbox } = await supabase
    .from("mailboxes")
    .select("email, status")
    .eq("user_id", user.id)
    .eq("status", "connected")
    .limit(1)
    .maybeSingle();

  return <WorkflowEditor mailboxEmail={mailbox?.email ?? null} />;
}
