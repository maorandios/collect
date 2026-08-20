import assert from "node:assert/strict";
import { test } from "node:test";

import { he } from "@/lib/i18n/he";
import { getCompletionState } from "./completion";
import { unconfiguredField, unconfiguredFieldsMessage } from "./draft-fields";
import { emptyWorkflowDraft, parseWorkflowDraft } from "./draft-schema";
import { ALL_SUPPORTED_FILE_MIME_TYPES } from "./file-formats";
import { buildFieldFromEditor } from "./field-editor";
import { mergePointEdit } from "./point-edit";
import { getPublishIssues } from "./publish";
import { TIMEZONE, parseWorkflowDefinition } from "./schema";
import { applySetupUserTurn, startSetup } from "./setup-agent";
import { buildSetupReviewModel } from "./setup-review";
import { conversationModeOf, emptySetupState } from "./setup-state";
import { leftPaneIsEmpty } from "./setup-ui";

const INDUSTRIES_MESSAGE = "קבלת דוח עובדים, חשבוניות קבלות ותדפיס בנק באופן חודשי מגעש תעשיות מתכת";

function toReview() {
  const started = startSetup(0, emptyWorkflowDraft());
  const first = applySetupUserTurn({ current: started, userMessage: INDUSTRIES_MESSAGE });
  const contact = applySetupUserTurn({ current: first.setup, userMessage: "שלומי חביבה" });
  const email = applySetupUserTurn({ current: contact.setup, userMessage: "gam@gmail.com" });
  const day = applySetupUserTurn({ current: email.setup, userMessage: "סוף החודש" });
  const time = applySetupUserTurn({ current: day.setup, userMessage: "16:00" });
  return applySetupUserTurn({ current: time.setup, userMessage: "אחרי יום" });
}

test("setup chat identifies four requirements and never asks for input types", () => {
  const first = applySetupUserTurn({
    current: startSetup(0, emptyWorkflowDraft()),
    userMessage: INDUSTRIES_MESSAGE,
  });
  assert.equal(first.setup.requirements.length, 4);
  assert.equal(first.setup.proposal.fields.length, 4);
  assert.equal(first.setup.proposal.fields.every((field) => field.type === "unconfigured"), true);
  assert.equal(first.setup.nextQuestion?.key, "contact_name");
  assert.equal(first.assistantMessage.includes("איך תרצה לקבל"), false);
  assert.match(first.assistantMessage, /מה שם איש הקשר בחברה/);
  assert.equal(leftPaneIsEmpty(first.setup, emptyWorkflowDraft()), true);
});

test("a review schedule patch stays in review and keeps the rest of the proposal", () => {
  const review = toReview();
  assert.equal(review.setup.status, "review");
  assert.equal(conversationModeOf(review.setup), "review");
  const before = JSON.parse(JSON.stringify(review.setup.proposal)) as typeof review.setup.proposal;
  const patched = applySetupUserTurn({
    current: review.setup,
    userMessage: "תשנה את המחזוריות לפעם בחודש בתאריך 15",
  });
  assert.equal(patched.invalid, false);
  assert.equal(patched.setup.status, "review");
  assert.equal(conversationModeOf(patched.setup), "review");
  assert.equal(patched.setup.nextQuestion?.key, "review");
  assert.equal(patched.assistantMessage.includes("לאיזו כתובת מייל"), false);
  assert.equal(patched.assistantMessage, "עדכנתי את השליחה ל־15 בכל חודש בשעה 16:00.");
  const schedule = patched.setup.proposal.schedule;
  assert.equal(schedule?.type, "monthly");
  if (schedule?.type === "monthly") {
    assert.equal(schedule.day, 15);
    assert.equal(schedule.time, "16:00");
    assert.equal(schedule.monthlyDayMode, "specific_day");
    assert.equal(schedule.timezone, TIMEZONE);
  }
  assert.equal(patched.setup.proposal.recipients[0]?.organizationName, before.recipients[0]?.organizationName);
  assert.equal(patched.setup.proposal.recipients[0]?.name, before.recipients[0]?.name);
  assert.equal(patched.setup.proposal.recipients[0]?.email, before.recipients[0]?.email);
  assert.deepEqual(
    patched.setup.proposal.fields.map((field) => field.label),
    before.fields.map((field) => field.label),
  );
  assert.deepEqual(patched.setup.proposal.reminder, before.reminder);
  assert.equal(patched.setup.proposal.email.body, before.email.body);
  const model = buildSetupReviewModel(patched.setup);
  assert.equal(model.schedule.includes("15"), true);
  assert.deepEqual(model.fields, ["דוח עובדים", "חשבוניות", "קבלות", "תדפיס בנק"]);
});

test("building the process switches the chat to edit and does not restart setup", () => {
  const review = toReview();
  const built = {
    ...review.setup,
    status: "completed" as const,
    conversationMode: "edit" as const,
    pendingEdit: null,
    nextQuestion: null,
  };
  assert.equal(conversationModeOf(built), "edit");
  const edited = applySetupUserTurn({
    current: built,
    userMessage: "תוסיף גם אישור ניהול ספרים",
  });
  assert.equal(edited.invalid, false);
  assert.equal(edited.setup.status, "completed");
  assert.equal(conversationModeOf(edited.setup), "edit");
  assert.equal(edited.setup.nextQuestion, null);
  assert.equal(edited.setup.proposal.fields.length, 5);
  assert.equal(edited.setup.proposal.fields.filter((field) => field.label === "אישור ניהול ספרים").length, 1);
  assert.equal(edited.setup.proposal.fields.at(-1)?.type, "unconfigured");
  assert.equal(edited.setup.proposal.recipients[0]?.email, "gam@gmail.com");
  assert.match(edited.assistantMessage, /הוספתי את „אישור ניהול ספרים” לטופס/);
  assert.equal(edited.assistantMessage.includes("מה שם איש הקשר"), false);
});

test("edit mode can change schedule, recipient, and remove a field without setup questions", () => {
  const review = toReview();
  const built = {
    ...review.setup,
    status: "completed" as const,
    conversationMode: "edit" as const,
    nextQuestion: null,
    pendingEdit: null,
  };
  const schedule = applySetupUserTurn({
    current: built,
    userMessage: "תשנה את השליחה ל־10 בכל חודש בשעה 09:00",
  });
  assert.equal(schedule.assistantMessage, "עדכנתי את השליחה ל־10 בכל חודש בשעה 09:00.");
  const email = applySetupUserTurn({
    current: schedule.setup,
    userMessage: "תחליף את כתובת המייל ל־office@gaash.co.il",
  });
  assert.equal(email.assistantMessage, "כתובת המייל עודכנה ל־office@gaash.co.il.");
  const removed = applySetupUserTurn({
    current: email.setup,
    userMessage: "תוריד את תדפיס הבנק",
  });
  assert.equal(removed.assistantMessage, "הסרתי את „תדפיס בנק” מהטופס.");
  assert.equal(removed.setup.proposal.fields.some((field) => field.label === "תדפיס בנק"), false);
  assert.equal(conversationModeOf(removed.setup), "edit");
});

test("an incomplete edit asks only for the missing schedule type", () => {
  const review = toReview();
  const built = {
    ...review.setup,
    status: "completed" as const,
    conversationMode: "edit" as const,
    nextQuestion: null,
    pendingEdit: null,
  };
  const first = applySetupUserTurn({ current: built, userMessage: "תשנה את התזמון" });
  assert.equal(first.assistantMessage, he.studio.setup.askEditScheduleType);
  assert.equal(first.setup.pendingEdit?.target, "schedule");
  const second = applySetupUserTurn({ current: first.setup, userMessage: "חודשי" });
  assert.equal(second.setup.pendingEdit, null);
  assert.equal(second.setup.proposal.schedule?.type, "monthly");
  assert.equal(conversationModeOf(second.setup), "edit");
});

test("unconfigured fields are allowed in a draft and block publish", () => {
  const draft = {
    ...emptyWorkflowDraft(),
    name: "תהליך",
    recipients: [{ name: "רמי", email: "rami@gmail.com" }],
    schedule: { type: "monthly" as const, day: 15, time: "16:00", timezone: TIMEZONE, monthlyDayMode: "specific_day" as const },
    email: { subject: "נושא", body: "גוף" },
    fields: [
      unconfiguredField("employee_report", "דוח עובדים"),
      unconfiguredField("invoices", "חשבוניות"),
      unconfiguredField("receipts", "קבלות"),
      unconfiguredField("bank", "תדפיס בנק"),
    ],
    reminder: { enabled: true, afterHours: 24 },
  };
  assert.equal(parseWorkflowDraft(draft).success, true);
  assert.equal(parseWorkflowDefinition(draft).success, false);
  assert.equal(unconfiguredFieldsMessage(draft.fields), "נשאר לבחור סוג קלט עבור 4 שדות.");
  assert.equal(getPublishIssues(draft).includes("נשאר לבחור סוג קלט עבור 4 שדות."), true);
  const completion = getCompletionState(draft, { hasMailbox: true, mailboxStatus: "connected" });
  assert.equal(completion.readyToPublish, false);
  assert.equal(completion.externalIssues.some((issue) => issue.key === "unconfigured_fields"), true);
  assert.equal(completion.conversationIssues.some((issue) => issue.key === "unconfigured_fields"), false);

  const one = {
    ...draft,
    fields: [unconfiguredField("employee_report", "דוח עובדים")],
  };
  assert.equal(unconfiguredFieldsMessage(one.fields), "נשאר לבחור סוג קלט עבור „דוח עובדים”.");
});

test("choosing a file type on screen uses every supported mime type", () => {
  const field = buildFieldFromEditor({ type: "file", label: "דוח עובדים", required: true }, "employee_report");
  assert.equal(field.type, "file");
  if (field.type === "file") {
    assert.deepEqual(field.allowedMimeTypes, [...ALL_SUPPORTED_FILE_MIME_TYPES]);
  }
});

test("a revision conflict merges a schedule patch when the latest schedule is unchanged", () => {
  const base = {
    ...emptyWorkflowDraft(),
    schedule: { type: "monthly" as const, day: 31, time: "16:00", timezone: TIMEZONE, monthlyDayMode: "end_of_month" as const },
    recipients: [{ name: "שלומי", organizationName: "געש", email: "gam@gmail.com" }],
    fields: [unconfiguredField("a", "דוח עובדים")],
  };
  const latest = {
    ...base,
    fields: [
      unconfiguredField("a", "דוח עובדים"),
      { id: "b", type: "file" as const, label: "חשבוניות", required: true, helpText: null, allowedMimeTypes: [...ALL_SUPPORTED_FILE_MIME_TYPES], maxFiles: 1, maxFileSizeMb: 10 },
    ],
  };
  const merged = mergePointEdit(base, latest, {
    target: "month_day",
    recipientEmail: null,
    recipientName: null,
    weekday: null,
    time: null,
    monthDay: 15,
    date: null,
    scheduleType: "monthly",
    reminderEnabled: null,
    reminderAfterHours: null,
    fieldId: null,
    fieldType: null,
    fieldLabel: null,
    emailSubject: null,
    emailBody: null,
    name: null,
  });
  assert.equal(merged.ok, true);
  if (merged.ok) {
    assert.equal(merged.draft.schedule?.type, "monthly");
    if (merged.draft.schedule?.type === "monthly") {
      assert.equal(merged.draft.schedule.day, 15);
      assert.equal(merged.draft.schedule.time, "16:00");
    }
    assert.equal(merged.draft.fields.length, 2);
  }

  const conflictedLatest = {
    ...latest,
    schedule: { type: "monthly" as const, day: 1, time: "09:00", timezone: TIMEZONE, monthlyDayMode: "specific_day" as const },
  };
  const blocked = mergePointEdit(base, conflictedLatest, {
    target: "month_day",
    recipientEmail: null,
    recipientName: null,
    weekday: null,
    time: null,
    monthDay: 15,
    date: null,
    scheduleType: "monthly",
    reminderEnabled: null,
    reminderAfterHours: null,
    fieldId: null,
    fieldType: null,
    fieldLabel: null,
    emailSubject: null,
    emailBody: null,
    name: null,
  });
  assert.equal(blocked.ok, false);
});

test("edit mode never falls back to a new setup conversation", () => {
  const review = toReview();
  const built = emptySetupState(1, review.setup.proposal);
  built.status = "completed";
  built.conversationMode = "edit";
  built.requirements = review.setup.requirements;
  built.recipientIdentity = review.setup.recipientIdentity;
  built.reminderDecision = "enabled";
  const result = applySetupUserTurn({
    current: built,
    userMessage: "תוסיף גם אישור ניהול ספרים",
  });
  assert.equal(conversationModeOf(result.setup), "edit");
  assert.notEqual(result.setup.status, "collecting");
  assert.equal(result.setup.nextQuestion?.key === "contact_name", false);
});
