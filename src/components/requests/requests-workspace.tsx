"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";
import {
  Astroid,
  CheckCircle2,
  CirclePlus,
  ClockAlert,
  ClockFading,
  Mails,
  PenLine,
  Search,
  Star,
  type LucideIcon,
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
import type { RequestListItem } from "@/lib/requests/display";
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

const STATUS_FILTERS = [
  { value: "", label: he.requests.allStatuses },
  { value: "filling", label: he.requests.summaryFilling },
  { value: "waiting", label: he.requests.summaryWaiting },
  { value: "expired", label: he.requests.summaryExpired },
  { value: "completed_month", label: he.requests.filterCompletedMonth },
] as const;

const RECURRENCE_FILTERS = [
  { value: "", label: he.requests.allDates },
  { value: "daily", label: he.requests.recurrenceDaily },
  { value: "weekly", label: he.requests.recurrenceWeekly },
  { value: "monthly", label: he.requests.recurrenceMonthly },
  { value: "yearly", label: he.requests.recurrenceYearly },
  { value: "once", label: he.requests.recurrenceOnce },
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
      className={cn(
        buttonVariants({ size: "lg" }),
        "h-11 rounded-2xl bg-zinc-700 px-4 text-white hover:bg-zinc-800",
      )}
    >
      <CirclePlus className="size-4" />
      {he.actions.createWorkflow}
    </Link>
  );

  function go(patch: Partial<RequestListQuery>) {
    router.replace(requestListHref(query, patch));
  }

  return (
    <div className="relative flex h-full min-h-0 flex-col overflow-x-hidden">
      <header className="flex h-20 shrink-0 items-center justify-between gap-4 border-b border-border bg-sidebar px-8">
        <div className="min-w-0">
          <h1 className="flex items-center gap-2 text-2xl font-semibold text-foreground">
            <Star className="size-5 shrink-0" strokeWidth={1.7} />
            {he.requests.title}
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">{he.requests.subtitle}</p>
        </div>
        {createButton}
      </header>

      <section className="min-h-0 flex-1 space-y-5 overflow-auto p-8">
        <div className="flex overflow-hidden rounded-2xl border border-border bg-surface">
          <SummaryCard
            title={he.requests.summaryTotal}
            hint={he.requests.summaryTotalHint}
            value={summary.total}
            icon={Mails}
          />
          <SummaryCard
            title={he.requests.summaryFilling}
            hint={he.requests.summaryFillingHint}
            value={summary.filling}
            icon={PenLine}
          />
          <SummaryCard
            title={he.requests.summaryWaiting}
            hint={he.requests.summaryWaitingHint}
            value={summary.waiting}
            icon={ClockFading}
          />
          <SummaryCard
            title={he.requests.summaryExpired}
            hint={he.requests.summaryExpiredHint}
            value={summary.expired}
            icon={ClockAlert}
          />
          <SummaryCard
            title={he.requests.summaryDoneMonth}
            hint={he.requests.summaryDoneMonthHint}
            value={summary.completedMonth}
            icon={CheckCircle2}
            variant="accent"
          />
        </div>

        <div className="grid grid-cols-5 items-center">
          <label className="relative pe-3">
            <Search className="pointer-events-none absolute start-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder={he.requests.searchPlaceholder}
              className="h-11 w-full rounded-[12px] border-border bg-card! ps-10"
            />
          </label>
          <div className="col-span-4 flex items-center gap-3">
            <FilterSelect
              label={he.requests.filterStatus}
              value={query.period === "month" ? "completed_month" : query.status}
              options={STATUS_FILTERS.map((option) => ({ value: option.value, label: option.label }))}
              onChange={(status) =>
                go({
                  status: status === "completed_month" ? "completed_month" : status,
                  period: "",
                  page: 1,
                })
              }
            />
            <FilterSelect
              label={he.requests.filterWhen}
              value={query.when}
              options={RECURRENCE_FILTERS.map((option) => ({ value: option.value, label: option.label }))}
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
                className={cn(buttonVariants({ variant: "outline" }), "h-11 shrink-0 rounded-[12px] px-3")}
              >
                {he.actions.clearFilters}
              </Link>
            ) : null}
            <p className="text-sm text-muted-foreground">
              {he.requests.showingEventsCount
                .replace("{shown}", String(page.total))
                .replace("{total}", String(summary.total))}
            </p>
          </div>
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
  variant = "default",
}: {
  title: string;
  hint: string;
  value: number | string;
  icon: LucideIcon;
  variant?: "default" | "accent";
}) {
  const accent = variant === "accent";
  return (
    <div
      className={cn(
        "min-w-0 flex-1 px-5 py-4 text-start not-first:border-s not-first:border-border",
        accent ? "bg-primary text-[#d0f0c0]" : "bg-surface text-muted-foreground",
      )}
    >
      <div className={cn("flex items-center gap-2 text-sm", accent ? "text-[#d0f0c0]" : "text-muted-foreground")}>
        <Icon className="size-4" strokeWidth={1.75} />
        <span>{title}</span>
      </div>
      <p
        className={cn(
          "mt-3 text-3xl font-semibold tracking-tight",
          accent ? "text-[#d0f0c0]" : "text-foreground",
        )}
      >
        {value}
      </p>
      <p className={cn("mt-2 flex items-center gap-2 text-xs", accent ? "text-[#d0f0c0]" : "text-muted-foreground")}>
        <Astroid className="size-3.5 shrink-0" strokeWidth={1.75} />
        {hint}
      </p>
    </div>
  );
}
