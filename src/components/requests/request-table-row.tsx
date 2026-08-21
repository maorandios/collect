"use client";

import { useRouter } from "next/navigation";

import { RequestRowActionCells } from "@/components/requests/request-actions-menu";
import { StatusBadge } from "@/components/status/status-badge";
import { TableCell, TableRow } from "@/components/ui/table";
import { formatIsraelDateTime } from "@/lib/dates";
import {
  computeProgress,
  fileCountLabel,
  lastActivityAt,
  recipientLabel,
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
  const panelHref = requestListHref(query, { request: item.id });
  const recipient = recipientLabel(item.recipientName, item.recipientEmail);
  const progress = computeProgress(item.fields, item.answers, item.files);
  const selected = query.request === item.id;

  return (
    <TableRow
      className={cn(
        "h-auto min-h-[3.45rem] hover:bg-hover [&>td]:py-2 [&>td]:align-middle",
        selected && "bg-primary/5",
      )}
      aria-selected={selected}
    >
      <TableCell className="w-10 ps-5 text-center text-muted-foreground">{index}</TableCell>
      <TableCell className="min-w-[10rem] whitespace-normal font-medium">{item.processName}</TableCell>
      <TableCell className="whitespace-nowrap text-muted-foreground">
        {formatIsraelDateTime(item.createdAt ?? item.scheduledFor)}
      </TableCell>
      <TableCell className="min-w-[8rem] whitespace-normal">
        <div className="leading-tight">
          <p>{recipient.name ?? "—"}</p>
          {item.organizationName ? (
            <p className="mt-0.5 text-xs text-muted-foreground">{item.organizationName}</p>
          ) : null}
        </div>
      </TableCell>
      <TableCell className="min-w-[12rem]">
        <span dir="ltr">{recipient.email}</span>
      </TableCell>
      <TableCell>
        <StatusBadge status={item.status} />
      </TableCell>
      <TableCell className="min-w-[8rem]">
        <p>{progress.label}</p>
        {progress.total > 0 ? (
          <div className="mt-1 h-[3px] w-20 overflow-hidden rounded-full bg-muted">
            <div
              className="h-full rounded-full bg-primary"
              style={{ width: `${Math.round((progress.done / progress.total) * 100)}%` }}
            />
          </div>
        ) : null}
      </TableCell>
      <TableCell>{fileCountLabel(item.files.length)}</TableCell>
      <TableCell>{formatIsraelDateTime(lastActivityAt(item))}</TableCell>
      <TableCell>{formatIsraelDateTime(item.completedAt)}</TableCell>
      <RequestRowActionCells
        onSummary={() => router.replace(panelHref)}
        onView={() => router.push(`/requests/${item.id}`)}
      />
    </TableRow>
  );
}
