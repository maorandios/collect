"use client";

import { toast } from "sonner";

import { getRequestMagicLink } from "@/app/(app)/requests/actions";
import { Button } from "@/components/ui/button";
import { he } from "@/lib/i18n/he";
import { cn } from "@/lib/utils";

export async function copyRequestLink(requestId: string) {
  const result = await getRequestMagicLink(requestId);
  if (!result.ok) {
    toast.error(result.message);
    return;
  }
  await navigator.clipboard.writeText(result.url);
  toast.success(he.requests.copySuccess);
}

export function CopyLinkButton({
  requestId,
  className,
}: {
  requestId: string;
  className?: string;
}) {
  return (
    <Button
      type="button"
      className={cn("h-10 rounded-[12px] px-4", className)}
      onClick={() => void copyRequestLink(requestId)}
    >
      {he.actions.copyLink}
    </Button>
  );
}
