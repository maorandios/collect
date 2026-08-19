import assert from "node:assert/strict";
import { test } from "node:test";

import { he } from "@/lib/i18n/he";
import { reconcileAssistantMessage } from "./assistant-message";
import { emptyWorkflowDraft } from "./draft-schema";
import { mergeWorkflowDraft } from "./merge";
import type { WorkflowCompilerResult } from "./compiler-result";
import { getPublishIssues } from "./publish";
import { computeReadyToPublish } from "./readiness";
import { roniExampleWorkflow } from "./example";

function patch(overrides: Partial<WorkflowCompilerResult> = {}): WorkflowCompilerResult {
  return {
    assistantMessage: "עדכנתי",
    name: null,
    recipientMode: null,
    recipients: null,
    scheduleType: "unchanged",
    scheduleDate: null,
    scheduleTime: null,
    scheduleWeekday: null,
    scheduleDay: null,
    emailSubject: null,
    emailBody: null,
    fields: null,
    removedFieldIds: [],
    reminderEnabled: null,
    reminderAfterHours: null,
    warnings: [],
    ...overrides,
  };
}

test("missing emails are not invented and existing field ids are kept", () => {
  const current = emptyWorkflowDraft();
  current.fields = [
    {
      id: "summary",
      type: "long_text",
      label: "סיכום",
      required: true,
      helpText: null,
    },
  ];
  const merged = mergeWorkflowDraft({
    current,
    result: patch({
      name: "סיכום חודשי",
      recipients: [{ name: "רוני", email: "roni@example.com" }],
      fields: [
        {
          id: "summary",
          type: "long_text",
          label: "סיכום העבודה",
          required: true,
          helpText: null,
          allowedMimeTypes: [],
          maxFiles: null,
          maxFileSizeMb: null,
        },
      ],
    }),
    userMessage: "שלח לרוני בקשה לסיכום העבודה",
    mailboxId: null,
    createId: () => "should-not-run",
  });
  assert.equal(merged.recipients[0]?.name, "רוני");
  assert.equal(merged.recipients[0]?.email, "");
  assert.equal(merged.fields[0]?.id, "summary");
  assert.equal(merged.fields[0]?.label, "סיכום העבודה");
});

test("a field is kept unless it appears in removedFieldIds", () => {
  const current = emptyWorkflowDraft();
  current.fields = [
    { id: "summary", type: "long_text", label: "סיכום", required: true, helpText: null },
    { id: "invoice", type: "short_text", label: "חשבונית", required: true, helpText: null },
  ];
  const withoutRemoval = mergeWorkflowDraft({
    current,
    result: patch({
      fields: [
        {
          id: "summary",
          type: "long_text",
          label: "סיכום",
          required: true,
          helpText: null,
          allowedMimeTypes: [],
          maxFiles: null,
          maxFileSizeMb: null,
        },
      ],
    }),
    userMessage: "רק סיכום",
    mailboxId: null,
  });
  assert.deepEqual(
    withoutRemoval.fields.map((field) => field.id),
    ["summary", "invoice"],
  );

  const withRemoval = mergeWorkflowDraft({
    current,
    result: patch({
      removedFieldIds: ["invoice"],
      fields: [
        {
          id: "summary",
          type: "long_text",
          label: "סיכום",
          required: true,
          helpText: null,
          allowedMimeTypes: [],
          maxFiles: null,
          maxFileSizeMb: null,
        },
      ],
    }),
    userMessage: "הסר את החשבונית",
    mailboxId: null,
  });
  assert.deepEqual(
    withRemoval.fields.map((field) => field.id),
    ["summary"],
  );
});

test("readyToPublish is computed on the server and stays false without a mailbox", () => {
  const exampleDraft = {
    ...roniExampleWorkflow,
    reminderDecision: "declined" as const,
    editorLocks: {},
  };
  assert.equal(computeReadyToPublish(exampleDraft, { hasMailbox: false }), false);
  assert.equal(computeReadyToPublish(exampleDraft, { hasMailbox: true }), true);
  assert.equal(computeReadyToPublish(emptyWorkflowDraft(), { hasMailbox: true }), false);
});

test("monthly day without time is kept and only asks for the time", () => {
  const merged = mergeWorkflowDraft({
    current: emptyWorkflowDraft(),
    result: patch({
      name: "איסוף מרוני",
      recipients: [{ name: "רוני", email: "roni@example.com" }],
      scheduleType: "monthly",
      scheduleDay: 25,
      scheduleTime: null,
      emailSubject: "נושא",
      emailBody: "גוף",
      fields: [
        {
          id: null,
          type: "long_text",
          label: "סיכום",
          required: true,
          helpText: null,
          allowedMimeTypes: [],
          maxFiles: null,
          maxFileSizeMb: null,
        },
      ],
    }),
    userMessage: "בכל 25 בחודש שלח לרוני roni@example.com",
    mailboxId: "11111111-1111-1111-1111-111111111111",
    createId: () => "summary",
  });
  assert.equal(merged.schedule?.type, "monthly");
  if (merged.schedule?.type === "monthly") {
    assert.equal(merged.schedule.day, 25);
    assert.equal(merged.schedule.time, null);
  }
  const issues = getPublishIssues(merged);
  assert.equal(issues.includes(he.workflows.missingScheduleTime), true);
  assert.equal(issues.includes(he.workflows.missingSchedule), false);
  assert.equal(issues.includes(he.workflows.missingEventMode), false);
  const message = reconcileAssistantMessage("הכנתי טיוטה לשליחה חודשית בכל 25 בחודש.", merged);
  assert.equal(/שעה/.test(message), true);
  assert.equal(/מייל/.test(message), false);
});

test("weekly weekday without time is kept", () => {
  const merged = mergeWorkflowDraft({
    current: emptyWorkflowDraft(),
    result: patch({
      scheduleType: "weekly",
      scheduleWeekday: 0,
      scheduleTime: null,
    }),
    userMessage: "בכל יום ראשון",
    mailboxId: null,
  });
  assert.equal(merged.schedule?.type, "weekly");
  if (merged.schedule?.type === "weekly") {
    assert.equal(merged.schedule.weekday, 0);
    assert.equal(merged.schedule.time, null);
  }
  assert.equal(getPublishIssues(merged).includes(he.workflows.missingScheduleTime), true);
});

test("once keeps a partial date without inventing a time", () => {
  const merged = mergeWorkflowDraft({
    current: emptyWorkflowDraft(),
    result: patch({
      scheduleType: "once",
      scheduleDate: "2026-08-20",
      scheduleTime: null,
    }),
    userMessage: "שלח מחר",
    mailboxId: null,
  });
  assert.equal(merged.schedule?.type, "once");
  if (merged.schedule?.type === "once") {
    assert.equal(merged.schedule.date, "2026-08-20");
    assert.equal(merged.schedule.time, null);
  }
});

test("no schedule information does not invent manual or send_now", () => {
  const merged = mergeWorkflowDraft({
    current: emptyWorkflowDraft(),
    result: patch({
      scheduleType: "unchanged",
    }),
    userMessage: "אסוף סיכום עבודה מרוני",
    mailboxId: null,
  });
  assert.equal(merged.schedule, undefined);
  assert.equal(getPublishIssues(merged).includes(he.workflows.missingEventMode), true);
});
