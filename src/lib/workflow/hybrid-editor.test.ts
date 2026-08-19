import assert from "node:assert/strict";
import { test } from "node:test";

import { resolveEmailSubject, stripRecipientFromSubject } from "./email-subject";
import { FILE_PRESET_MIME, resolveFileMimeTypes } from "./file-presets";
import { emptyWorkflowDraft } from "./draft-schema";
import { mergeWorkflowDraft } from "./merge";
import type { WorkflowCompilerResult } from "./compiler-result";

function patch(overrides: Partial<WorkflowCompilerResult> = {}): WorkflowCompilerResult {
  return {
    assistantMessage: "טיוטה",
    name: "דוח שעות",
    recipientMode: "fixed",
    recipients: [{ name: "פלדה בנגב", email: null }],
    scheduleType: "weekly",
    scheduleDate: null,
    scheduleTime: null,
    scheduleWeekday: null,
    scheduleDay: null,
    emailSubject: "בקשה לקבלת דוח שעות עובדים – פלדה בנגב",
    emailBody: "נא למלא.",
    fields: [
      {
        id: null,
        type: "file",
        label: "דוח שעות",
        required: true,
        helpText: null,
        allowedMimeTypes: ["application/pdf"],
        maxFiles: 1,
        maxFileSizeMb: 10,
      },
    ],
    removedFieldIds: [],
    reminderEnabled: false,
    reminderAfterHours: null,
    warnings: [],
    ...overrides,
  };
}

test("a generic timesheet file is not limited to PDF", () => {
  const types = resolveFileMimeTypes({
    label: "דוח שעות",
    userMessage: "תהליך שבועי לקבלת דוח שעות",
    incoming: ["application/pdf"],
  });
  assert.deepEqual(types, FILE_PRESET_MIME.all);
  assert.equal(types.includes("application/pdf"), true);
  assert.ok(types.length > 1);
});

test("an explicit PDF invoice stays PDF only", () => {
  assert.deepEqual(
    resolveFileMimeTypes({
      label: "חשבונית PDF",
      userMessage: "שלח בקשה לחשבונית PDF",
      incoming: [],
    }),
    ["application/pdf"],
  );
});

test("email subject does not keep the recipient name", () => {
  assert.equal(
    stripRecipientFromSubject("בקשה לקבלת דוח שעות עובדים – פלדה בנגב", ["פלדה בנגב"]),
    "בקשה לקבלת דוח שעות עובדים",
  );
  const merged = mergeWorkflowDraft({
    current: emptyWorkflowDraft(),
    result: patch(),
    userMessage: "תהליך שבועי לקבלת דוח שעות מפלדה בנגב",
    mailboxId: null,
    createId: () => "file-1",
  });
  assert.equal(merged.email.subject.includes("פלדה בנגב"), false);
  assert.equal(merged.fields[0]?.type, "file");
  if (merged.fields[0]?.type === "file") {
    assert.ok(merged.fields[0].allowedMimeTypes.length > 1);
  }
});

test("a locked subject is kept unless the user asks to change it", () => {
  const current = mergeWorkflowDraft({
    current: emptyWorkflowDraft(),
    result: patch({ emailSubject: "דוח שעות עובדים" }),
    userMessage: "תהליך שבועי לקבלת דוח שעות",
    mailboxId: null,
    createId: () => "file-1",
  });
  current.editorLocks = { emailSubject: true };
  current.email.subject = "נושא ידני";
  const next = mergeWorkflowDraft({
    current,
    result: patch({
      scheduleType: "unchanged",
      emailSubject: "בקשה לקבלת דוח שעות עובדים – פלדה בנגב",
    }),
    userMessage: "הוסף את המייל office@example.com",
    mailboxId: null,
  });
  assert.equal(next.email.subject, "נושא ידני");
});

test("choosing a reminder chip enables it without a conversation blocker", () => {
  const current = mergeWorkflowDraft({
    current: emptyWorkflowDraft(),
    result: patch({
      recipients: [{ name: "פלדה בנגב", email: "office@example.com" }],
      scheduleWeekday: 0,
      scheduleTime: "09:15",
    }),
    userMessage: "office@example.com בשעה 09:15 ביום ראשון",
    mailboxId: null,
    createId: () => "file-1",
  });
  const next = mergeWorkflowDraft({
    current,
    result: patch({
      scheduleType: "unchanged",
      reminderEnabled: false,
    }),
    userMessage: "אחרי יומיים",
    mailboxId: null,
  });
  assert.equal(next.reminder.enabled, true);
  assert.equal(next.reminder.afterHours, 48);
  assert.equal(next.reminderDecision, "enabled");
});

test("resolveEmailSubject keeps a user-specified subject", () => {
  assert.equal(
    resolveEmailSubject({
      incoming: "דוח שעות עובדים – אוגוסט",
      current: "",
      recipientNames: ["פלדה בנגב"],
      userMessage: "הנושא: דוח שעות עובדים – אוגוסט",
      locked: false,
    }),
    "דוח שעות עובדים – אוגוסט",
  );
});
