"use client";

import { Eye, Link2, MoreHorizontal, Workflow } from "lucide-react";
import { useRouter } from "next/navigation";
import type { MouseEvent, ReactNode } from "react";

import { copyRequestLink } from "@/app/(app)/requests/copy-link-button";
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
      className="size-8 rounded-[10px] text-muted-foreground hover:text-foreground"
      aria-label={label}
      title={label}
      onClick={onClick}
    >
      {children}
    </Button>
  );
}

export function RequestRowActionCells({
  requestId,
  workflowId,
}: {
  requestId: string;
  workflowId: string;
}) {
  const router = useRouter();

  return (
    <>
      <TableCell
        className="text-center"
        onClick={stopRow}
        onPointerDown={stopRow}
        onKeyDown={(event) => event.stopPropagation()}
      >
        <RequestActionButton
          label={he.requests.columns.eventLink}
          onClick={() => void copyRequestLink(requestId)}
        >
          <Link2 className="size-4" />
        </RequestActionButton>
      </TableCell>
      <TableCell
        className="text-center"
        onClick={stopRow}
        onPointerDown={stopRow}
        onKeyDown={(event) => event.stopPropagation()}
      >
        <RequestActionButton
          label={he.requests.columns.viewProcess}
          onClick={() => router.push(`/workflows/${workflowId}`)}
        >
          <Workflow className="size-4" />
        </RequestActionButton>
      </TableCell>
      <TableCell
        className="pe-8 text-center"
        onClick={stopRow}
        onPointerDown={stopRow}
        onKeyDown={(event) => event.stopPropagation()}
      >
        <RequestActionButton
          label={he.requests.columns.actions}
          onClick={() => router.push(`/requests/${requestId}`)}
        >
          <Eye className="size-4" />
        </RequestActionButton>
      </TableCell>
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
          className={cn(buttonVariants({ variant: "ghost", size: "icon" }), "size-8 rounded-[10px]")}
          aria-label={he.actions.moreActions}
        >
          <MoreHorizontal className="size-4" />
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="min-w-48">
          <DropdownMenuItem onClick={() => void copyRequestLink(requestId)}>
            {he.actions.copyLink}
          </DropdownMenuItem>
          {includeFullPage ? (
            <DropdownMenuItem onClick={() => router.push(`/requests/${requestId}`)}>
              {he.actions.openFullPage}
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
