"use client";

import { FileText, MoreHorizontal, Send, Telescope } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState, type MouseEvent, type ReactNode } from "react";

import { copyRequestLink } from "@/app/(app)/requests/copy-link-button";
import { NudgeEventModal } from "@/components/requests/nudge-event-modal";
import { Button, buttonVariants } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { TableCell } from "@/components/ui/table";
import { he } from "@/lib/i18n/he";
import { cn } from "@/lib/utils";

function stopRow(event: MouseEvent) {
  event.stopPropagation();
}

function RequestActionButton({
  label,
  onClick,
  children,
}: {
  label: string;
  onClick: () => void;
  children: ReactNode;
}) {
  return (
    <Button
      type="button"
      variant="ghost"
      size="icon"
      className="size-8 cursor-pointer rounded-[10px] text-muted-foreground hover:text-foreground"
      aria-label={label}
      title={label}
      onClick={onClick}
    >
      {children}
    </Button>
  );
}

export function RequestRowActionCells({
  onSummary,
  onView,
}: {
  onSummary: () => void;
  onView: () => void;
}) {
  const [nudgeOpen, setNudgeOpen] = useState(false);

  return (
    <>
      <TableCell className="text-center">
        <RequestActionButton
          label={he.requests.columns.nudgeEvent}
          onClick={() => setNudgeOpen(true)}
        >
          <Send className="size-4" />
        </RequestActionButton>
      </TableCell>
      <TableCell className="text-center">
        <RequestActionButton label={he.requests.columns.summary} onClick={onSummary}>
          <FileText className="size-4" />
        </RequestActionButton>
      </TableCell>
      <TableCell className="pe-8 text-center">
        <RequestActionButton label={he.requests.columns.view} onClick={onView}>
          <Telescope className="size-4" />
        </RequestActionButton>
      </TableCell>
      <NudgeEventModal open={nudgeOpen} onClose={() => setNudgeOpen(false)} />
    </>
  );
}

export function RequestActionsMenu({
  requestId,
  workflowId,
  includeFullPage = true,
}: {
  requestId: string;
  workflowId: string;
  includeFullPage?: boolean;
}) {
  const router = useRouter();

  return (
    <div onClick={stopRow} onPointerDown={stopRow} onKeyDown={(event) => event.stopPropagation()}>
      <DropdownMenu>
        <DropdownMenuTrigger
          className={cn(buttonVariants({ variant: "ghost", size: "icon" }), "size-8 cursor-pointer rounded-[10px]")}
          aria-label={he.actions.moreActions}
        >
          <MoreHorizontal className="size-4" />
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="min-w-48">
          <DropdownMenuItem onClick={() => void copyRequestLink(requestId)}>
            {he.requests.columns.nudgeEvent}
          </DropdownMenuItem>
          {includeFullPage ? (
            <DropdownMenuItem onClick={() => router.push(`/requests/${requestId}`)}>
              {he.requests.columns.summary}
            </DropdownMenuItem>
          ) : null}
          <DropdownMenuItem onClick={() => router.push(`/workflows/${workflowId}`)}>
            {he.actions.goToProcess}
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
}
