import { NextResponse } from "next/server";
import { randomUUID } from "node:crypto";

import { he } from "@/lib/i18n/he";
import { getRecipientRequest } from "@/lib/requests/recipient";
import { createAdminClient } from "@/lib/supabase/admin";
import { resolvedAllowedMimeTypes } from "@/lib/workflow/file-formats";

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
    fileName?: string;
    mimeType?: string;
    sizeBytes?: number;
  };

  const field = requestRow.definition.fields.find((item) => item.id === body.fieldId);
  if (!field || field.type !== "file") {
    return NextResponse.json({ message: he.errors.notFound }, { status: 400 });
  }

  if (!body.fileName || !body.mimeType || !body.sizeBytes) {
    return NextResponse.json({ message: he.validation.required }, { status: 400 });
  }

  if (!resolvedAllowedMimeTypes(field.allowedMimeTypes).includes(body.mimeType)) {
    return NextResponse.json({ message: he.recipient.fileType }, { status: 400 });
  }

  if (body.sizeBytes > field.maxFileSizeMb * 1024 * 1024) {
    return NextResponse.json({ message: he.recipient.fileSize }, { status: 400 });
  }

  const admin = createAdminClient();
  const { count } = await admin
    .from("files")
    .select("id", { count: "exact", head: true })
    .eq("request_id", requestRow.id)
    .eq("field_id", field.id);

  if ((count ?? 0) >= field.maxFiles) {
    return NextResponse.json({ message: he.recipient.fileCount }, { status: 400 });
  }

  const safeName = body.fileName.replaceAll(/[^a-zA-Z0-9.\-_\u0590-\u05FF]/g, "_");
  const path = `${requestRow.id}/${field.id}/${randomUUID()}-${safeName}`;
  const { data, error } = await admin.storage
    .from("request-files")
    .createSignedUploadUrl(path);

  if (error || !data) {
    return NextResponse.json({ message: he.errors.saveFailed }, { status: 500 });
  }

  return NextResponse.json({
    path,
    token: data.token,
    signedUrl: data.signedUrl,
  });
}
