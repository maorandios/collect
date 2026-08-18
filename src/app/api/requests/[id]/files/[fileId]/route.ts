import { NextResponse } from "next/server";

import { requireUserApi } from "@/lib/auth/require-user";
import { he } from "@/lib/i18n/he";
import { createAdminClient } from "@/lib/supabase/admin";

export async function GET(
  _request: Request,
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
  const { data, error } = await admin.storage
    .from("request-files")
    .createSignedUrl(file.storage_path, 60, { download: file.original_name });

  if (error || !data?.signedUrl) {
    return NextResponse.json({ message: he.errors.generic }, { status: 500 });
  }

  return NextResponse.redirect(data.signedUrl);
}
