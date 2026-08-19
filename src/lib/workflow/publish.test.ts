import assert from "node:assert/strict";
import { test } from "node:test";

import { canPublish, getPublishIssues } from "./publish";
import { parseWorkflowDefinition, type WorkflowDefinition } from "./schema";
import { parseWorkflowDraft } from "./draft-schema";
import { he } from "@/lib/i18n/he";

const tz = "Asia/Jerusalem" as const;

function base(overrides: Partial<WorkflowDefinition> = {}): WorkflowDefinition {
  return {
    version: 1,
    name: "תהליך בדיקה",
    senderMailboxId: null,
    recipientMode: "fixed",
    recipients: [{ name: "רוני", email: "roni@example.com" }],
    schedule: { type: "send_now" },
    email: { subject: "נושא", body: "גוף" },
    fields: [{ id: "summary", type: "long_text", label: "סיכום", required: true, helpText: null }],
    reminder: { enabled: false, afterHours: null },
    ...overrides,
  };
}

test("fixed recipients still required for send_now and scheduled types", () => {
  const emptyFixed = base({ recipients: [] });
  assert.equal(canPublish(emptyFixed), false);
  assert.ok(getPublishIssues(emptyFixed).length > 0);

  const weeklyEmpty = base({
    recipients: [],
    schedule: { type: "weekly", weekday: 1, time: "10:00", timezone: tz },
  });
  assert.equal(canPublish(weeklyEmpty), false);
});

test("at_launch is allowed only on manual and may have zero recipients", () => {
  const manual = base({
    recipientMode: "at_launch",
    recipients: [],
    schedule: { type: "manual" },
  });
  assert.equal(canPublish(manual), true);

  const weeklyAtLaunch = base({
    recipientMode: "at_launch",
    recipients: [],
    schedule: { type: "weekly", weekday: 1, time: "10:00", timezone: tz },
  });
  assert.equal(canPublish(weeklyAtLaunch), false);
  assert.ok(getPublishIssues(weeklyAtLaunch).some((issue) => issue.includes("ידני")));

  const sendNowAtLaunch = base({
    recipientMode: "at_launch",
    schedule: { type: "send_now" },
  });
  assert.equal(canPublish(sendNowAtLaunch), false);
});

test("legacy JSON without recipientMode still publishes as fixed send_now", () => {
  const parsed = parseWorkflowDefinition({
    version: 1,
    name: "ישן",
    senderMailboxId: null,
    recipients: [{ name: "רוני", email: "roni@example.com" }],
    schedule: { type: "send_now" },
    email: { subject: "נושא", body: "גוף" },
    fields: [{ id: "summary", type: "long_text", label: "סיכום", required: true, helpText: null }],
    reminder: { enabled: false, afterHours: null },
  });
  assert.equal(parsed.success, true);
  if (!parsed.success) {
    return;
  }
  assert.equal(canPublish(parsed.data), true);
});

test("publish issues name the missing schedule part instead of the whole schedule", () => {
  const monthly = parseWorkflowDraft({
    version: 1,
    name: "חודשי",
    recipients: [{ name: "רוני", email: "roni@example.com" }],
    schedule: { type: "monthly", day: 25 },
    email: { subject: "נושא", body: "גוף" },
    fields: [{ id: "summary", type: "long_text", label: "סיכום", required: true, helpText: null }],
  });
  assert.equal(monthly.success, true);
  if (!monthly.success) {
    return;
  }
  const issues = getPublishIssues(monthly.data);
  assert.deepEqual(
    issues.filter((item) => item.includes("תזמון") || item.includes("שעת") || item.includes("אופן")),
    [he.workflows.missingScheduleTime],
  );
  assert.equal(canPublish(monthly.data), false);
});
