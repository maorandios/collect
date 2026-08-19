"use client";

import { Dialog } from "@base-ui/react/dialog";
import Link from "next/link";
import { X } from "lucide-react";
import { useState } from "react";

import { RequestDetails } from "@/components/requests/request-details";
import { buttonVariants } from "@/components/ui/button";
import { he } from "@/lib/i18n/he";
import type { RequestListItem } from "@/lib/requests/display";
import { cn } from "@/lib/utils";

export function RequestPanel({
  item,
  onClose,
}: {
  item: RequestListItem | null;
  onClose: () => void;
}) {
  const [displayed, setDisplayed] = useState(item);
  if (item && item !== displayed) {
    setDisplayed(item);
  }

  return (
    <Dialog.Root
      open={Boolean(item)}
      onOpenChange={(open) => (!open ? onClose() : undefined)}
      onOpenChangeComplete={(open) => {
        if (!open) {
          setDisplayed(null);
        }
      }}
    >
      <Dialog.Portal>
        <Dialog.Backdrop
          className={cn(
            "fixed inset-0 z-50 bg-[#111827]/35 backdrop-blur-md",
            "transition-all duration-300 ease-out",
            "data-[starting-style]:opacity-0 data-[ending-style]:opacity-0",
          )}
        />
        <Dialog.Popup
          className={cn(
            "fixed inset-y-0 right-0 z-50 flex h-dvh w-[min(42.5rem,100vw)] max-w-[680px] flex-col border-l border-border bg-surface outline-none",
            "shadow-[-24px_0_48px_rgba(17,24,39,0.14)]",
            "transition-transform duration-[400ms] ease-[cubic-bezier(0.22,1,0.36,1)]",
            "data-[starting-style]:translate-x-full data-[ending-style]:translate-x-full",
          )}
          aria-describedby={undefined}
        >
          {displayed ? (
            <div className="min-h-0 flex-1 overflow-y-auto bg-background p-5">
              <Dialog.Title className="sr-only">{displayed.processName}</Dialog.Title>
              <RequestDetails
                item={displayed}
                titleAs="h2"
                trailing={
                  <>
                    <Link
                      href={`/requests/${displayed.id}`}
                      className={cn(buttonVariants({ variant: "outline" }), "h-10 rounded-[12px] px-3")}
                    >
                      {he.actions.openFullPage}
                    </Link>
                    <Dialog.Close
                      className={cn(buttonVariants({ variant: "ghost", size: "icon" }), "size-10 rounded-[12px]")}
                      aria-label={he.actions.close}
                    >
                      <X className="size-4" />
                    </Dialog.Close>
                  </>
                }
              />
            </div>
          ) : null}
        </Dialog.Popup>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
