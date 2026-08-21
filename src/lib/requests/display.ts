import { formatInTimeZone } from "date-fns-tz";

import { formatIsraelDateTime } from "@/lib/dates";
import { he } from "@/lib/i18n/he";
import { scheduleTypeLabel, weekdayLabel } from "@/lib/schedule/labels";
import {
  TIMEZONE,
  parseWorkflowDefinition,
  type WorkflowField,
  type WorkflowSchedule,
} from "@/lib/workflow/schema";

/** Schema has no requests.due_at. Do not treat reminder/token expiry as a due date. */
export const HAS_REQUEST_DUE_AT = false;

export const PAGE_SIZE = 25;

export const REQUEST_DETAIL_SELECT =
  "id, workflow_id, recipient_name, recipient_email, scheduled_for, status, sent_at, opened_at, completed_at, created_at, last_error, is_test, reminder_due_at, reminder_sent_at, definition_snapshot, workflows(name), submissions(answers, submitted_at), files(id, field_id, original_name, mime_type, size_bytes, created_at), request_events(id, type, created_at)";

export const OPEN_STATUSES = new Set(["scheduled", "sent", "opened", "in_progress"]);
export const FILLING_STATUSES = new Set(["opened", "in_progress"]);

export const REQUEST_STATUS_FILTERS = [
  "scheduled",
  "sent",
  "filling",
  "completed",
  "failed",
  "expired",
] as const;

export type RequestStatusFilter = (typeof REQUEST_STATUS_FILTERS)[number] | "open" | "";

export type RequestFileInfo = {
  id: string;
  fieldId: string;
  originalName: string;
  mimeType: string;
  sizeBytes: number | null;
};

export type RequestListItem = {
  id: string;
  workflowId: string;
  processName: string;
  recipientName: string | null;
  recipientEmail: string;
  status: string;
  scheduledFor: string | null;
  sentAt: string | null;
  openedAt: string | null;
  completedAt: string | null;
  createdAt: string | null;
  submittedAt: string | null;
  dueAt: string | null;
  reminderDueAt: string | null;
  reminderSentAt: string | null;
  reminderEnabled: boolean;
  schedule: WorkflowSchedule | null;
  lastError: string | null;
  isTest: boolean;
  answers: Record<string, unknown>;
  fields: WorkflowField[];
  files: RequestFileInfo[];
  events: { id: string; type: string; createdAt: string }[];
};

function asRecord(value: unknown): Record<string, unknown> | null {
  if (Array.isArray(value)) {
    return asRecord(value[0]);
  }
  if (value && typeof value === "object") {
    return value as Record<string, unknown>;
  }
  return null;
}

function asList(value: unknown): unknown[] {
  if (Array.isArray(value)) {
    return value;
  }
  if (value && typeof value === "object") {
    return [value];
  }
  return [];
}

export function relatedField(value: unknown, key: string) {
  const record = asRecord(value);
  const field = record?.[key];
  return typeof field === "string" && field.trim() ? field : null;
}

export function processName(workflows: unknown, snapshot: unknown) {
  const fromRelation = relatedField(workflows, "name");
  if (fromRelation) {
    return fromRelation;
  }
  const fromSnapshot = relatedField(snapshot, "name");
  return fromSnapshot ?? "—";
}

export function recipientLabel(name: string | null | undefined, email: string) {
  const trimmed = name?.trim();
  if (trimmed) {
    return { name: trimmed, email };
  }
  return { name: null, email };
}

export function lastActivityAt(input: {
  submittedAt?: string | null;
  completedAt?: string | null;
  openedAt?: string | null;
  sentAt?: string | null;
  createdAt?: string | null;
}) {
  return (
    input.submittedAt ??
    input.completedAt ??
    input.openedAt ??
    input.sentAt ??
    input.createdAt ??
    null
  );
}

export function requestUiStatus(status: string) {
  if (status === "opened" || status === "in_progress") {
    return "filling";
  }
  return status;
}

export function requestUiStatusLabel(status: string) {
  const ui = requestUiStatus(status);
  if (ui === "filling") {
    return he.requests.filling;
  }
  if (ui === "scheduled") {
    return he.statuses.scheduled;
  }
  if (ui === "sent") {
    return he.statuses.sent;
  }
  if (ui === "completed") {
    return he.statuses.completed;
  }
  if (ui === "failed") {
    return he.statuses.failed;
  }
  if (ui === "expired") {
    return he.statuses.expired;
  }
  if (ui === "draft") {
    return he.statuses.draft;
  }
  return he.errors.generic;
}

export function formatIsraelDate(value: unknown) {
  if (typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value)) {
    const [year, month, day] = value.split("-").map(Number);
    return new Intl.DateTimeFormat("he-IL", {
      timeZone: TIMEZONE,
      day: "numeric",
      month: "long",
      year: "numeric",
    }).format(new Date(Date.UTC(year, month - 1, day, 12)));
  }
  if (typeof value === "string" || value instanceof Date) {
    const formatted = formatIsraelDateTime(value);
    return formatted === "—" ? "—" : formatted;
  }
  return "—";
}

export function formatAnswer(field: WorkflowField, value: unknown) {
  if (value === null || value === undefined || value === "") {
    return "—";
  }

  if (field.type === "confirmation") {
    if (value === true || value === "true") {
      return he.requests.yes;
    }
    if (value === false || value === "false") {
      return he.requests.no;
    }
    return "—";
  }

  if (field.type === "date") {
    return formatIsraelDate(value);
  }

  if (field.type === "number" && (typeof value === "number" || typeof value === "string")) {
    const numeric = typeof value === "number" ? value : Number(value);
    if (Number.isFinite(numeric)) {
      return new Intl.NumberFormat("he-IL").format(numeric);
    }
  }

  if (typeof value === "string" || typeof value === "number" || typeof value === "boolean") {
    return String(value);
  }

  return "—";
}

export function requestErrorMessage(code: string | null | undefined) {
  if (!code) {
    return null;
  }
  if (code === "needs_reauth") {
    return he.statuses.needs_reauth;
  }
  if (code === "missing_mailbox" || code === "mailbox_disconnected") {
    return he.errors.gmailRequired;
  }
  return he.errors.sendFailed;
}

export function submittedAtFromRelation(submissions: unknown) {
  return relatedField(submissions, "submitted_at");
}

export function answersFromRelation(submissions: unknown) {
  const record = asRecord(submissions);
  const answers = record?.answers;
  if (answers && typeof answers === "object" && !Array.isArray(answers)) {
    return answers as Record<string, unknown>;
  }
  return {};
}

function isFilledAnswer(field: WorkflowField, value: unknown) {
  if (field.type === "confirmation") {
    return value === true || value === false || value === "true" || value === "false";
  }
  if (value === null || value === undefined || value === "") {
    return false;
  }
  if (field.type === "number") {
    return Number.isFinite(typeof value === "number" ? value : Number(value));
  }
  if (field.type === "date") {
    return typeof value === "string" && /^\d{4}-\d{2}-\d{2}/.test(value);
  }
  if (typeof value === "string") {
    return value.trim().length > 0;
  }
  return true;
}

export function isRequestFieldReceived(
  field: WorkflowField,
  answers: Record<string, unknown>,
  files: { fieldId: string }[],
) {
  if (field.type === "file") {
    return files.some((file) => file.fieldId === field.id);
  }
  return isFilledAnswer(field, answers[field.id]);
}

export type TimelineStepKey = "emailSent" | "linkOpened" | "fillingStarted" | "responseReceived";

export function requestTimelineSteps(item: RequestListItem) {
  const eventTime = (type: string) =>
    item.events.find((event) => event.type === type)?.createdAt ?? null;
  const fillingStarted = item.fields.some((field) =>
    isRequestFieldReceived(field, item.answers, item.files),
  );
  const emailAt = item.sentAt ?? eventTime("email_sent");
  const openedAt = item.openedAt ?? eventTime("form_opened");
  const responseAt = item.submittedAt ?? item.completedAt ?? eventTime("submitted");
  return [
    {
      key: "emailSent" as const,
      label: he.requests.timelineEmailSent,
      received: Boolean(emailAt),
      at: emailAt,
    },
    {
      key: "linkOpened" as const,
      label: he.requests.timelineLinkOpened,
      received: Boolean(openedAt),
      at: openedAt,
    },
    {
      key: "fillingStarted" as const,
      label: he.requests.timelineFillingStarted,
      received: fillingStarted,
      at: fillingStarted ? openedAt : null,
    },
    {
      key: "responseReceived" as const,
      label: he.requests.timelineResponseReceived,
      received: Boolean(responseAt) || item.status === "completed",
      at: responseAt,
    },
  ];
}

export function computeProgress(
  fields: WorkflowField[],
  answers: Record<string, unknown>,
  files: { fieldId: string }[],
) {
  const required = fields.filter((field) => field.required);
  if (required.length === 0) {
    return { done: 0, total: 0, label: "—" };
  }

  const done = required.filter((field) => {
    if (field.type === "file") {
      return files.some((file) => file.fieldId === field.id);
    }
    return isFilledAnswer(field, answers[field.id]);
  }).length;

  if (done === 0) {
    return { done, total: required.length, label: he.requests.progressNotStarted };
  }

  return {
    done,
    total: required.length,
    label: he.requests.progressValue
      .replace("{done}", String(done))
      .replace("{total}", String(required.length)),
  };
}

export function missingRequiredFields(
  fields: WorkflowField[],
  answers: Record<string, unknown>,
  files: { fieldId: string }[],
) {
  return fields.filter((field) => {
    if (!field.required) {
      return false;
    }
    if (field.type === "file") {
      return !files.some((file) => file.fieldId === field.id);
    }
    return !isFilledAnswer(field, answers[field.id]);
  });
}

export function fileCountLabel(count: number) {
  if (count <= 0) {
    return he.requests.fileCountNone;
  }
  if (count === 1) {
    return he.requests.fileCountOne;
  }
  return he.requests.fileCount.replace("{count}", String(count));
}

export function runPeriodLabel(
  scheduledFor: string | null | undefined,
  schedule: WorkflowSchedule | null | undefined,
) {
  const at = formatIsraelDateTime(scheduledFor);
  if (!schedule) {
    return at;
  }
  if (schedule.type === "weekly") {
    return `${he.workflow.weekly} · ${weekdayLabel(schedule.weekday)} · ${at}`;
  }
  if (schedule.type === "monthly") {
    return `${he.workflow.monthly} · ${schedule.day} · ${at}`;
  }
  if (schedule.type === "once") {
    return `${he.workflow.once} · ${at}`;
  }
  return `${he.workflow.sendNow} · ${at}`;
}

export function sendTypeLabel(schedule: WorkflowSchedule | null | undefined) {
  if (!schedule) {
    return "—";
  }
  return scheduleTypeLabel(schedule);
}

export function recurrenceLabel(schedule: WorkflowSchedule | null | undefined) {
  if (!schedule) {
    return "—";
  }
  if (schedule.type === "weekly" || schedule.type === "monthly") {
    return he.workflow.recurring;
  }
  if (schedule.type === "manual") {
    return he.workflow.manual;
  }
  return he.workflow.once;
}

export function runLine(
  scheduledFor: string | null | undefined,
  schedule: WorkflowSchedule | null | undefined,
) {
  return `${he.requests.runLabel}: ${sendTypeLabel(schedule)} · ${formatIsraelDateTime(scheduledFor)}`;
}

export function reminderSummary(
  item: Pick<RequestListItem, "status" | "reminderDueAt" | "reminderSentAt">,
) {
  if (item.status === "completed") {
    return { label: he.requests.reminder, value: he.requests.reminderNoFurther };
  }
  if (item.reminderSentAt) {
    return { label: he.requests.reminderSent, value: formatIsraelDateTime(item.reminderSentAt) };
  }
  if (OPEN_STATUSES.has(item.status) && item.reminderDueAt) {
    return { label: he.requests.nextReminder, value: formatIsraelDateTime(item.reminderDueAt) };
  }
  return { label: he.requests.reminder, value: he.requests.reminderNotDefined };
}

export function nextActionDisplay(
  item: Pick<
    RequestListItem,
    "status" | "scheduledFor" | "reminderDueAt" | "reminderSentAt"
  >,
) {
  if (item.status === "scheduled") {
    return { label: he.requests.nextActionSend, at: item.scheduledFor };
  }
  if (item.status === "failed") {
    return { label: he.requests.nextActionNeedsAttention, at: null };
  }
  if (item.status === "completed" || item.status === "expired") {
    return { label: he.requests.nextActionNone, at: null };
  }

  const upcomingReminder = item.reminderDueAt && !item.reminderSentAt ? item.reminderDueAt : null;
  if (item.status === "sent") {
    if (upcomingReminder) {
      return { label: he.requests.nextActionReminder, at: upcomingReminder };
    }
    return { label: he.requests.nextActionWaitingFill, at: null };
  }
  if (FILLING_STATUSES.has(item.status)) {
    if (upcomingReminder) {
      return { label: he.requests.nextActionReminder, at: upcomingReminder };
    }
    return { label: "—", at: null };
  }
  return { label: "—", at: null };
}

export function requestFileHref(requestId: string, fileId: string, inline = false) {
  const href = `/api/requests/${requestId}/files/${fileId}`;
  return inline ? `${href}?inline=1` : href;
}

export function parseFileSizeBytes(value: unknown) {
  if (typeof value === "number" && Number.isFinite(value) && value > 0) {
    return value;
  }
  if (typeof value === "string" && value.trim()) {
    const numeric = Number(value);
    if (Number.isFinite(numeric) && numeric > 0) {
      return numeric;
    }
  }
  return null;
}

export function isOverdue(input: { dueAt?: string | null; status: string; now?: Date }) {
  if (!HAS_REQUEST_DUE_AT || !input.dueAt) {
    return false;
  }
  if (!OPEN_STATUSES.has(input.status)) {
    return false;
  }
  return new Date(input.dueAt).getTime() < (input.now ?? new Date()).getTime();
}

export function isSubmittedLate(input: { dueAt?: string | null; completedAt?: string | null }) {
  if (!HAS_REQUEST_DUE_AT || !input.dueAt || !input.completedAt) {
    return false;
  }
  return new Date(input.completedAt).getTime() > new Date(input.dueAt).getTime();
}

export function formatDueAt(dueAt: string | null | undefined, now = new Date()) {
  if (!HAS_REQUEST_DUE_AT || !dueAt) {
    return he.requests.noDueDate;
  }
  const due = new Date(dueAt);
  const today = formatInTimeZone(now, TIMEZONE, "yyyy-MM-dd");
  const dueDay = formatInTimeZone(due, TIMEZONE, "yyyy-MM-dd");
  const time = formatInTimeZone(due, TIMEZONE, "HH:mm");
  const tomorrowDate = new Date(now);
  tomorrowDate.setDate(tomorrowDate.getDate() + 1);
  const tomorrow = formatInTimeZone(tomorrowDate, TIMEZONE, "yyyy-MM-dd");
  if (dueDay === today) {
    return he.requests.todayAt.replace("{time}", time);
  }
  if (dueDay === tomorrow) {
    return he.requests.tomorrowAt.replace("{time}", time);
  }
  return formatIsraelDateTime(due);
}

export function overdueLabel(dueAt: string | null | undefined, now = new Date()) {
  if (!isOverdue({ dueAt, status: "sent", now })) {
    return null;
  }
  const due = new Date(dueAt as string);
  const days = Math.max(1, Math.ceil((now.getTime() - due.getTime()) / 86_400_000));
  if (days === 1) {
    return he.requests.overdueByDays;
  }
  return he.requests.overdueByDaysPlural.replace("{days}", String(days));
}

export function lastActivityDisplay(item: Pick<
  RequestListItem,
  "status" | "scheduledFor" | "sentAt" | "openedAt" | "completedAt" | "createdAt" | "submittedAt"
>) {
  const at = lastActivityAt(item);
  if (item.status === "scheduled") {
    return { label: he.requests.activityScheduled, at: item.scheduledFor ?? at };
  }
  if (item.status === "sent") {
    return { label: he.requests.activitySent, at: item.sentAt ?? at };
  }
  if (FILLING_STATUSES.has(item.status)) {
    return { label: he.requests.activityUpdated, at };
  }
  if (item.status === "completed") {
    return { label: he.requests.activityCompleted, at: item.submittedAt ?? item.completedAt ?? at };
  }
  if (item.status === "failed") {
    return { label: he.requests.activityFailed, at };
  }
  return { label: requestUiStatusLabel(item.status), at };
}

export function jerusalemDateKey(value: Date | string) {
  return formatInTimeZone(typeof value === "string" ? new Date(value) : value, TIMEZONE, "yyyy-MM-dd");
}

export function jerusalemMonthKey(date: Date) {
  return formatInTimeZone(date, TIMEZONE, "yyyy-MM");
}

function addDateKey(key: string, days: number) {
  const [year, month, day] = key.split("-").map(Number);
  const date = new Date(Date.UTC(year, month - 1, day + days, 12));
  return date.toISOString().slice(0, 10);
}

export function isScheduledToday(scheduledFor: string | null | undefined, now = new Date()) {
  if (!scheduledFor) {
    return false;
  }
  return jerusalemDateKey(scheduledFor) === jerusalemDateKey(now);
}

export function isScheduledThisWeek(scheduledFor: string | null | undefined, now = new Date()) {
  if (!scheduledFor) {
    return false;
  }
  const isoDay = Number(formatInTimeZone(now, TIMEZONE, "i"));
  const daysFromSunday = isoDay % 7;
  const start = addDateKey(jerusalemDateKey(now), -daysFromSunday);
  const end = addDateKey(start, 6);
  const key = jerusalemDateKey(scheduledFor);
  return key >= start && key <= end;
}

export function isCompletedThisMonth(completedAt: string | null | undefined, now = new Date()) {
  if (!completedAt) {
    return false;
  }
  return jerusalemMonthKey(new Date(completedAt)) === jerusalemMonthKey(now);
}

export function excludeTestRequests<T extends { isTest?: boolean; is_test?: boolean }>(rows: T[]) {
  return rows.filter((row) => row.isTest !== true && row.is_test !== true);
}

export function mapRequestRow(row: {
  id: string;
  workflow_id: string;
  recipient_name: string | null;
  recipient_email: string;
  status: string;
  scheduled_for: string | null;
  sent_at: string | null;
  opened_at: string | null;
  completed_at: string | null;
  created_at: string | null;
  last_error?: string | null;
  is_test?: boolean;
  reminder_due_at?: string | null;
  reminder_sent_at?: string | null;
  definition_snapshot: unknown;
  workflows: unknown;
  submissions: unknown;
  files?: unknown;
  request_events?: unknown;
}): RequestListItem {
  const parsed = parseWorkflowDefinition(row.definition_snapshot);
  const definition = parsed.success ? parsed.data : null;
  const filesRaw = asList(row.files);
  const eventsRaw = asList(row.request_events);
  return {
    id: row.id,
    workflowId: row.workflow_id,
    processName: processName(row.workflows, row.definition_snapshot),
    recipientName: row.recipient_name,
    recipientEmail: row.recipient_email,
    status: row.status,
    scheduledFor: row.scheduled_for,
    sentAt: row.sent_at,
    openedAt: row.opened_at,
    completedAt: row.completed_at,
    createdAt: row.created_at,
    submittedAt: submittedAtFromRelation(row.submissions),
    dueAt: null,
    reminderDueAt: row.reminder_due_at ?? null,
    reminderSentAt: row.reminder_sent_at ?? null,
    reminderEnabled: definition?.reminder.enabled === true,
    schedule: definition?.schedule ?? null,
    lastError: row.last_error ?? null,
    isTest: row.is_test === true,
    answers: answersFromRelation(row.submissions),
    fields: definition?.fields ?? [],
    files: filesRaw
      .slice()
      .sort((a, b) =>
        String((a as Record<string, unknown>).created_at ?? "").localeCompare(
          String((b as Record<string, unknown>).created_at ?? ""),
        ),
      )
      .map((file) => {
        const record = file as Record<string, unknown>;
        return {
          id: String(record.id),
          fieldId: String(record.field_id),
          originalName: String(record.original_name ?? ""),
          mimeType: String(record.mime_type ?? ""),
          sizeBytes: parseFileSizeBytes(record.size_bytes),
        };
      }),
    events: eventsRaw
      .map((event) => {
        const record = event as Record<string, unknown>;
        return {
          id: String(record.id),
          type: String(record.type ?? "").trim().toLowerCase(),
          createdAt: String(record.created_at),
        };
      })
      .sort((a, b) => a.createdAt.localeCompare(b.createdAt)),
  };
}

export function formatFileSize(bytes: number | null | undefined) {
  if (bytes == null || !Number.isFinite(bytes) || bytes <= 0) {
    return "—";
  }
  if (bytes < 1024) {
    return `${new Intl.NumberFormat("he-IL", { maximumFractionDigits: 0 }).format(bytes)} B`;
  }
  const mb = bytes / (1024 * 1024);
  if (mb >= 1) {
    return `${new Intl.NumberFormat("he-IL", { maximumFractionDigits: 1 }).format(mb)} MB`;
  }
  const kb = bytes / 1024;
  return `${new Intl.NumberFormat("he-IL", { maximumFractionDigits: 1 }).format(kb)} KB`;
}

export function fileKind(mimeType: string, originalName = "") {
  const name = originalName.toLowerCase();
  if (mimeType.startsWith("image/") || /\.(png|jpe?g|gif|webp|svg)$/i.test(name)) {
    return "image" as const;
  }
  if (mimeType.includes("pdf") || name.endsWith(".pdf")) {
    return "pdf" as const;
  }
  if (mimeType.includes("spreadsheet") || mimeType.includes("excel") || /\.(xlsx|xls|csv)$/i.test(name)) {
    return "sheet" as const;
  }
  if (mimeType.startsWith("video/") || /\.(mp4|webm|mov)$/i.test(name)) {
    return "video" as const;
  }
  return "file" as const;
}
