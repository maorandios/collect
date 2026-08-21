import { NextResponse } from "next/server";

import { he } from "@/lib/i18n/he";
import { markFillingStarted } from "@/lib/requests/mark-opened";
import { getRecipientRequest } from "@/lib/requests/recipient";
import { createAdminClient } from "@/lib/supabase/admin";

export async function POST(request: Request) {
  const requestRow = await getRecipientRequest();
  if (!requestRow) {
    return NextResponse.json({ message: he.recipient.missingSession }, { status: 401 });
  }

  if (requestRow.status === "completed") {
    return NextResponse.json({ message: he.recipient.completedAlready }, { status: 409 });
  }

  const body = (await request.json()) as {
    fieldId?: string;
    path?: string;
    originalName?: string;
    mimeType?: string;
    sizeBytes?: number;
  };

  if (!body.fieldId || !body.path || !body.originalName || !body.mimeType || !body.sizeBytes) {
    return NextResponse.json({ message: he.validation.required }, { status: 400 });
  }

  if (!body.path.startsWith(`${requestRow.id}/${body.fieldId}/`)) {
    return NextResponse.json({ message: he.errors.forbidden }, { status: 403 });
  }

  const admin = createAdminClient();
  const folder = body.path.split("/").slice(0, -1).join("/");
  const fileName = body.path.split("/").at(-1);
  const { data } = await admin.storage.from("request-files").list(folder);
  const exists = data?.some((file) => file.name === fileName);
  if (!exists) {
    return NextResponse.json({ message: he.errors.notFound }, { status: 400 });
  }

  const { error } = await admin.from("files").insert({
    request_id: requestRow.id,
    field_id: body.fieldId,
    storage_path: body.path,
    original_name: body.originalName,
    mime_type: body.mimeType,
    size_bytes: body.sizeBytes,
  });

  if (error) {
    return NextResponse.json({ message: he.errors.saveFailed }, { status: 500 });
  }

  await markFillingStarted(requestRow.id, admin);
  return NextResponse.json({ ok: true, message: he.recipient.uploaded });
}
