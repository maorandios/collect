"use client";

import { toast } from "sonner";

import { getRequestMagicLink } from "@/app/(app)/requests/actions";
import { Button } from "@/components/ui/button";
import { he } from "@/lib/i18n/he";

export function CopyLinkButton({ requestId }: { requestId: string }) {
  async function onCopy() {
    const result = await getRequestMagicLink(requestId);
    if (!result.ok) {
      toast.error(result.message);
      return;
    }
    await navigator.clipboard.writeText(result.url);
    toast.success(he.requests.copySuccess);
  }

  return (
    <Button type="button" className="h-10" onClick={() => void onCopy()}>
      {he.actions.copyLink}
    </Button>
  );
}
