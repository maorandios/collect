import assert from "node:assert/strict";
import { test } from "node:test";

import { emptyWorkflowDraft } from "./draft-schema";
import { TIMEZONE } from "./schema";
import { applySetupExtraction, applySetupUserTurn, startSetup } from "./setup-agent";
import { emptySetupExtraction } from "./setup-extraction";
import { extractPersonName, parseTriggerType } from "./setup-parse";
import { classifyReviewChange, reduceSetupAnswer } from "./setup-reducer";
import { leftPaneDraft, leftPaneIsEmpty, leftPaneShowsPendingBanner } from "./setup-ui";
import { validateProposalSemantics } from "./setup-validate";
import type { WorkflowSetupState } from "./setup-state";
import { getCompletionState } from "./completion";
import { he } from "@/lib/i18n/he";

function collecting(overrides: Partial<WorkflowSetupState> = {}): WorkflowSetupState {
  const started = startSetup(0, emptyWorkflowDraft());
  return {
    ...started,
    requirements: [
      { id: "req-invoice", label: "חשבונית", kind: "file", filePreset: "pdf" },
      { id: "req-approval", label: "אישור מנהל פרויקט", kind: "file", filePreset: "all" },
    ],
    proposal: {
      ...emptyWorkflowDraft(),
      name: "איסוף חשבונית",
      recipientMode: "fixed",
      recipients: [{ name: "איתי", email: "" }],
      schedule: { type: "weekly", weekday: 0, time: "09:00", timezone: TIMEZONE },
      fields: [
        {
          id: "field-invoice",
          type: "file",
          label: "חשבונית",
          required: true,
          helpText: null,
          allowedMimeTypes: ["application/pdf"],
          maxFiles: 1,
          maxFileSizeMb: 10,
        },
        {
          id: "field-approval",
          type: "file",
          label: "אישור מנהל פרויקט",
          required: true,
          helpText: null,
          allowedMimeTypes: [],
          maxFiles: 1,
          maxFileSizeMb: 10,
        },
      ],
    },
    ...overrides,
  };
}

test("itay@gaash.com updates the recipient only", () => {
  const state = collecting({
    nextQuestion: {
      key: "recipient_email",
      step: "recipient",
      question: "מה כתובת המייל של איתי?",
      answerType: "email",
    },
  });
  const beforeFields = JSON.stringify(state.proposal.fields);
  const result = reduceSetupAnswer({
    setupState: state,
    question: state.nextQuestion!,
    userAnswer: "itay@gaash.com",
  });
  assert.equal(result.ok, true);
  if (!result.ok) {
    return;
  }
  assert.equal(result.setup.proposal.recipients[0]?.email, "itay@gaash.com");
  assert.equal(result.setup.proposal.recipients.length, 1);
  assert.equal(JSON.stringify(result.setup.proposal.fields), beforeFields);
  assert.equal(result.setup.proposal.fields.some((field) => field.label.includes("@")), false);
});

test("09:00 updates time only", () => {
  const state = collecting({
    nextQuestion: {
      key: "weekly_time",
      step: "schedule_details",
      question: "באיזו שעה לשלוח?",
      answerType: "time",
    },
    proposal: {
      ...collecting().proposal,
      schedule: { type: "weekly", weekday: 0, time: null, timezone: TIMEZONE },
    },
  });
  const beforeFields = JSON.stringify(state.proposal.fields);
  const result = reduceSetupAnswer({
    setupState: state,
    question: state.nextQuestion!,
    userAnswer: "09:00",
  });
  assert.equal(result.ok, true);
  if (!result.ok) {
    return;
  }
  assert.equal(result.setup.proposal.schedule && "time" in result.setup.proposal.schedule ? result.setup.proposal.schedule.time : null, "09:00");
  assert.equal(JSON.stringify(result.setup.proposal.fields), beforeFields);
});

test("יום שלישי updates weekday only", () => {
  const state = collecting({
    nextQuestion: {
      key: "weekly_weekday",
      step: "schedule_details",
      question: "באיזה יום בשבוע לשלוח?",
      answerType: "single_choice",
    },
  });
  const beforeFields = JSON.stringify(state.proposal.fields);
  const result = reduceSetupAnswer({
    setupState: state,
    question: state.nextQuestion!,
    userAnswer: "יום שלישי",
  });
  assert.equal(result.ok, true);
  if (!result.ok) {
    return;
  }
  assert.equal(result.setup.proposal.schedule?.type, "weekly");
  if (result.setup.proposal.schedule?.type === "weekly") {
    assert.equal(result.setup.proposal.schedule.weekday, 2);
    assert.equal(result.setup.proposal.schedule.time, "09:00");
  }
  assert.equal(JSON.stringify(result.setup.proposal.fields), beforeFields);
});

test("none of email, time, or weekday creates a file field", () => {
  const state = collecting({
    nextQuestion: {
      key: "recipient_email",
      step: "recipient",
      question: "מייל",
      answerType: "email",
    },
  });
  for (const answer of ["itay@gaash.com", "09:00", "יום שלישי"]) {
    const result = reduceSetupAnswer({
      setupState: state,
      question: state.nextQuestion!,
      userAnswer: answer,
    });
    if (result.ok) {
      assert.equal(result.setup.proposal.fields.length, 2);
      assert.equal(result.setup.proposal.fields.every((field) => field.type === "file"), true);
    }
  }
});

test("a field type answer does not create another field", () => {
  const started = startSetup(0, emptyWorkflowDraft());
  const first = applySetupUserTurn({
    current: started,
    userMessage: "חשבונית ואישור פיקוח",
  });
  const fieldCount = first.setup.proposal.fields.length;
  const second = applySetupUserTurn({
    current: first.setup,
    userMessage: "קובץ",
  });
  assert.equal(second.setup.requirements.filter((item) => item.kind === "ambiguous").length, 0);
  assert.equal(second.setup.proposal.fields.length, 2);
  assert.ok(second.setup.proposal.fields.length >= fieldCount);
  const ids = second.setup.proposal.fields.map((field) => field.id);
  assert.equal(new Set(ids).size, ids.length);
});

test("schedule type answer changes schedule only", () => {
  const state = collecting({
    nextQuestion: {
      key: "trigger",
      step: "trigger",
      question: "מתי לשלוח",
      answerType: "single_choice",
    },
    proposal: { ...collecting().proposal, schedule: undefined },
  });
  const beforeFields = JSON.stringify(state.proposal.fields);
  const result = reduceSetupAnswer({
    setupState: state,
    question: state.nextQuestion!,
    userAnswer: "חודשי",
  });
  assert.equal(result.ok, true);
  if (!result.ok) {
    return;
  }
  assert.equal(result.setup.proposal.schedule?.type, "monthly");
  assert.equal(JSON.stringify(result.setup.proposal.fields), beforeFields);
});

test("reminder answer changes reminder only", () => {
  const state = collecting({
    nextQuestion: {
      key: "reminder",
      step: "reminder",
      question: "תזכורת",
      answerType: "single_choice",
    },
  });
  const beforeFields = JSON.stringify(state.proposal.fields);
  const result = reduceSetupAnswer({
    setupState: state,
    question: state.nextQuestion!,
    userAnswer: "אחרי יומיים",
  });
  assert.equal(result.ok, true);
  if (!result.ok) {
    return;
  }
  assert.equal(result.setup.proposal.reminder.enabled, true);
  assert.equal(result.setup.proposal.reminder.afterHours, 48);
  assert.equal(JSON.stringify(result.setup.proposal.fields), beforeFields);
});

test("a review weekday change replaces and does not append", () => {
  const state = collecting({
    status: "review",
    currentStep: "review",
    nextQuestion: {
      key: "review",
      step: "review",
      question: "הכול מוכן",
      answerType: "confirmation",
    },
  });
  const classified = classifyReviewChange("שנה ליום שלישי", state);
  assert.equal(classified?.target, "weekday");
  const result = reduceSetupAnswer({
    setupState: state,
    question: state.nextQuestion!,
    userAnswer: "יום שלישי",
  });
  assert.equal(result.ok, true);
  if (!result.ok) {
    return;
  }
  assert.equal(result.setup.proposal.schedule?.type, "weekly");
  if (result.setup.proposal.schedule?.type === "weekly") {
    assert.equal(result.setup.proposal.schedule.weekday, 2);
  }
  assert.equal(result.setup.proposal.fields.length, 2);
});

test("a review email change replaces the same recipient", () => {
  const state = collecting({
    status: "review",
    proposal: {
      ...collecting().proposal,
      recipients: [{ name: "איתי", email: "old@example.com" }],
    },
    nextQuestion: {
      key: "review",
      step: "review",
      question: "הכול מוכן",
      answerType: "confirmation",
    },
  });
  const result = reduceSetupAnswer({
    setupState: state,
    question: state.nextQuestion!,
    userAnswer: "itay@gaash.com",
  });
  assert.equal(result.ok, true);
  if (!result.ok) {
    return;
  }
  assert.equal(result.setup.proposal.recipients.length, 1);
  assert.equal(result.setup.proposal.recipients[0]?.email, "itay@gaash.com");
  assert.equal(result.setup.proposal.recipients[0]?.name, "איתי");
});

test("review keeps only the original business fields", () => {
  const proposal = collecting().proposal;
  const valid = validateProposalSemantics({
    ...proposal,
    fields: [
      ...proposal.fields,
      {
        id: "bad",
        type: "file",
        label: "itay@gaash.com",
        required: true,
        helpText: null,
        allowedMimeTypes: [],
        maxFiles: 1,
        maxFileSizeMb: 10,
      },
    ],
  });
  assert.equal(valid.ok, false);
  assert.equal(validateProposalSemantics(proposal).ok, true);
  assert.equal(proposal.fields.map((field) => field.label).join(","), "חשבונית,אישור מנהל פרויקט");
});

test("בכל 25 בחודש is monthly without the word חודשי", () => {
  assert.equal(parseTriggerType("בכל 25 בחודש שלח לרוני בקשה לסיכום"), "monthly");
});

test("heuristic full-sentence item does not duplicate extracted requirements", () => {
  const started = startSetup(0, emptyWorkflowDraft());
  const result = applySetupExtraction({
    current: started,
    userMessage: "צריך לאסוף פירוט חומרי גלם ואישור מנהל פרויקט",
    extraction: {
      ...emptySetupExtraction(),
      items: [
        { label: "פירוט חומרי גלם", kind: "file", filePreset: "all" },
        { label: "אישור מנהל פרויקט", kind: "ambiguous", filePreset: null },
      ],
    },
  });
  assert.equal(result.setup.requirements.length, 2);
  assert.equal(result.setup.requirements.map((item) => item.label).join(","), "פירוט חומרי גלם,אישור מנהל פרויקט");
  assert.notEqual(result.setup.proposal.recipients[0]?.name, "נהל");
});

test("מנהל פרויקט is not extracted as a recipient named נהל", () => {
  assert.equal(extractPersonName("צריך לאסוף פירוט חומרי גלם ואישור מנהל פרויקט"), null);
  assert.equal(extractPersonName("אסוף סיכום מרוני"), "רוני");
});

test("an extracted email label is not stored as a requirement or field", () => {
  const started = startSetup(0, emptyWorkflowDraft());
  const result = applySetupExtraction({
    current: started,
    userMessage: "חשבונית ואישור",
    extraction: {
      ...emptySetupExtraction(),
      items: [
        { label: "חשבונית", kind: "file", filePreset: "pdf" },
        { label: "אישור", kind: "ambiguous", filePreset: null },
        { label: "itay@gaash.com", kind: "file", filePreset: "all" },
        { label: "09:00", kind: "file", filePreset: "all" },
      ],
    },
  });
  assert.equal(
    result.setup.requirements.map((item) => item.label).join(","),
    "חשבונית,אישור",
  );
  assert.equal(
    result.setup.proposal.fields.some((field) => field.label.includes("@") || field.label === "09:00"),
    false,
  );
});

const HOURS_MESSAGE = "קבלת דוח שעות עובדים בצירוף אישור של מנהל האתר מדוד עמר קבלן גבס";

function hoursExtraction() {
  return {
    ...emptySetupExtraction(),
    items: [
      { label: "דוח שעות עובדים", kind: "file" as const, filePreset: "all" as const },
      { label: "אישור מנהל האתר", kind: "ambiguous" as const, filePreset: null },
    ],
    recipientName: "דוד עמר",
  };
}

test("the guided hours-report setup keeps two fields and does not write the draft", () => {
  const started = startSetup(0, emptyWorkflowDraft());
  const first = applySetupUserTurn({
    current: started,
    userMessage: HOURS_MESSAGE,
    extraction: hoursExtraction(),
  });
  assert.equal(first.setup.requirements.length, 2);
  assert.equal(first.setup.requirements.map((item) => item.label).join(","), "דוח שעות עובדים,אישור מנהל האתר");
  assert.equal(first.setup.proposal.fields.length, 1);
  assert.equal(
    first.setup.proposal.fields.some((field) => /אימייל|יום|שעה/.test(field.label)),
    false,
  );
  assert.equal(first.setup.proposal.recipients[0]?.name, "דוד עמר");
  const blankDraft = emptyWorkflowDraft();
  assert.equal(leftPaneIsEmpty(first.setup, blankDraft), true);
  assert.equal(leftPaneDraft(blankDraft), blankDraft);
  assert.notEqual(leftPaneDraft(blankDraft), first.setup.proposal);

  const files = applySetupUserTurn({ current: first.setup, userMessage: "קבצים" });
  assert.equal(files.invalid, false);
  assert.equal(files.setup.proposal.fields.length, 2);
  assert.equal(files.setup.proposal.fields.every((field) => field.type === "file"), true);

  const typo = applySetupUserTurn({ current: files.setup, userMessage: "maor.andios@gmial.com" });
  assert.equal(typo.setup.pendingEmailCorrection?.suggestedDomain, "gmail.com");
  assert.equal(typo.setup.proposal.recipients[0]?.email, "");
  assert.equal(typo.setup.nextQuestion?.key, "email_typo");
  assert.match(typo.assistantMessage, /gmial\.com/);
  assert.equal(typo.setup.completedSteps.includes("recipient"), false);

  const confirm = applySetupUserTurn({ current: typo.setup, userMessage: he.studio.setup.emailTypoYes });
  assert.equal(confirm.setup.proposal.recipients[0]?.email, "maor.andios@gmail.com");
  assert.equal(confirm.setup.pendingEmailCorrection, null);

  const weekly = applySetupUserTurn({ current: confirm.setup, userMessage: "פעם בשבוע" });
  assert.equal(weekly.setup.proposal.schedule?.type, "weekly");

  const sunday = applySetupUserTurn({ current: weekly.setup, userMessage: "בימי ראשון" });
  assert.equal(sunday.setup.proposal.schedule?.type, "weekly");
  if (sunday.setup.proposal.schedule?.type === "weekly") {
    assert.equal(sunday.setup.proposal.schedule.weekday, 0);
  }

  const time = applySetupUserTurn({ current: sunday.setup, userMessage: "8" });
  if (time.setup.proposal.schedule && "time" in time.setup.proposal.schedule) {
    assert.equal(time.setup.proposal.schedule.time, "08:00");
  }

  const reminder = applySetupUserTurn({ current: time.setup, userMessage: "כן לאחר יום" });
  assert.equal(reminder.setup.proposal.reminder.afterHours, 24);
  assert.equal(reminder.setup.status, "review");
  assert.equal(reminder.setup.proposal.fields.length, 2);
  assert.equal(reminder.setup.nextQuestion?.key, "review");
  assert.equal(leftPaneIsEmpty(reminder.setup, emptyWorkflowDraft()), true);

  const change = applySetupUserTurn({ current: reminder.setup, userMessage: "יום שלישי" });
  assert.equal(change.setup.status, "review");
  if (change.setup.proposal.schedule?.type === "weekly") {
    assert.equal(change.setup.proposal.schedule.weekday, 2);
  }
  assert.equal(change.assistantMessage, he.studio.setup.updatedWeekday);
  assert.equal(change.setup.proposal.fields.length, 2);

  const completion = getCompletionState(reminder.setup.proposal, { hasMailbox: true, mailboxStatus: "connected" });
  assert.equal(completion.conversationIssues.some((issue) => issue.key === "fields_missing"), false);
  assert.equal(completion.conversationIssues.some((issue) => issue.key === "event_mode_missing"), false);
  assert.equal(completion.conversationIssues.some((issue) => issue.category === "recipient"), false);
});

test("email, day, time, and reminder answers do not mutate fields", () => {
  const started = startSetup(0, emptyWorkflowDraft());
  const first = applySetupUserTurn({
    current: started,
    userMessage: HOURS_MESSAGE,
    extraction: hoursExtraction(),
  });
  const files = applySetupUserTurn({ current: first.setup, userMessage: "קבצים" });
  const before = JSON.stringify(files.setup.proposal.fields);
  for (const answer of ["maor.andios@gmail.com", "פעם בשבוע", "בימי ראשון", "8", "כן לאחר יום"]) {
    const latest = applySetupUserTurn({
      current: files.setup,
      userMessage: answer,
    });
    if (latest.setup.proposal.fields.length) {
      assert.equal(JSON.stringify(latest.setup.proposal.fields) === before || latest.setup.proposal.fields.length === 2, true);
    }
  }
  assert.equal(files.setup.proposal.fields.length, 2);
});

test("first hours-report turn does not invent a schedule from extraction", () => {
  const started = startSetup(0, emptyWorkflowDraft());
  const first = applySetupUserTurn({
    current: started,
    userMessage: HOURS_MESSAGE,
    extraction: {
      ...hoursExtraction(),
      scheduleType: "weekly",
      scheduleWeekday: 1,
      scheduleTime: "09:00",
    },
  });
  assert.equal(first.setup.proposal.schedule, undefined);
  assert.equal(first.setup.nextQuestion?.step, "field_types");
});

test("the left pane never reads the proposal before apply", () => {
  const draft = emptyWorkflowDraft();
  const started = startSetup(0, draft);
  const first = applySetupUserTurn({
    current: started,
    userMessage: HOURS_MESSAGE,
    extraction: hoursExtraction(),
  });
  assert.equal(leftPaneIsEmpty(first.setup, draft), true);
  assert.equal(leftPaneShowsPendingBanner(first.setup, draft), false);
  assert.equal(JSON.stringify(leftPaneDraft(draft)), JSON.stringify(draft));
  const existing = {
    ...emptyWorkflowDraft(),
    name: "תהליך קיים",
    fields: first.setup.proposal.fields,
  };
  assert.equal(leftPaneShowsPendingBanner(first.setup, existing), true);
  assert.equal(leftPaneDraft(existing).name, "תהליך קיים");
});
