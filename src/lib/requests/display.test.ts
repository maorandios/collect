import assert from "node:assert/strict";
import { test } from "node:test";

import {
  computeProgress,
  excludeTestRequests,
  formatAnswer,
  HAS_REQUEST_DUE_AT,
  isCompletedThisMonth,
  isOverdue,
  isRequestFieldReceived,
  isSubmittedLate,
  lastActivityAt,
  lastActivityDisplay,
  requestTimelineSteps,
  fileCountLabel,
  formatFileSize,
  missingRequiredFields,
  nextActionDisplay,
  organizationNameForRecipient,
  reminderSummary,
  parseFileSizeBytes,
  runLine,
  processName,
  runPeriodLabel,
  recurrenceLabel,
  recipientLabel,
  requestErrorMessage,
  requestUiStatus,
  requestUiStatusLabel,
} from "./display";
import {
  hasActiveFilters,
  matchesRequestFilters,
  parseRequestListQuery,
  requestListHref,
  requestListSearchParams,
} from "./query-params";
import { he } from "@/lib/i18n/he";
import type { WorkflowField } from "@/lib/workflow/schema";
import type { RequestListItem } from "./display";

const confirmation: WorkflowField = {
  id: "ok",
  type: "confirmation",
  label: "אישור",
  required: true,
  helpText: null,
};

const dateField: WorkflowField = {
  id: "due",
  type: "date",
  label: "תאריך",
  required: false,
  helpText: null,
};

const summary: WorkflowField = {
  id: "summary",
  type: "long_text",
  label: "סיכום",
  required: true,
  helpText: null,
};

const fileField: WorkflowField = {
  id: "doc",
  type: "file",
  label: "מסמך",
  required: true,
  helpText: null,
  allowedMimeTypes: ["application/pdf"],
  maxFiles: 1,
  maxFileSizeMb: 10,
};

function item(overrides: Partial<RequestListItem> = {}): RequestListItem {
  return {
    id: "11111111-1111-4111-8111-111111111111",
    workflowId: "22222222-2222-4222-8222-222222222222",
    processName: "סיכום שבועי",
    recipientName: "רוני",
    organizationName: null,
    recipientEmail: "roni@example.com",
    status: "sent",
    scheduledFor: "2026-08-18T07:00:00.000Z",
    sentAt: "2026-08-18T07:05:00.000Z",
    openedAt: null,
    completedAt: null,
    createdAt: "2026-08-18T06:00:00.000Z",
    submittedAt: null,
    dueAt: null,
    reminderDueAt: null,
    reminderSentAt: null,
    reminderEnabled: false,
    schedule: null,
    lastError: null,
    isTest: false,
    answers: {},
    fields: [summary],
    files: [],
    events: [],
    ...overrides,
  };
}

test("request UI statuses map opened and in_progress to filling", () => {
  assert.equal(requestUiStatus("opened"), "filling");
  assert.equal(requestUiStatus("in_progress"), "filling");
  assert.equal(requestUiStatus("sent"), "sent");
  assert.equal(requestUiStatusLabel("opened"), he.requests.filling);
  assert.equal(requestUiStatusLabel("scheduled"), he.statuses.scheduled);
});

test("last activity prefers submitted then completed then opened then sent then created", () => {
  assert.equal(
    lastActivityAt({
      submittedAt: "2026-08-21T10:00:00Z",
      completedAt: "2026-08-21T09:00:00Z",
      openedAt: "2026-08-20T10:00:00Z",
      sentAt: "2026-08-19T10:00:00Z",
      createdAt: "2026-08-18T10:00:00Z",
    }),
    "2026-08-21T10:00:00Z",
  );
  assert.equal(
    lastActivityAt({
      submittedAt: null,
      openedAt: null,
      sentAt: "2026-08-19T10:00:00Z",
      createdAt: "2026-08-18T10:00:00Z",
    }),
    "2026-08-19T10:00:00Z",
  );
});

test("last activity copy follows the request stage", () => {
  assert.equal(lastActivityDisplay(item({ status: "scheduled" })).label, he.requests.activityScheduled);
  assert.equal(lastActivityDisplay(item({ status: "sent" })).label, he.requests.activitySent);
  assert.equal(lastActivityDisplay(item({ status: "in_progress" })).label, he.requests.activityUpdated);
  assert.equal(lastActivityDisplay(item({ status: "completed" })).label, he.requests.activityCompleted);
  assert.equal(lastActivityDisplay(item({ status: "failed" })).label, he.requests.activityFailed);
});

test("progress counts required fields including files", () => {
  const none = computeProgress([summary, fileField], {}, []);
  assert.equal(none.done, 0);
  assert.equal(none.total, 2);
  assert.equal(none.label, he.requests.progressNotStarted);

  const half = computeProgress([summary, fileField], { summary: "טקסט" }, []);
  assert.equal(half.done, 1);
  assert.equal(half.label, "1 מתוך 2");

  const full = computeProgress(
    [summary, fileField],
    { summary: "טקסט" },
    [{ fieldId: "doc" }],
  );
  assert.equal(full.done, 2);

  const optionalOnly = computeProgress([dateField], {}, []);
  assert.equal(optionalOnly.label, "—");
});

test("request field received status uses answers and files without showing source files", () => {
  assert.equal(isRequestFieldReceived(summary, {}, []), false);
  assert.equal(isRequestFieldReceived(summary, { summary: "טקסט" }, []), true);
  assert.equal(isRequestFieldReceived(fileField, {}, []), false);
  assert.equal(isRequestFieldReceived(fileField, {}, [{ fieldId: "doc" }]), true);
});

test("timeline records link opened without treating it as filling started", () => {
  const openedOnly = requestTimelineSteps(
    item({
      openedAt: "2026-08-18T07:10:00.000Z",
      events: [{ id: "open", type: "form_opened", createdAt: "2026-08-18T07:10:00.000Z" }],
    }),
  );
  assert.equal(openedOnly[1]?.received, true);
  assert.equal(openedOnly[1]?.at, "2026-08-18T07:10:00.000Z");
  assert.equal(openedOnly[2]?.received, false);
  assert.equal(openedOnly[2]?.at, null);

  const fillingLater = requestTimelineSteps(
    item({
      openedAt: "2026-08-18T07:10:00.000Z",
      answers: { summary: "טקסט" },
      events: [
        { id: "open", type: "form_opened", createdAt: "2026-08-18T07:10:00.000Z" },
        { id: "fill", type: "filling_started", createdAt: "2026-08-18T07:25:00.000Z" },
      ],
    }),
  );
  assert.equal(fillingLater[1]?.at, "2026-08-18T07:10:00.000Z");
  assert.equal(fillingLater[2]?.at, "2026-08-18T07:25:00.000Z");
});

test("organization name comes from the matching recipient and is hidden when it duplicates the contact", () => {
  const recipients = [
    { email: "roni@example.com", organizationName: "געש תעשיות מתכת" },
    { email: "other@example.com", organizationName: "חברה אחרת" },
  ];
  assert.equal(organizationNameForRecipient(recipients, "roni@example.com", "רוני"), "געש תעשיות מתכת");
  assert.equal(organizationNameForRecipient(recipients, "roni@example.com", "געש תעשיות מתכת"), null);
  assert.equal(organizationNameForRecipient([], "roni@example.com", "רוני"), null);
});

test("timeline steps use sent, opened, filled fields and submitted", () => {
  const empty = requestTimelineSteps(item());
  assert.deepEqual(
    empty.map((step) => [step.key, step.received]),
    [
      ["emailSent", true],
      ["linkOpened", false],
      ["fillingStarted", false],
      ["responseReceived", false],
    ],
  );

  const progressed = requestTimelineSteps(
    item({
      openedAt: "2026-08-18T07:10:00.000Z",
      answers: { summary: "טקסט" },
      submittedAt: "2026-08-18T07:20:00.000Z",
      status: "completed",
    }),
  );
  assert.equal(empty[0]?.at, "2026-08-18T07:05:00.000Z");
  assert.equal(empty[1]?.at, null);
  assert.equal(progressed.every((step) => step.received), true);
  assert.equal(progressed[3]?.at, "2026-08-18T07:20:00.000Z");
});

test("test requests are excluded from lists and counts", () => {
  const rows = excludeTestRequests([item(), item({ isTest: true, id: "t" })]);
  assert.equal(rows.length, 1);
  assert.equal(
    matchesRequestFilters(item({ isTest: true }), parseRequestListQuery({})),
    false,
  );
});

test("query params keep search filters when opening and closing the panel", () => {
  const query = parseRequestListQuery({
    q: "רוני",
    status: "filling",
    workflow: "22222222-2222-4222-8222-222222222222",
    page: "2",
  });
  const opened = requestListSearchParams(query, {
    request: "11111111-1111-4111-8111-111111111111",
  });
  assert.equal(opened.get("q"), "רוני");
  assert.equal(opened.get("status"), "filling");
  assert.equal(opened.get("page"), "2");
  assert.equal(opened.get("request"), "11111111-1111-4111-8111-111111111111");

  const closed = requestListHref(query, { request: "" });
  assert.equal(closed.includes("request="), false);
  assert.equal(closed.includes("q=%D7%A8%D7%95%D7%A0%D7%99"), true);
  assert.equal(hasActiveFilters(query), true);
});

test("overdue requires due_at and is disabled in the current schema", () => {
  assert.equal(HAS_REQUEST_DUE_AT, false);
  assert.equal(
    isOverdue({
      dueAt: "2000-01-01T00:00:00.000Z",
      status: "sent",
      now: new Date("2026-08-18T12:00:00.000Z"),
    }),
    false,
  );
  assert.equal(
    isSubmittedLate({
      dueAt: "2026-08-01T00:00:00.000Z",
      completedAt: "2026-08-18T00:00:00.000Z",
    }),
    false,
  );
});

test("completed after due_at is late only when due_at exists", () => {
  assert.equal(HAS_REQUEST_DUE_AT, false);
  assert.equal(
    isSubmittedLate({
      dueAt: "2026-08-10T00:00:00.000Z",
      completedAt: "2026-08-18T00:00:00.000Z",
    }),
    false,
  );
});

test("completed this month uses Asia/Jerusalem", () => {
  const now = new Date("2026-08-18T12:00:00+03:00");
  assert.equal(isCompletedThisMonth("2026-08-05T10:00:00.000Z", now), true);
  assert.equal(isCompletedThisMonth("2026-07-31T22:00:00.000Z", now), true);
  assert.equal(isCompletedThisMonth("2026-07-30T10:00:00.000Z", now), false);
});

test("process name falls back to definition snapshot after soft delete", () => {
  assert.equal(processName({ name: "תהליך חי" }, { name: "ישן" }), "תהליך חי");
  assert.equal(processName(null, { name: "סיכום שבועי" }), "סיכום שבועי");
});

test("recipient label keeps name and email together", () => {
  assert.deepEqual(recipientLabel("רוני", "roni@example.com"), {
    name: "רוני",
    email: "roni@example.com",
  });
});

test("answers format confirmation, Hebrew date, and missing values", () => {
  assert.equal(formatAnswer(confirmation, true), he.requests.yes);
  assert.equal(formatAnswer(confirmation, false), he.requests.no);
  assert.equal(formatAnswer(confirmation, null), "—");
  assert.equal(formatAnswer(dateField, "2026-08-24"), "24 באוגוסט 2026");
});

test("request errors stay friendly and never echo the raw code", () => {
  assert.equal(requestErrorMessage("needs_reauth"), he.statuses.needs_reauth);
  assert.equal(requestErrorMessage("nylas_error"), he.errors.sendFailed);
});

test("filling filter matches opened and in_progress only", () => {
  const query = parseRequestListQuery({ status: "filling" });
  assert.equal(matchesRequestFilters(item({ status: "opened" }), query), true);
  assert.equal(matchesRequestFilters(item({ status: "in_progress" }), query), true);
  assert.equal(matchesRequestFilters(item({ status: "sent" }), query), false);
});

test("invalid status and due filters are ignored without due_at", () => {
  const query = parseRequestListQuery({
    status: "partial",
    when: "overdue",
    sort: "due",
    request: "not-a-uuid",
  });
  assert.equal(query.status, "");
  assert.equal(query.when, "");
  assert.equal(query.sort, "activity");
  assert.equal(query.request, "");
  assert.equal(requestListHref(query, { when: "overdue" }).includes("when="), false);
});

test("completed month status filter keeps requests from the current Jerusalem month", () => {
  const now = new Date("2026-08-18T12:00:00+03:00");
  const query = parseRequestListQuery({ status: "completed_month" });
  assert.equal(
    matchesRequestFilters(item({ status: "completed", completedAt: "2026-08-05T10:00:00.000Z" }), query, now),
    true,
  );
  assert.equal(
    matchesRequestFilters(item({ status: "completed", completedAt: "2026-07-01T10:00:00.000Z" }), query, now),
    false,
  );
  assert.equal(matchesRequestFilters(item({ status: "sent" }), query, now), false);
  assert.equal(
    matchesRequestFilters(
      item({ status: "completed", completedAt: "2026-08-05T10:00:00.000Z" }),
      parseRequestListQuery({ period: "month" }),
      now,
    ),
    true,
  );
});

test("search matches process name, recipient name and email", () => {
  const query = parseRequestListQuery({ q: "רוני" });
  assert.equal(matchesRequestFilters(item(), query), true);
  assert.equal(matchesRequestFilters(item({ recipientName: "דנה" }), query), false);
  assert.equal(matchesRequestFilters(item({ processName: "רוני-דוח" }), parseRequestListQuery({ q: "דוח" })), true);
});

test("recurrence filter matches schedule type", () => {
  const weekly = item({
    schedule: { type: "weekly", weekday: 1, time: "10:00", timezone: "Asia/Jerusalem" },
  });
  const monthly = item({
    schedule: { type: "monthly", day: 1, time: "10:00", timezone: "Asia/Jerusalem" },
  });
  const once = item({
    schedule: { type: "once", date: "2026-08-18", time: "10:00", timezone: "Asia/Jerusalem" },
  });
  assert.equal(matchesRequestFilters(weekly, parseRequestListQuery({ when: "weekly" })), true);
  assert.equal(matchesRequestFilters(monthly, parseRequestListQuery({ when: "weekly" })), false);
  assert.equal(matchesRequestFilters(monthly, parseRequestListQuery({ when: "monthly" })), true);
  assert.equal(matchesRequestFilters(once, parseRequestListQuery({ when: "once" })), true);
  assert.equal(matchesRequestFilters(weekly, parseRequestListQuery({ when: "once" })), false);
});

test("waiting filter matches sent requests only", () => {
  const query = parseRequestListQuery({ status: "waiting" });
  assert.equal(matchesRequestFilters(item({ status: "sent" }), query), true);
  assert.equal(matchesRequestFilters(item({ status: "scheduled" }), query), false);
  assert.equal(matchesRequestFilters(item({ status: "opened" }), query), false);
});

test("next action follows status and uses reminder time only as a reminder", () => {
  assert.equal(nextActionDisplay(item({ status: "scheduled" })).label, he.requests.nextActionSend);
  assert.equal(nextActionDisplay(item({ status: "scheduled" })).at, "2026-08-18T07:00:00.000Z");
  assert.equal(nextActionDisplay(item({ status: "sent" })).label, he.requests.nextActionWaitingFill);
  assert.equal(
    nextActionDisplay(
      item({
        status: "sent",
        reminderDueAt: "2026-08-19T07:00:00.000Z",
        reminderSentAt: null,
      }),
    ).label,
    he.requests.nextActionReminder,
  );
  assert.equal(
    nextActionDisplay(
      item({
        status: "in_progress",
        reminderDueAt: "2026-08-19T07:00:00.000Z",
        reminderSentAt: null,
      }),
    ).at,
    "2026-08-19T07:00:00.000Z",
  );
  assert.equal(nextActionDisplay(item({ status: "completed" })).label, he.requests.nextActionNone);
  assert.equal(nextActionDisplay(item({ status: "failed" })).label, he.requests.nextActionNeedsAttention);
});

test("completed requests never show a next reminder even if reminder_due_at remains", () => {
  const completed = reminderSummary(
    item({
      status: "completed",
      reminderDueAt: "2026-08-20T07:00:00.000Z",
      reminderSentAt: null,
    }),
  );
  assert.equal(completed.value, he.requests.reminderNoFurther);
  assert.equal(completed.label.includes("הבאה"), false);
  assert.equal(completed.value.includes("הבאה"), false);

  const sentReminder = reminderSummary(
    item({
      status: "in_progress",
      reminderSentAt: "2026-08-19T08:00:00.000Z",
      reminderDueAt: "2026-08-19T07:00:00.000Z",
    }),
  );
  assert.equal(sentReminder.label, he.requests.reminderSent);

  const upcoming = reminderSummary(
    item({
      status: "sent",
      reminderDueAt: "2026-08-19T07:00:00.000Z",
      reminderSentAt: null,
    }),
  );
  assert.equal(upcoming.label, he.requests.nextReminder);

  const none = reminderSummary(item({ status: "scheduled" }));
  assert.equal(none.value, he.requests.reminderNotDefined);
});

test("missing required fields include unanswered file fields", () => {
  const missing = missingRequiredFields([summary, fileField], { summary: "טקסט" }, []);
  assert.deepEqual(missing.map((field) => field.id), ["doc"]);
  assert.equal(missingRequiredFields([summary, fileField], { summary: "טקסט" }, [{ fieldId: "doc" }]).length, 0);
});

test("file size stays unknown when metadata is missing and does not round small files to 0 KB", () => {
  assert.equal(parseFileSizeBytes(0), null);
  assert.equal(parseFileSizeBytes(null), null);
  assert.equal(formatFileSize(null), "—");
  assert.equal(formatFileSize(0), "—");
  assert.equal(formatFileSize(400), "400 B");
  assert.equal(fileCountLabel(0), he.requests.fileCountNone);
  assert.equal(fileCountLabel(1), he.requests.fileCountOne);
  assert.equal(fileCountLabel(3), "3 קבצים");
});

test("recurrence is one-time or repeating only", () => {
  assert.equal(recurrenceLabel({ type: "once", date: "2026-08-18", time: "10:00", timezone: "Asia/Jerusalem" }), he.workflow.once);
  assert.equal(recurrenceLabel({ type: "send_now" }), he.workflow.once);
  assert.equal(
    recurrenceLabel({ type: "weekly", weekday: 1, time: "10:00", timezone: "Asia/Jerusalem" }),
    he.workflow.recurring,
  );
  assert.equal(
    recurrenceLabel({ type: "monthly", day: 1, time: "10:00", timezone: "Asia/Jerusalem" }),
    he.workflow.recurring,
  );
  assert.equal(recurrenceLabel({ type: "manual" }), he.workflow.manual);
  assert.equal(recurrenceLabel(null), "—");
});

test("run period uses scheduled_for and schedule type", () => {
  const label = runPeriodLabel("2026-08-18T07:00:00.000Z", {
    type: "weekly",
    weekday: 1,
    time: "10:00",
    timezone: "Asia/Jerusalem",
  });
  assert.equal(label.includes(he.workflow.weekly), true);
  assert.equal(label.includes(he.workflow.monday), true);

  const line = runLine("2026-08-18T07:00:00.000Z", {
    type: "weekly",
    weekday: 1,
    time: "10:00",
    timezone: "Asia/Jerusalem",
  });
  assert.equal(line.startsWith(`${he.requests.runLabel}: ${he.workflow.weekly} · `), true);
});

