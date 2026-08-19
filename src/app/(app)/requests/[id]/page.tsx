import Link from "next/link";
import { notFound } from "next/navigation";

import { CopyLinkButton } from "@/app/(app)/requests/copy-link-button";
import { RequestDetails } from "@/components/requests/request-details";
import { buttonVariants } from "@/components/ui/button";
import { requireUser } from "@/lib/auth/require-user";
import { he } from "@/lib/i18n/he";
import { REQUEST_DETAIL_SELECT, mapRequestRow } from "@/lib/requests/display";
import { cn } from "@/lib/utils";

export default async function RequestDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const { supabase, user } = await requireUser();
  const { data: requestRow, error } = await supabase
    .from("requests")
    .select(REQUEST_DETAIL_SELECT)
    .eq("id", id)
    .eq("user_id", user.id)
    .eq("is_test", false)
    .maybeSingle();

  if (error) {
    throw error;
  }
  if (!requestRow) {
    notFound();
  }

  const item = mapRequestRow(requestRow);

  return (
    <div className="h-full min-h-0 overflow-auto">
      <header className="flex items-center justify-between gap-4 border-b border-border bg-surface px-8 py-5">
        <Link href="/requests" className={cn(buttonVariants({ variant: "outline" }), "h-10 rounded-[12px] px-3")}>
          {he.actions.back}
        </Link>
        <CopyLinkButton requestId={item.id} />
      </header>
      <section className="mx-auto max-w-3xl p-8">
        <RequestDetails item={item} />
      </section>
    </div>
  );
}
