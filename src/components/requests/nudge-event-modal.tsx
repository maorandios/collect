"use client";

import { Dialog } from "@base-ui/react/dialog";
import { X } from "lucide-react";

import { buttonVariants } from "@/components/ui/button";
import { he } from "@/lib/i18n/he";
import { cn } from "@/lib/utils";

export function NudgeEventModal({
  open,
  onClose,
}: {
  open: boolean;
  onClose: () => void;
}) {
  return (
    <Dialog.Root open={open} onOpenChange={(nextOpen) => (!nextOpen ? onClose() : undefined)}>
      <Dialog.Portal>
        <Dialog.Backdrop
          className={cn(
            "fixed inset-0 z-50 bg-[#111827]/35 backdrop-blur-md",
            "transition-all duration-200 ease-out",
            "data-[starting-style]:opacity-0 data-[ending-style]:opacity-0",
          )}
        />
        <Dialog.Popup
          className={cn(
            "fixed top-1/2 left-1/2 z-50 w-[min(32rem,calc(100vw-2rem))] -translate-x-1/2 -translate-y-1/2",
            "rounded-2xl border border-border bg-surface p-6 shadow-[0_24px_48px_rgba(17,24,39,0.16)] outline-none",
            "transition-all duration-200 ease-out",
            "data-[starting-style]:scale-95 data-[starting-style]:opacity-0",
            "data-[ending-style]:scale-95 data-[ending-style]:opacity-0",
          )}
          aria-describedby={undefined}
        >
          <div className="flex items-start justify-between gap-4">
            <Dialog.Title className="text-lg font-semibold tracking-tight">
              {he.requests.columns.nudgeEvent}
            </Dialog.Title>
            <Dialog.Close
              className={cn(
                buttonVariants({ variant: "ghost", size: "icon" }),
                "size-9 shrink-0 cursor-pointer rounded-[12px]",
              )}
              aria-label={he.actions.close}
            >
              <X className="size-4" />
            </Dialog.Close>
          </div>
        </Dialog.Popup>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
