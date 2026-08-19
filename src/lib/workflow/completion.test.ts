import assert from "node:assert/strict";
import { test } from "node:test";

import { buildLoopAssistantMessage, getCompletionState, selectNextQuestions } from "./completion";
import { emptyWorkflowDraft, type WorkflowDraftDefinition } from "./draft-schema";
import { mergeWorkflowDraft } from "./merge";
import type { WorkflowCompilerResult } from "./compiler-result";

function patch(overrides: Partial<WorkflowCompilerResult> = {}): WorkflowCompilerResult {
  return {
    assistantMessage: "טיוטה",
    name: "איסוף מרוני",
    recipientMode: "fixed",
    recipients: [{ name: "רוני", email: null }],
    scheduleType: "monthly",
    scheduleDate: null,
    scheduleTime: null,
    scheduleWeekday: null,
    scheduleDay: 25,
    emailSubject: "בקשה",
    emailBody: "שלום רוני",
    fields: [
      {
        id: "summary",
        type: "long_text",
        label: "סיכום עבודה",
        required: true,
        helpText: null,
        allowedMimeTypes: [],
        maxFiles: null,
        maxFileSizeMb: null,
      },
      {
        id: "invoice",
        type: "file",
        label: "חשבונית PDF",
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

function uniqueId() {
  let index = 0;
  return () => `field-${(index += 1)}`;
}

function keys(draft: WorkflowDraftDefinition, options: { hasMailbox: boolean; userMessage?: string }) {
  const state = getCompletionState(draft, options);
  return {
    conversation: state.conversationIssues.map((issue) => issue.key),
    external: state.externalIssues.map((issue) => issue.key),
    questions: state.nextQuestions.map((issue) => issue.key),
    draftComplete: state.draftComplete,
    readyToPublish: state.readyToPublish,
  };
}

test("turn 1 keeps monthly day fields and recipient name then asks email and time", () => {
  const draft = mergeWorkflowDraft({
    current: emptyWorkflowDraft(),
    result: patch(),
    userMessage: "בכל 25 בחודש שלח לרוני בקשה לסיכום עבודה וחשבונית PDF",
    mailboxId: null,
    createId: uniqueId(),
  });
  assert.equal(draft.schedule?.type, "monthly");
  if (draft.schedule?.type === "monthly") {
    assert.equal(draft.schedule.day, 25);
    assert.equal(draft.schedule.time, null);
  }
  assert.equal(draft.recipients[0]?.name, "רוני");
  assert.equal(draft.fields.length, 2);
  const state = getCompletionState(draft, { hasMailbox: false });
  assert.deepEqual(
    state.conversationIssues.map((issue) => issue.key).sort(),
    ["monthly_time_missing", "recipient_email_missing"].sort(),
  );
  assert.deepEqual(
    state.nextQuestions.map((issue) => issue.key),
    ["recipient_email_missing", "monthly_time_missing"],
  );
  assert.equal(state.draftComplete, false);
  assert.equal(state.externalIssues[0]?.key, "gmail_disconnected");
  const message = buildLoopAssistantMessage({ draft, completion: state });
  assert.match(message, /מייל/);
  assert.match(message, /שעה/);
  assert.equal(/Gmail/.test(message), false);
  assert.equal(/הפעלתי/.test(message), false);
});

test("turn 2 email and time complete the existing recipient and keep day 25", () => {
  const first = mergeWorkflowDraft({
    current: emptyWorkflowDraft(),
    result: patch(),
    userMessage: "בכל 25 בחודש שלח לרוני",
    mailboxId: null,
    createId: uniqueId(),
  });
  const second = mergeWorkflowDraft({
    current: first,
    result: patch({
      scheduleType: "unchanged",
      recipients: [{ name: "רוני", email: null }],
      fields: null,
    }),
    userMessage: "roni@example.com בשעה 09:00",
    mailboxId: null,
  });
  assert.equal(second.recipients.length, 1);
  assert.equal(second.recipients[0]?.email, "roni@example.com");
  assert.equal(second.schedule?.type, "monthly");
  if (second.schedule?.type === "monthly") {
    assert.equal(second.schedule.day, 25);
    assert.equal(second.schedule.time, "09:00");
  }
  assert.equal(second.fields.length, 2);
  const disconnected = getCompletionState(second, { hasMailbox: false });
  assert.deepEqual(disconnected.conversationIssues, []);
  assert.equal(disconnected.draftComplete, true);
  assert.equal(disconnected.readyToPublish, false);
  assert.equal(disconnected.externalIssues[0]?.key, "gmail_disconnected");
  assert.match(
    buildLoopAssistantMessage({ draft: second, completion: disconnected }),
    /מוכן/,
  );
  const connected = getCompletionState(second, { hasMailbox: true, mailboxStatus: "connected" });
  assert.equal(connected.readyToPublish, true);
  assert.equal(connected.nextQuestions[0]?.key, "reminder_offer");
  assert.equal(connected.draftComplete, true);
});

test("answering only the email leaves the time question", () => {
  const first = mergeWorkflowDraft({
    current: emptyWorkflowDraft(),
    result: patch(),
    userMessage: "בכל 25 בחודש",
    mailboxId: null,
    createId: uniqueId(),
  });
  const second = mergeWorkflowDraft({
    current: first,
    result: patch({ scheduleType: "unchanged", recipients: [{ name: "רוני", email: null }], fields: null }),
    userMessage: "roni@example.com",
    mailboxId: null,
  });
  const state = keys(second, { hasMailbox: true });
  assert.deepEqual(state.conversation, ["monthly_time_missing"]);
  assert.deepEqual(state.questions, ["monthly_time_missing"]);
});

test("an invalid email is asked again as validation", () => {
  const draft = mergeWorkflowDraft({
    current: emptyWorkflowDraft(),
    result: patch(),
    userMessage: "בכל 25 בחודש",
    mailboxId: null,
    createId: uniqueId(),
  });
  const state = getCompletionState(draft, { hasMailbox: true, userMessage: "roni@" });
  const emailIssue = state.conversationIssues.find((issue) => issue.key.startsWith("recipient_email"));
  assert.equal(emailIssue?.key, "recipient_email_invalid");
  assert.match(emailIssue?.question ?? "", /אינה תקינה/);
});

test("an ambiguous time asks for a precise hour", () => {
  const draft = mergeWorkflowDraft({
    current: emptyWorkflowDraft(),
    result: patch({ recipients: [{ name: "רוני", email: "roni@example.com" }] }),
    userMessage: "בכל 25 בחודש roni@example.com",
    mailboxId: null,
    createId: uniqueId(),
  });
  const state = getCompletionState(draft, { hasMailbox: true, userMessage: "בבוקר" });
  assert.equal(state.nextQuestions[0]?.key, "schedule_time_ambiguous");
});

test("refresh does not return questions that are already resolved", () => {
  const complete = mergeWorkflowDraft({
    current: emptyWorkflowDraft(),
    result: patch({
      recipients: [{ name: "רוני", email: "roni@example.com" }],
      scheduleTime: "09:00",
    }),
    userMessage: "roni@example.com בשעה 09:00",
    mailboxId: "11111111-1111-4111-8111-111111111111",
    createId: uniqueId(),
  });
  const refreshed = getCompletionState(complete, { hasMailbox: true, mailboxStatus: "connected" });
  assert.equal(refreshed.nextQuestions[0]?.key, "reminder_offer");
  assert.equal(refreshed.draftComplete, true);
  assert.equal(refreshed.readyToPublish, true);
  const declined = getCompletionState(
    { ...complete, reminderDecision: "declined" },
    { hasMailbox: true, mailboxStatus: "connected" },
  );
  assert.equal(declined.nextQuestions.length, 0);
});

test("a contradictory model message is replaced by the server state", () => {
  const draft = emptyWorkflowDraft();
  const completion = getCompletionState(draft, { hasMailbox: true });
  const message = buildLoopAssistantMessage({ draft, completion });
  assert.equal(/חודשי/.test(message), false);
  assert.equal(completion.nextQuestions[0]?.key, "event_mode_missing");
});

test("missing schedule asks for event mode and missing fields ask what to collect", () => {
  const noSchedule = getCompletionState(emptyWorkflowDraft(), { hasMailbox: true });
  assert.equal(noSchedule.nextQuestions[0]?.key, "event_mode_missing");
  const withSchedule = mergeWorkflowDraft({
    current: emptyWorkflowDraft(),
    result: patch({
      fields: [],
      recipients: [{ name: "רוני", email: "roni@example.com" }],
      scheduleTime: "09:00",
    }),
    userMessage: "בכל 25 בחודש",
    mailboxId: null,
  });
  const fieldsState = getCompletionState(withSchedule, { hasMailbox: true });
  assert.equal(fieldsState.conversationIssues.some((issue) => issue.key === "fields_missing"), true);
});

test("gmail stays external and reminder is not a conversation blocker", () => {
  const draft = mergeWorkflowDraft({
    current: emptyWorkflowDraft(),
    result: patch({
      recipients: [{ name: "רוני", email: "roni@example.com" }],
      scheduleTime: "09:00",
      reminderEnabled: false,
    }),
    userMessage: "roni@example.com 09:00",
    mailboxId: null,
    createId: uniqueId(),
  });
  const state = getCompletionState(draft, { hasMailbox: false });
  assert.equal(state.conversationIssues.length, 0);
  assert.equal(state.externalIssues[0]?.resolution, "settings");
  assert.equal(state.externalIssues[0]?.settingsHref, "/settings");
  assert.equal(selectNextQuestions(state.conversationIssues).length, 0);
  assert.equal(state.nextQuestions[0]?.key, "reminder_offer");
});

test("omitted fields are restored by merge", () => {
  const first = mergeWorkflowDraft({
    current: emptyWorkflowDraft(),
    result: patch(),
    userMessage: "בכל 25 בחודש",
    mailboxId: null,
    createId: uniqueId(),
  });
  const second = mergeWorkflowDraft({
    current: first,
    result: patch({
      scheduleType: "unchanged",
      fields: [
        {
          id: first.fields[0]?.id ?? null,
          type: "long_text",
          label: "סיכום עבודה",
          required: true,
          helpText: null,
          allowedMimeTypes: [],
          maxFiles: null,
          maxFileSizeMb: null,
        },
      ],
    }),
    userMessage: "הוסף שעה",
    mailboxId: null,
  });
  assert.equal(second.fields.length, 2);
});
