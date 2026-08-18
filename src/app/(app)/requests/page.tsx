import { requireUser } from "@/lib/auth/require-user";
import { RequestsWorkspace } from "@/components/requests/requests-workspace";
import { REQUEST_DETAIL_SELECT, mapRequestRow } from "@/lib/requests/display";
import { parseRequestListQuery } from "@/lib/requests/query-params";

export default async function RequestsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { supabase, user } = await requireUser();
  const query = parseRequestListQuery(await searchParams);

  const { data: rows, error } = await supabase
    .from("requests")
    .select(REQUEST_DETAIL_SELECT)
    .eq("user_id", user.id)
    .eq("is_test", false)
    .order("created_at", { ascending: false });

  if (error) {
    throw error;
  }

  const items = (rows ?? []).map(mapRequestRow);

  return <RequestsWorkspace items={items} query={query} />;
}
