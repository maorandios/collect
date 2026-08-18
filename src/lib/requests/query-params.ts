import { HAS_REQUEST_DUE_AT, PAGE_SIZE, type RequestListItem } from "./display";
import {
  FILLING_STATUSES,
  OPEN_STATUSES,
  lastActivityAt,
  isCompletedThisMonth,
  isOverdue,
  isScheduledThisWeek,
  isScheduledToday,
} from "./display";

const uuidPattern =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

const STATUS_VALUES = new Set([
  "scheduled",
  "sent",
  "filling",
  "completed",
  "failed",
  "expired",
  "open",
  "waiting",
]);
const WHEN_VALUES = new Set(["overdue", "today", "week"]);
const PERIOD_VALUES = new Set(["month"]);

export type RequestListQuery = {
  q: string;
  status: string;
  workflow: string;
  when: string;
  period: string;
  page: number;
  sort: "activity" | "due";
  request: string;
};

export function parseRequestListQuery(
  params: Record<string, string | string[] | undefined>,
): RequestListQuery {
  const read = (key: string) => {
    const value = params[key];
    return Array.isArray(value) ? value[0] ?? "" : value ?? "";
  };
  const page = Number(read("page"));
  const sort = read("sort") === "due" ? "due" : "activity";
  const request = read("request");
  const status = read("status");
  const when = read("when");
  const period = read("period");
  return {
    q: read("q").trim(),
    status: STATUS_VALUES.has(status) ? status : "",
    workflow: uuidPattern.test(read("workflow")) ? read("workflow") : "",
    when: WHEN_VALUES.has(when) && when !== "overdue" ? when : "",
    period: PERIOD_VALUES.has(period) ? period : "",
    page: Number.isInteger(page) && page > 0 ? page : 1,
    sort: HAS_REQUEST_DUE_AT ? sort : "activity",
    request: uuidPattern.test(request) ? request : "",
  };
}

export function requestListSearchParams(
  query: RequestListQuery,
  patch: Partial<RequestListQuery> = {},
) {
  const next = { ...query, ...patch };
  const params = new URLSearchParams();
  if (next.q) {
    params.set("q", next.q);
  }
  if (next.status) {
    params.set("status", next.status);
  }
  if (next.workflow) {
    params.set("workflow", next.workflow);
  }
  if (next.when && next.when !== "overdue") {
    params.set("when", next.when);
  }
  if (next.period) {
    params.set("period", next.period);
  }
  if (next.page > 1) {
    params.set("page", String(next.page));
  }
  if (next.sort === "due" && HAS_REQUEST_DUE_AT) {
    params.set("sort", "due");
  }
  if (next.request) {
    params.set("request", next.request);
  }
  return params;
}

export function requestListHref(query: RequestListQuery, patch: Partial<RequestListQuery> = {}) {
  const params = requestListSearchParams(query, patch);
  const text = params.toString();
  return text ? `/requests?${text}` : "/requests";
}

export function matchesRequestFilters(item: RequestListItem, query: RequestListQuery, now = new Date()) {
  if (item.isTest) {
    return false;
  }
  if (query.q) {
    const haystack = `${item.processName} ${item.recipientName ?? ""} ${item.recipientEmail}`.toLowerCase();
    if (!haystack.includes(query.q.toLowerCase())) {
      return false;
    }
  }
  if (query.workflow && item.workflowId !== query.workflow) {
    return false;
  }
  if (query.status === "open" && !OPEN_STATUSES.has(item.status)) {
    return false;
  }
  if (query.status === "filling" && !FILLING_STATUSES.has(item.status)) {
    return false;
  }
  if (query.status === "waiting" && item.status !== "sent") {
    return false;
  }
  if (
    query.status &&
    query.status !== "open" &&
    query.status !== "filling" &&
    query.status !== "waiting" &&
    item.status !== query.status
  ) {
    return false;
  }
  if (query.period === "month" && (item.status !== "completed" || !isCompletedThisMonth(item.completedAt, now))) {
    return false;
  }
  if (query.when === "today" && !isScheduledToday(item.scheduledFor, now)) {
    return false;
  }
  if (query.when === "week" && !isScheduledThisWeek(item.scheduledFor, now)) {
    return false;
  }
  if (HAS_REQUEST_DUE_AT && query.when === "overdue" && !isOverdue({ dueAt: item.dueAt, status: item.status, now })) {
    return false;
  }
  return true;
}

export function sortRequestItems(items: RequestListItem[], sort: RequestListQuery["sort"]) {
  const copy = [...items];
  copy.sort((a, b) => {
    if (sort === "due" && HAS_REQUEST_DUE_AT) {
      return String(b.dueAt ?? "").localeCompare(String(a.dueAt ?? ""));
    }
    const aAt = lastActivityAt(a) ?? "";
    const bAt = lastActivityAt(b) ?? "";
    return bAt.localeCompare(aAt);
  });
  return copy;
}

export function paginateItems<T>(items: T[], page: number, pageSize = PAGE_SIZE) {
  const total = items.length;
  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  const current = Math.min(Math.max(page, 1), totalPages);
  const start = (current - 1) * pageSize;
  return {
    page: current,
    total,
    totalPages,
    pageSize,
    start: total === 0 ? 0 : start + 1,
    end: Math.min(start + pageSize, total),
    rows: items.slice(start, start + pageSize),
  };
}

export function summarizeRequests(items: RequestListItem[], now = new Date()) {
  const live = items.filter((item) => !item.isTest);
  return {
    open: live.filter((item) => OPEN_STATUSES.has(item.status)).length,
    filling: live.filter((item) => FILLING_STATUSES.has(item.status)).length,
    waiting: live.filter((item) => item.status === "sent").length,
    overdue: HAS_REQUEST_DUE_AT
      ? live.filter((item) => isOverdue({ dueAt: item.dueAt, status: item.status, now })).length
      : null,
    completedMonth: live.filter(
      (item) => item.status === "completed" && isCompletedThisMonth(item.completedAt, now),
    ).length,
  };
}

export function hasActiveFilters(query: RequestListQuery) {
  return Boolean(query.q || query.status || query.workflow || query.when || query.period);
}
