import { NextResponse } from "next/server";

import { he } from "@/lib/i18n/he";
import { getRecipientRequest } from "@/lib/requests/recipient";
import { createAdminClient } from "@/lib/supabase/admin";
import type { WorkflowField } from "@/lib/workflow/schema";

function validateAnswers(answers: Record<string, unknown>, fields: WorkflowField[]) {
  for (const field of fields) {
    if (!field.required || field.type === "file") {
      continue;
    }
    const value = answers[field.id];
    if (field.type === "confirmation" && value !== true) {
      return he.validation.confirmRequired;
    }
    if (value === undefined || value === null || value === "") {
      return he.validation.required;
    }
  }
  return null;
}

export async function POST(request: Request) {
  const requestRow = await getRecipientRequest();
  if (!requestRow) {
    return NextResponse.json({ message: he.recipient.missingSession }, { status: 401 });
  }
  if (requestRow.status === "completed") {
    return NextResponse.json({ message: he.recipient.completedAlready }, { status: 409 });
  }

  const body = (await request.json()) as { answers?: Record<string, unknown> };
  const answers = body.answers ?? {};
  const validationError = validateAnswers(answers, requestRow.definition.fields);
  if (validationError) {
    return NextResponse.json({ message: validationError }, { status: 400 });
  }

  const admin = createAdminClient();
  const requiredFileFields = requestRow.definition.fields.filter(
    (field) => field.type === "file" && field.required,
  );

  for (const field of requiredFileFields) {
    const { count } = await admin
      .from("files")
      .select("id", { count: "exact", head: true })
      .eq("request_id", requestRow.id)
      .eq("field_id", field.id);
    if (!count) {
      return NextResponse.json({ message: he.validation.required }, { status: 400 });
    }
  }

  const { data: existing } = await admin
    .from("submissions")
    .select("id")
    .eq("request_id", requestRow.id)
    .maybeSingle();

  const submittedAt = new Date().toISOString();
  if (existing) {
    await admin
      .from("submissions")
      .update({ answers, is_draft: false, submitted_at: submittedAt })
      .eq("id", existing.id);
  } else {
    await admin.from("submissions").insert({
      request_id: requestRow.id,
      answers,
      is_draft: false,
      submitted_at: submittedAt,
    });
  }

  await admin
    .from("requests")
    .update({ status: "completed", completed_at: submittedAt })
    .eq("id", requestRow.id);

  await admin.from("request_events").insert({
    request_id: requestRow.id,
    type: "submitted",
    payload: {},
  });

  return NextResponse.json({ ok: true });
}
