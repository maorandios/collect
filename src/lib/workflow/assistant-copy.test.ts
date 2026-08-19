import assert from "node:assert/strict";
import { test } from "node:test";

import { buildLoopAssistantMessage, getCompletionState } from "./completion";
import { emptyWorkflowDraft, type WorkflowDraftDefinition } from "./draft-schema";
import { TIMEZONE } from "./schema";

function weeklyDraft(overrides: Partial<WorkflowDraftDefinition> = {}): WorkflowDraftDefinition {
  return {
    ...emptyWorkflowDraft(),
    name: "דוח שעות",
    recipientMode: "fixed",
    recipients: [{ name: "פלדה בנגב", email: "" }],
    schedule: { type: "weekly", weekday: null, time: null, timezone: TIMEZONE },
    email: { subject: "בקשה לקבלת דוח שעות עובדים", body: "נא למלא את הדוח." },
    fields: [{ id: "hours", type: "file", label: "דוח שעות", required: true, helpText: null, allowedMimeTypes: ["application/pdf"], maxFiles: 1, maxFileSizeMb: 10 }],
    ...overrides,
  };
}

test("weekly first turn asks day time and email without listing the recipient", () => {
  const draft = weeklyDraft();
  const completion = getCompletionState(draft, { hasMailbox: true });
  const message = buildLoopAssistantMessage({ draft, completion });
  assert.match(message, /בקשה שבועית/);
  assert.match(message, /יום ושעה/);
  assert.match(message, /הנמען/);
  assert.equal(message.includes("פלדה בנגב"), false);
  assert.equal(message.includes("עם הנמען"), false);
  assert.equal(message.includes("ושדות"), false);
  assert.ok(message.trim().split(/\s+/).length <= 30);
});

test("after a time is set the assistant only asks for the weekday", () => {
  const draft = weeklyDraft({
    schedule: { type: "weekly", weekday: null, time: "09:15", timezone: TIMEZONE },
    recipients: [{ name: "פלדה בנגב", email: "office@example.com" }],
  });
  const completion = getCompletionState(draft, { hasMailbox: true });
  const message = buildLoopAssistantMessage({ draft, completion });
  assert.equal(message, "קבעתי שליחה לשעה 09:15. באיזה יום בשבוע לשלוח?");
});

test("after required fields the assistant offers a reminder once", () => {
  const draft = weeklyDraft({
    recipients: [{ name: "פלדה בנגב", email: "office@example.com" }],
    schedule: { type: "weekly", weekday: 0, time: "09:15", timezone: TIMEZONE },
  });
  const completion = getCompletionState(draft, { hasMailbox: true, mailboxStatus: "connected" });
  assert.equal(completion.draftComplete, true);
  assert.equal(completion.readyToPublish, true);
  assert.equal(completion.nextQuestions[0]?.key, "reminder_offer");
  assert.equal(
    buildLoopAssistantMessage({ draft, completion }),
    "התהליך מוכן. רוצה לשלוח תזכורת אוטומטית אם הטופס לא יושלם?",
  );
});

test("gmail copy appears only after the reminder is decided", () => {
  const draft = weeklyDraft({
    recipients: [{ name: "פלדה בנגב", email: "office@example.com" }],
    schedule: { type: "weekly", weekday: 0, time: "09:15", timezone: TIMEZONE },
    reminderDecision: "declined",
  });
  const completion = getCompletionState(draft, { hasMailbox: false });
  assert.equal(completion.draftComplete, true);
  assert.equal(completion.readyToPublish, false);
  assert.equal(buildLoopAssistantMessage({ draft, completion }), "הגדרת התהליך הושלמה. נשאר רק לחבר את Gmail.");
});
