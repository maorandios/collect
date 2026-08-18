import { notFound } from "next/navigation";
import { requireUser } from "@/lib/auth/require-user";
import { WorkflowEditor } from "../new/workflow-editor";

export default async function EditWorkflowPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const { supabase, user } = await requireUser();
  const [{ data }, mailboxResult] = await Promise.all([
    supabase
      .from("workflows")
      .select("id, definition")
      .eq("id", id)
      .eq("user_id", user.id)
      .is("deleted_at", null)
      .maybeSingle(),
    supabase
      .from("mailboxes")
      .select("email, status")
      .eq("user_id", user.id)
      .eq("status", "connected")
      .limit(1)
      .maybeSingle(),
  ]);
  const mailbox = mailboxResult.data;

  if (!data) {
    notFound();
  }

  return (
    <WorkflowEditor
      workflowId={data.id}
      initialJson={JSON.stringify(data.definition, null, 2)}
      mailboxEmail={mailbox?.email ?? null}
    />
  );
}
