"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";
import {
  CheckCircle2,
  Clock,
  Inbox,
  PenLine,
  Plus,
  Search,
} from "lucide-react";

import { EmptyState } from "@/components/feedback/empty-state";
import { FilterSelect } from "@/components/requests/filter-select";
import { RequestPanel } from "@/components/requests/request-panel";
import { RequestTableRow } from "@/components/requests/request-table-row";
import { buttonVariants } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Table,
  TableBody,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { he } from "@/lib/i18n/he";
import {
  REQUEST_STATUS_FILTERS,
  requestUiStatusLabel,
  type RequestListItem,
} from "@/lib/requests/display";
import {
  hasActiveFilters,
  paginateItems,
  requestListHref,
  sortRequestItems,
  summarizeRequests,
  type RequestListQuery,
  matchesRequestFilters,
} from "@/lib/requests/query-params";
import { cn } from "@/lib/utils";

const DATE_FILTERS = [
  { value: "", label: he.requests.allDates },
  { value: "today", label: he.requests.dateToday },
  { value: "week", label: he.requests.dateWeek },
] as const;

export function RequestsWorkspace({
  items,
  query,
}: {
  items: RequestListItem[];
  query: RequestListQuery;
}) {
  const router = useRouter();
  const [search, setSearch] = useState(query.q);
  const lastSentQuery = useRef(query.q);

  useEffect(() => {
    if (query.q !== lastSentQuery.current) {
      setSearch(query.q);
      lastSentQuery.current = query.q;
    }
  }, [query.q]);

  useEffect(() => {
    if (search.trim() === query.q) {
      return;
    }
    const timer = window.setTimeout(() => {
      lastSentQuery.current = search.trim();
      router.replace(requestListHref(query, { q: search.trim(), page: 1 }));
    }, 300);
    return () => window.clearTimeout(timer);
  }, [query, router, search]);

  const summary = useMemo(() => summarizeRequests(items), [items]);

  const filtered = useMemo(() => {
    const matched = items.filter((item) => matchesRequestFilters(item, query));
    return sortRequestItems(matched, query.sort);
  }, [items, query]);

  const page = paginateItems(filtered, query.page);
  const selected = items.find((item) => item.id === query.request) ?? null;
  const filtersActive = hasActiveFilters(query);
  const createHref = "/workflows/new";
  const createButton = (
    <Link
      href={createHref}
      className={cn(buttonVariants({ size: "lg" }), "h-11 rounded-[12px] px-4")}
    >
      <Plus className="size-4" />
      {he.actions.createWorkflow}
    </Link>
  );

  function go(patch: Partial<RequestListQuery>) {
    router.replace(requestListHref(query, patch));
  }

  return (
    <div className="relative min-h-full overflow-x-hidden">
      <header className="flex items-center justify-between gap-4 border-b border-border bg-surface px-8 py-5">
        <div className="min-w-0">
          <h1 className="text-2xl font-semibold text-foreground">{he.requests.title}</h1>
          <p className="mt-1 text-sm text-muted-foreground">{he.requests.subtitle}</p>
        </div>
        {createButton}
      </header>

      <section className="space-y-5 p-8">
        <div className="grid grid-cols-2 gap-3 min-[1440px]:grid-cols-4">
          <SummaryCard
            title={he.requests.summaryOpen}
            hint={he.requests.summaryOpenHint}
            value={summary.open}
            icon={Inbox}
            active={query.status === "open"}
            onClick={() => go({ status: query.status === "open" ? "" : "open", period: "", page: 1 })}
          />
          <SummaryCard
            title={he.requests.summaryFilling}
            hint={he.requests.summaryFillingHint}
            value={summary.filling}
            icon={PenLine}
            tone="amber"
            active={query.status === "filling"}
            onClick={() => go({ status: query.status === "filling" ? "" : "filling", period: "", page: 1 })}
          />
          <SummaryCard
            title={he.requests.summaryWaiting}
            hint={he.requests.summaryWaitingHint}
            value={summary.waiting}
            icon={Clock}
            active={query.status === "waiting"}
            onClick={() => go({ status: query.status === "waiting" ? "" : "waiting", period: "", page: 1 })}
          />
          <SummaryCard
            title={he.requests.summaryDoneMonth}
            hint={he.requests.summaryDoneMonthHint}
            value={summary.completedMonth}
            icon={CheckCircle2}
            tone="teal"
            active={query.period === "month"}
            onClick={() => go({ period: query.period === "month" ? "" : "month", status: "", page: 1 })}
          />
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <label className="relative min-w-[16rem] flex-1">
            <Search className="pointer-events-none absolute start-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder={he.requests.searchPlaceholder}
              className="h-11 rounded-[12px] border-border bg-card! ps-10"
            />
          </label>
          <FilterSelect
            label={he.requests.filterStatus}
            value={
              (REQUEST_STATUS_FILTERS as readonly string[]).includes(query.status)
                ? query.status
                : ""
            }
            options={[
              { value: "", label: he.requests.allStatuses },
              ...REQUEST_STATUS_FILTERS.map((status) => ({
                value: status,
                label: requestUiStatusLabel(status),
              })),
            ]}
            onChange={(status) => go({ status, period: "", page: 1 })}
          />
          <FilterSelect
            label={he.requests.filterWhen}
            value={query.when}
            options={DATE_FILTERS.map((option) => ({ value: option.value, label: option.label }))}
            onChange={(when) => go({ when, page: 1 })}
          />
          {filtersActive ? (
            <Link
              href={requestListHref(query, {
                q: "",
                status: "",
                workflow: "",
                when: "",
                period: "",
                page: 1,
              })}
              className={cn(buttonVariants({ variant: "outline" }), "h-11 rounded-[12px] px-3")}
            >
              {he.actions.clearFilters}
            </Link>
          ) : null}
          <p className="ms-auto text-sm text-muted-foreground">
            {he.requests.resultsCount.replace("{count}", String(page.total))}
          </p>
        </div>

        {!items.length ? (
          <EmptyState
            title={he.requests.emptyTitle}
            description={he.requests.emptyDescription}
            action={createButton}
          />
        ) : !page.total ? (
          <EmptyState
            title={he.requests.emptyFilteredTitle}
            description={he.requests.emptyFilteredDescription}
            action={
              <Link
                href={requestListHref(query, {
                  q: "",
                  status: "",
                  workflow: "",
                  when: "",
                  period: "",
                  page: 1,
                })}
                className={cn(buttonVariants({ variant: "outline" }), "h-11 rounded-[12px] px-4")}
              >
                {he.actions.clearFilters}
              </Link>
            }
          />
        ) : (
          <div className="overflow-hidden rounded-[16px] border border-border bg-surface">
            <Table className="min-w-[68rem]">
              <TableHeader>
                <TableRow className="bg-table-header hover:bg-table-header">
                  <TableHead className="w-10 ps-5 text-center">{he.requests.columns.index}</TableHead>
                  <TableHead>{he.requests.columns.eventName}</TableHead>
                  <TableHead>{he.requests.columns.contact}</TableHead>
                  <TableHead>{he.requests.columns.recurrence}</TableHead>
                  <TableHead>{he.requests.columns.status}</TableHead>
                  <TableHead>{he.requests.columns.progress}</TableHead>
                  <TableHead>{he.requests.columns.attachments}</TableHead>
                  <TableHead>{he.requests.columns.lastActivity}</TableHead>
                  <TableHead className="text-center">{he.requests.columns.eventLink}</TableHead>
                  <TableHead className="text-center">{he.requests.columns.viewProcess}</TableHead>
                  <TableHead className="pe-8 text-center">{he.requests.columns.actions}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {page.rows.map((item, rowIndex) => (
                  <RequestTableRow
                    key={item.id}
                    item={item}
                    index={(page.page - 1) * page.pageSize + rowIndex + 1}
                    query={query}
                  />
                ))}
              </TableBody>
            </Table>
          </div>
        )}

        {page.totalPages > 1 ? (
          <div className="flex flex-wrap items-center justify-between gap-3 text-sm text-muted-foreground">
            <p>
              {he.requests.showingRange
                .replace("{from}", String(page.start))
                .replace("{to}", String(page.end))
                .replace("{total}", String(page.total))}
            </p>
            <div className="flex items-center gap-2">
              {page.page > 1 ? (
                <Link
                  href={requestListHref(query, { page: page.page - 1 })}
                  className={cn(buttonVariants({ variant: "outline" }), "h-10 rounded-[12px] px-3")}
                >
                  {he.actions.previous}
                </Link>
              ) : null}
              {page.page < page.totalPages ? (
                <Link
                  href={requestListHref(query, { page: page.page + 1 })}
                  className={cn(buttonVariants({ variant: "outline" }), "h-10 rounded-[12px] px-3")}
                >
                  {he.actions.next}
                </Link>
              ) : null}
            </div>
          </div>
        ) : page.total > 0 ? (
          <p className="text-sm text-muted-foreground">
            {he.requests.showingRange
              .replace("{from}", String(page.start))
              .replace("{to}", String(page.end))
              .replace("{total}", String(page.total))}
          </p>
        ) : null}
      </section>

      <RequestPanel
        item={selected}
        onClose={() => router.replace(requestListHref(query, { request: "" }))}
      />
    </div>
  );
}

function SummaryCard({
  title,
  hint,
  value,
  icon: Icon,
  active = false,
  disabled = false,
  tone = "teal",
  onClick,
}: {
  title: string;
  hint: string;
  value: number | string;
  icon: typeof Inbox;
  active?: boolean;
  disabled?: boolean;
  tone?: "teal" | "amber" | "red";
  onClick?: () => void;
}) {
  const dot =
    tone === "amber" ? "bg-amber-600" : tone === "red" ? "bg-destructive" : "bg-primary";
  const className = cn(
    "rounded-[16px] border bg-surface px-5 py-4 text-start transition-colors",
    active ? "border-primary bg-primary/5" : "border-border",
    disabled ? "cursor-default opacity-80" : "hover:border-primary/40",
  );

  const content = (
    <>
      <div className="flex items-center gap-2 text-sm text-muted-foreground">
        <Icon className="size-4" strokeWidth={1.75} />
        <span>{title}</span>
      </div>
      <p className="mt-3 text-3xl font-semibold tracking-tight text-foreground">{value}</p>
      <p className="mt-2 flex items-center gap-2 text-xs text-muted-foreground">
        <span className={cn("size-1.5 rounded-full", dot)} />
        {hint}
      </p>
    </>
  );

  if (disabled || !onClick) {
    return <div className={className}>{content}</div>;
  }

  return (
    <button type="button" className={className} onClick={onClick}>
      {content}
    </button>
  );
}
