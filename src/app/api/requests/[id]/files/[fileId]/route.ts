import { NextResponse } from "next/server";

import { requireUserApi } from "@/lib/auth/require-user";
import { he } from "@/lib/i18n/he";
import { createAdminClient } from "@/lib/supabase/admin";

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string; fileId: string }> },
) {
  const auth = await requireUserApi();
  if (auth.response || !auth.user || !auth.supabase) {
    return (
      auth.response ??
      NextResponse.json({ message: he.errors.unauthorized }, { status: 401 })
    );
  }

  const { id, fileId } = await params;
  const inline = new URL(request.url).searchParams.get("inline") === "1";
  const { data: file } = await auth.supabase
    .from("files")
    .select("storage_path, original_name")
    .eq("id", fileId)
    .eq("request_id", id)
    .maybeSingle();

  if (!file) {
    return NextResponse.json({ message: he.errors.notFound }, { status: 404 });
  }

  const admin = createAdminClient();
  const signed = inline
    ? await admin.storage.from("request-files").createSignedUrl(file.storage_path, 60)
    : await admin.storage
        .from("request-files")
        .createSignedUrl(file.storage_path, 60, { download: file.original_name });

  if (signed.error || !signed.data?.signedUrl) {
    return NextResponse.json({ message: he.errors.generic }, { status: 500 });
  }

  return NextResponse.redirect(signed.data.signedUrl);
}
