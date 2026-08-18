"use client";

import { useRouter } from "next/navigation";
import type { KeyboardEvent, MouseEvent } from "react";

import { RequestRowActionCells } from "@/components/requests/request-actions-menu";
import { StatusBadge } from "@/components/status/status-badge";
import { TableCell, TableRow } from "@/components/ui/table";
import { formatIsraelDateTime } from "@/lib/dates";
import {
  computeProgress,
  fileCountLabel,
  lastActivityAt,
  recipientLabel,
  recurrenceLabel,
  type RequestListItem,
} from "@/lib/requests/display";
import type { RequestListQuery } from "@/lib/requests/query-params";
import { requestListHref } from "@/lib/requests/query-params";
import { cn } from "@/lib/utils";

export function RequestTableRow({
  item,
  index,
  query,
}: {
  item: RequestListItem;
  index: number;
  query: RequestListQuery;
}) {
  const router = useRouter();
  const href = requestListHref(query, { request: item.id });
  const recipient = recipientLabel(item.recipientName, item.recipientEmail);
  const progress = computeProgress(item.fields, item.answers, item.files);
  const selected = query.request === item.id;

  function open() {
    router.replace(href);
  }

  function onRowClick(event: MouseEvent<HTMLTableRowElement>) {
    if (event.defaultPrevented) {
      return;
    }
    const target = event.target as HTMLElement;
    if (target.closest("a, button, [role='menu'], [data-slot='dropdown-menu']")) {
      return;
    }
    open();
  }

  function onRowKeyDown(event: KeyboardEvent<HTMLTableRowElement>) {
    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      open();
    }
  }

  return (
    <TableRow
      className={cn(
        "cursor-pointer hover:bg-hover",
        selected && "bg-primary/5",
      )}
      tabIndex={0}
      aria-selected={selected}
      onClick={onRowClick}
      onKeyDown={onRowKeyDown}
    >
      <TableCell className="w-10 ps-5 text-center text-muted-foreground">{index}</TableCell>
      <TableCell className="min-w-[10rem] whitespace-normal">
        <p className="font-medium">{item.processName}</p>
        <p className="text-xs text-muted-foreground">{formatIsraelDateTime(item.scheduledFor)}</p>
      </TableCell>
      <TableCell className="min-w-[12rem] whitespace-normal">
        <p>{recipient.name ?? recipient.email}</p>
        {recipient.name ? <p className="text-xs text-muted-foreground">{recipient.email}</p> : null}
      </TableCell>
      <TableCell>{recurrenceLabel(item.schedule)}</TableCell>
      <TableCell>
        <StatusBadge status={item.status} />
      </TableCell>
      <TableCell className="min-w-[8rem]">
        <p>{progress.label}</p>
        {progress.total > 0 ? (
          <div className="mt-1 h-1.5 w-20 overflow-hidden rounded-full bg-muted">
            <div
              className="h-full rounded-full bg-primary"
              style={{ width: `${Math.round((progress.done / progress.total) * 100)}%` }}
            />
          </div>
        ) : null}
      </TableCell>
      <TableCell>{fileCountLabel(item.files.length)}</TableCell>
      <TableCell>{formatIsraelDateTime(lastActivityAt(item))}</TableCell>
      <RequestRowActionCells requestId={item.id} workflowId={item.workflowId} />
    </TableRow>
  );
}
