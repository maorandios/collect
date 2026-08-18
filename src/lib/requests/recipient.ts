import { createAdminClient } from "@/lib/supabase/admin";
import { he } from "@/lib/i18n/he";
import { getRecipientSession } from "@/lib/magic-link/session";
import { parseWorkflowDefinition } from "@/lib/workflow/schema";

export async function getRecipientRequest() {
  const session = await getRecipientSession();
  if (!session) {
    return null;
  }

  const admin = createAdminClient();
  const { data } = await admin
    .from("requests")
    .select("id, status, definition_snapshot, token_version, token_expires_at, user_id")
    .eq("id", session.requestId)
    .maybeSingle();

  if (!data) {
    return null;
  }

  const parsed = parseWorkflowDefinition(data.definition_snapshot);
  if (!parsed.success) {
    return null;
  }

  const { data: profile } = await admin
    .from("profiles")
    .select("business_name, display_name")
    .eq("id", data.user_id)
    .maybeSingle();

  const { data: submission } = await admin
    .from("submissions")
    .select("answers, is_draft")
    .eq("request_id", data.id)
    .maybeSingle();

  const { data: files } = await admin
    .from("files")
    .select("id, field_id, original_name")
    .eq("request_id", data.id)
    .order("created_at");

  return {
    ...data,
    definition: parsed.data,
    senderName: profile?.business_name || profile?.display_name || he.productName,
    draftAnswers: (submission?.answers ?? {}) as Record<string, unknown>,
    uploadedFiles: (files ?? []).map((file) => ({
      fieldId: file.field_id,
      name: file.original_name,
    })),
  };
}
