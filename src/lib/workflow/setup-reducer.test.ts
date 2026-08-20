import assert from "node:assert/strict";
import { test } from "node:test";

import { emptyWorkflowDraft } from "./draft-schema";
import { TIMEZONE } from "./schema";
import { applySetupExtraction, applySetupUserTurn, startSetup } from "./setup-agent";
import { emptySetupExtraction } from "./setup-extraction";
import { extractPersonName, parseTriggerType } from "./setup-parse";
import { classifyReviewChange, reduceSetupAnswer } from "./setup-reducer";
import { leftPaneDraft, leftPaneIsEmpty, leftPaneShowsPendingBanner } from "./setup-ui";
import { buildSetupReviewModel } from "./setup-review";
import { parseWorkflowSetupState } from "./setup-state";
import { validateProposalSemantics } from "./setup-validate";
import type { WorkflowSetupState } from "./setup-state";
import { getCompletionState } from "./completion";
import { he } from "@/lib/i18n/he";
import { setupAssistantMustNotAddressUserAs } from "./setup-copy";

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

test("a field type is not asked during setup", () => {
  const started = startSetup(0, emptyWorkflowDraft());
  const first = applySetupUserTurn({
    current: started,
    userMessage: "חשבונית ואישור פיקוח",
  });
  const fieldCount = first.setup.proposal.fields.length;
  assert.equal(fieldCount, 2);
  assert.equal(first.setup.proposal.fields.every((field) => field.type === "unconfigured"), true);
  assert.equal(first.setup.nextQuestion?.key, "contact_name");
  assert.equal(first.assistantMessage.includes("איך תרצה לקבל"), false);
  const ids = first.setup.proposal.fields.map((field) => field.id);
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
  assert.equal(extractPersonName("שלח לרוני בקשה לסיכום העבודה"), "רוני");
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
  assert.equal(first.setup.proposal.fields.length, 2);
  assert.equal(first.setup.proposal.fields.every((field) => field.type === "unconfigured"), true);
  assert.equal(
    first.setup.proposal.fields.some((field) => /אימייל|יום|שעה/.test(field.label)),
    false,
  );
  assert.equal(first.setup.proposal.recipients[0]?.name, "דוד עמר");
  const blankDraft = emptyWorkflowDraft();
  assert.equal(leftPaneIsEmpty(first.setup, blankDraft), true);
  assert.equal(leftPaneDraft(blankDraft), blankDraft);
  assert.notEqual(leftPaneDraft(blankDraft), first.setup.proposal);

  const typo = applySetupUserTurn({ current: first.setup, userMessage: "maor.andios@gmial.com" });
  assert.equal(typo.setup.pendingEmailCorrection?.suggestedDomain, "gmail.com");
  assert.equal(typo.setup.proposal.recipients[0]?.email, "");
  assert.equal(typo.setup.nextQuestion?.key, "email_typo");
  assert.match(typo.assistantMessage, /נראה שיש טעות ב־Gmail/);
  assert.match(typo.assistantMessage, /maor\.andios@gmail\.com/);
  assert.equal(typo.assistantMessage.includes("gmial"), false);
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
  const before = JSON.stringify(first.setup.proposal.fields);
  for (const answer of ["maor.andios@gmail.com", "פעם בשבוע", "בימי ראשון", "8", "כן לאחר יום"]) {
    const latest = applySetupUserTurn({
      current: first.setup,
      userMessage: answer,
    });
    if (latest.setup.proposal.fields.length) {
      assert.equal(JSON.stringify(latest.setup.proposal.fields) === before || latest.setup.proposal.fields.length === 2, true);
    }
  }
  assert.equal(first.setup.proposal.fields.length, 2);
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
  assert.equal(first.setup.nextQuestion?.key, "recipient_email");
  assert.equal(first.assistantMessage.includes("איך תרצה לקבל"), false);
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

const GAASH_MESSAGE = "קבלת חשבוניות + קבלות + אישור ניכוי מס במקור של חברת געש מתכות בעמ באופן חודשי";

test("gaash metals setup asks for a contact, keeps monthly, and lists every document in the email", () => {
  const started = startSetup(0, emptyWorkflowDraft());
  const first = applySetupUserTurn({
    current: started,
    userMessage: GAASH_MESSAGE,
    extraction: {
      ...emptySetupExtraction(),
      items: [
        { label: "חשבוניות", kind: "file", filePreset: "all" },
        { label: "קבלות", kind: "file", filePreset: "all" },
        { label: "אישור ניכוי מס במקור", kind: "ambiguous", filePreset: null },
      ],
      companyName: "תכות בעמ",
      recipientName: "תכות בעמ",
      scheduleType: "monthly",
      emailSubject: "בקשה לחשבוניות",
      emailBody: "נא לצרף את החשבוניות ואת הקבלות.",
    },
  });
  assert.equal(first.setup.proposal.fields.length, 3);
  assert.equal(first.setup.proposal.fields.every((field) => field.type === "unconfigured"), true);
  assert.equal(first.setup.proposal.recipients[0]?.organizationName, "געש מתכות בע״מ");
  assert.equal(first.setup.proposal.recipients[0]?.name, "");
  assert.equal(first.setup.proposal.schedule?.type, "monthly");
  assert.equal(first.setup.nextQuestion?.key, "contact_name");
  assert.match(first.assistantMessage, /געש מתכות בע״מ/);
  assert.equal(leftPaneIsEmpty(first.setup, emptyWorkflowDraft()), true);

  assert.equal(first.setup.nextQuestion?.options?.some((option) => option.label === he.studio.setup.noFixedContact), true);

  const contact = applySetupUserTurn({ current: first.setup, userMessage: "ישראל ישראלי" });
  assert.equal(contact.setup.proposal.recipients[0]?.name, "ישראל ישראלי");
  assert.equal(contact.setup.proposal.recipients[0]?.organizationName, "געש מתכות בע״מ");
  assert.equal(contact.setup.nextQuestion?.key, "recipient_email");
  assert.equal(contact.setup.nextQuestion?.question, he.studio.setup.askRecipientEmail);
  assert.equal(contact.setup.proposal.fields.length, 3);

  const email = applySetupUserTurn({ current: contact.setup, userMessage: "gaash@gmail.com" });
  assert.equal(email.setup.proposal.recipients[0]?.email, "gaash@gmail.com");
  assert.equal(email.setup.proposal.recipients[0]?.name, "ישראל ישראלי");
  assert.equal(email.setup.nextQuestion?.key, "monthly_day");

  const day = applySetupUserTurn({ current: email.setup, userMessage: "28" });
  const time = applySetupUserTurn({ current: day.setup, userMessage: "8" });
  const reminder = applySetupUserTurn({ current: time.setup, userMessage: "אחרי יומיים" });
  assert.equal(reminder.setup.status, "review");
  assert.equal(reminder.setup.nextQuestion?.key, "review");
  assert.equal(reminder.setup.proposal.email.subject, "בקשה למסמכים חודשיים");
  assert.match(reminder.setup.proposal.email.body, /• חשבוניות/);
  assert.match(reminder.setup.proposal.email.body, /• קבלות/);
  assert.match(reminder.setup.proposal.email.body, /• אישור ניכוי מס במקור/);
  assert.equal(reminder.setup.proposal.email.body.includes("\\"), false);
  assert.equal(leftPaneIsEmpty(reminder.setup, emptyWorkflowDraft()), true);
  assert.equal(leftPaneDraft(emptyWorkflowDraft()).fields.length, 0);
});

const NISSIM_MESSAGE = 'קבלת חשבוניות + קבלות + תדפיסי בנק כל חודש מחברת ניסים נכסים בע"מ';

test("nissim nekassim first turn is monthly and skips the cadence question", () => {
  const started = startSetup(0, emptyWorkflowDraft());
  const first = applySetupUserTurn({ current: started, userMessage: NISSIM_MESSAGE });
  assert.equal(first.setup.proposal.recipients[0]?.organizationName, "ניסים נכסים בע״מ");
  assert.equal(first.setup.proposal.fields.length, 3);
  assert.deepEqual(
    first.setup.proposal.fields.map((field) => field.label),
    ["חשבוניות", "קבלות", "תדפיסי בנק"],
  );
  assert.equal(first.setup.proposal.fields.every((field) => field.type === "unconfigured"), true);
  assert.deepEqual(first.setup.proposal.schedule, {
    type: "monthly",
    day: null,
    time: null,
    timezone: TIMEZONE,
  });
  assert.notEqual(first.setup.nextQuestion?.key, "trigger");
  assert.equal(first.setup.nextQuestion?.key, "contact_name");
  assert.match(first.assistantMessage, /מעולה — בכל חודש נאסוף מניסים נכסים בע״מ/);
  assert.match(first.assistantMessage, /חשבוניות/);
  assert.match(first.assistantMessage, /קבלות/);
  assert.match(first.assistantMessage, /תדפיסי בנק/);
  assert.match(first.assistantMessage, /מה שם איש הקשר בחברה/);
  assert.equal(first.assistantMessage.includes("באילו פורמטים"), false);
  assert.equal(first.assistantMessage.startsWith("הבנתי"), false);
  assert.equal(leftPaneIsEmpty(first.setup, emptyWorkflowDraft()), true);

  const contact = applySetupUserTurn({ current: first.setup, userMessage: "דוד כהן" });
  assert.equal(contact.setup.proposal.recipients[0]?.name, "דוד כהן");
  assert.equal(contact.setup.nextQuestion?.key, "recipient_email");
  assert.equal(setupAssistantMustNotAddressUserAs(contact.assistantMessage, "דוד כהן"), true);
  assert.match(contact.assistantMessage, /מעולה\. לאיזו כתובת מייל נשלח את הבקשה/);

  const email = applySetupUserTurn({ current: contact.setup, userMessage: "gmail22@gmail.com" });
  assert.equal(email.setup.proposal.recipients[0]?.email, "gmail22@gmail.com");
  assert.equal(email.setup.nextQuestion?.key, "monthly_day");
  assert.match(email.assistantMessage, /באיזה תאריך בחודש לשלוח/);
  assert.match(email.assistantMessage, /1 ל־31/);
  assert.equal(email.setup.nextQuestion?.options?.some((option) => option.label === "סוף החודש"), true);

  const day = applySetupUserTurn({ current: email.setup, userMessage: "21" });
  assert.equal(day.setup.proposal.schedule && "day" in day.setup.proposal.schedule ? day.setup.proposal.schedule.day : null, 21);
  assert.equal(day.setup.nextQuestion?.key, "monthly_time");
  assert.equal(day.assistantMessage, he.studio.setup.askTimeFollowUp);

  const time = applySetupUserTurn({ current: day.setup, userMessage: "9" });
  assert.equal(time.setup.proposal.schedule && "time" in time.setup.proposal.schedule ? time.setup.proposal.schedule.time : null, "09:00");
  assert.equal(time.setup.nextQuestion?.key, "reminder");
  assert.match(time.assistantMessage, /קבעתי את השליחה ל־21 בכל חודש בשעה 09:00/);
  assert.match(time.assistantMessage, /מתי לשלוח תזכורת/);

  const reminder = applySetupUserTurn({ current: time.setup, userMessage: "אחרי יום" });
  assert.equal(reminder.setup.status, "review");
  assert.equal(reminder.setup.nextQuestion?.key, "review");
  assert.equal(reminder.assistantMessage, he.studio.setup.reviewPrompt);
  assert.match(reminder.setup.proposal.email.body, /\n/);
  assert.match(reminder.setup.proposal.email.body, /• חשבוניות/);
  assert.match(reminder.setup.proposal.email.body, /• קבלות/);
  assert.match(reminder.setup.proposal.email.body, /• תדפיסי בנק/);
  assert.equal(reminder.setup.proposal.email.body.includes("\\"), false);
  assert.equal(reminder.setup.proposal.recipients[0]?.email, "gmail22@gmail.com");
  assert.equal(leftPaneIsEmpty(reminder.setup, emptyWorkflowDraft()), true);
});

test("cadence phrases in a first message skip the trigger question", () => {
  const phrases = [
    ["תשלח כל חודש", "monthly"],
    ["בקשה חודשית", "monthly"],
    ["פעם בחודש", "monthly"],
    ["מדי חודש", "monthly"],
    ["בכל חודש", "monthly"],
    ["תהליך שבועי", "weekly"],
    ["כל שבוע", "weekly"],
    ["פעם בשבוע", "weekly"],
  ] as const;
  for (const [phrase, type] of phrases) {
    const result = applySetupUserTurn({
      current: startSetup(0, emptyWorkflowDraft()),
      userMessage: `קבלת חשבוניות ${phrase}`,
    });
    assert.equal(result.setup.proposal.schedule?.type, type, phrase);
    assert.notEqual(result.setup.nextQuestion?.key, "trigger", phrase);
  }
});

test("שלישי on a monthly date question asks for clarification instead of erroring", () => {
  const started = startSetup(0, emptyWorkflowDraft());
  const first = applySetupUserTurn({ current: started, userMessage: NISSIM_MESSAGE });
  const contact = applySetupUserTurn({ current: first.setup, userMessage: "דוד כהן" });
  const email = applySetupUserTurn({ current: contact.setup, userMessage: "gmail22@gmail.com" });
  const ambiguous = applySetupUserTurn({ current: email.setup, userMessage: "שלישי" });
  assert.equal(ambiguous.invalid, false);
  assert.equal(ambiguous.setup.nextQuestion?.key, "weekday_or_month_day");
  assert.match(ambiguous.assistantMessage, /רק כדי לדייק/);
  assert.match(ambiguous.assistantMessage, /יום שלישי בכל שבוע/);
  assert.match(ambiguous.assistantMessage, /3 בחודש/);
  assert.equal(ambiguous.setup.proposal.schedule?.type, "monthly");
  assert.equal(
    ambiguous.setup.proposal.schedule && "day" in ambiguous.setup.proposal.schedule
      ? ambiguous.setup.proposal.schedule.day
      : undefined,
    null,
  );

  const weekly = applySetupUserTurn({ current: ambiguous.setup, userMessage: "יום שלישי בכל שבוע" });
  assert.equal(weekly.setup.proposal.schedule?.type, "weekly");
  assert.equal(
    weekly.setup.proposal.schedule && "weekday" in weekly.setup.proposal.schedule
      ? weekly.setup.proposal.schedule.weekday
      : null,
    2,
  );
});

const INDUSTRIES_MESSAGE = "קבלת דוח עובדים, חשבוניות קבלות ותדפיס בנק באופן חודשי מגעש תעשיות מתכת";

function publicRequirement(item: { label: string; kind: string }) {
  return { label: item.label, type: item.kind === "ambiguous" ? null : item.kind };
}

test("gaash industries first turn keeps every requirement, peels mem, and asks for a contact", () => {
  const started = startSetup(0, emptyWorkflowDraft());
  const first = applySetupUserTurn({ current: started, userMessage: INDUSTRIES_MESSAGE });
  assert.deepEqual(first.setup.requirements.map(publicRequirement), [
    { label: "דוח עובדים", type: null },
    { label: "חשבוניות", type: "file" },
    { label: "קבלות", type: "file" },
    { label: "תדפיס בנק", type: "file" },
  ]);
  assert.deepEqual(first.setup.recipientIdentity, {
    organizationName: "געש תעשיות מתכת",
    contactName: null,
    contactResolution: "pending",
    email: null,
  });
  assert.deepEqual(first.setup.proposal.schedule, {
    type: "monthly",
    day: null,
    time: null,
    timezone: TIMEZONE,
  });
  assert.equal(first.setup.proposal.recipients[0]?.name, "");
  assert.equal(first.setup.recipientIdentity.contactName, null);
  assert.notEqual(first.setup.recipientIdentity.contactName, "געש תעשיות");
  assert.equal(first.setup.nextQuestion?.key, "contact_name");
  assert.equal(first.setup.proposal.fields.length, 4);
  assert.equal(first.setup.proposal.fields.every((field) => field.type === "unconfigured"), true);
  assert.match(first.assistantMessage, /מעולה — בכל חודש נאסוף מגעש תעשיות מתכת דוח עובדים, חשבוניות, קבלות ותדפיס בנק/);
  assert.match(first.assistantMessage, /מה שם איש הקשר בחברה/);
  assert.equal(first.assistantMessage.includes("איך תרצה לקבל"), false);
  assert.equal(leftPaneIsEmpty(first.setup, emptyWorkflowDraft()), true);

  const refreshed = parseWorkflowSetupState(JSON.parse(JSON.stringify(first.setup)));
  assert.equal(refreshed.success, true);
  if (refreshed.success) {
    assert.equal(refreshed.data.recipientIdentity.contactResolution, "pending");
    assert.equal(refreshed.data.nextQuestion?.key, "contact_name");
  }

  const contact = applySetupUserTurn({ current: first.setup, userMessage: "רמי אביהו" });
  assert.equal(contact.setup.recipientIdentity.contactName, "רמי אביהו");
  assert.equal(contact.setup.recipientIdentity.contactResolution, "named");
  assert.equal(contact.setup.nextQuestion?.key, "recipient_email");
  assert.equal(setupAssistantMustNotAddressUserAs(contact.assistantMessage, "רמי אביהו"), true);
  assert.equal(contact.assistantMessage.includes("רמי אביהו"), false);
  assert.equal(contact.assistantMessage.includes("תודה, רמי"), false);
  assert.equal(contact.assistantMessage, "מעולה. לאיזו כתובת מייל נשלח את הבקשה?");

  const comma = applySetupUserTurn({ current: contact.setup, userMessage: "rami@gmail,com" });
  assert.equal(comma.setup.proposal.recipients[0]?.email, "");
  assert.equal(comma.setup.recipientIdentity.email, null);
  assert.equal(comma.setup.nextQuestion?.key, "email_typo");
  assert.equal(comma.assistantMessage, "נראה שיש פסיק במקום נקודה בכתובת. התכוונת ל־rami@gmail.com?");
  assert.equal(comma.assistantMessage.includes("\\@"), false);
  assert.equal(comma.assistantMessage.includes("לא הייתי בטוח למה התכוונת"), false);
  assert.deepEqual(
    comma.setup.nextQuestion?.options?.map((option) => option.label),
    [he.studio.setup.emailTypoYes, he.studio.setup.emailTypoRewrite],
  );

  const rewrite = applySetupUserTurn({ current: comma.setup, userMessage: he.studio.setup.emailTypoRewrite });
  assert.equal(rewrite.setup.proposal.recipients[0]?.email, "");
  assert.equal(rewrite.setup.pendingEmailCorrection, null);
  assert.equal(rewrite.setup.nextQuestion?.key, "recipient_email");

  const commaAgain = applySetupUserTurn({ current: rewrite.setup, userMessage: "rami@gmail,com" });
  const email = applySetupUserTurn({ current: commaAgain.setup, userMessage: he.studio.setup.emailTypoYes });
  assert.equal(email.setup.proposal.recipients[0]?.email, "rami@gmail.com");
  assert.equal(email.setup.proposal.recipients[0]?.email?.includes("\\"), false);
  const day = applySetupUserTurn({ current: email.setup, userMessage: "סוף החודש" });
  assert.equal(day.setup.proposal.schedule && "day" in day.setup.proposal.schedule ? day.setup.proposal.schedule.day : null, 31);
  assert.equal(
    day.setup.proposal.schedule && day.setup.proposal.schedule.type === "monthly"
      ? day.setup.proposal.schedule.monthlyDayMode
      : null,
    "end_of_month",
  );
  const time = applySetupUserTurn({ current: day.setup, userMessage: "14" });
  const reminder = applySetupUserTurn({ current: time.setup, userMessage: "אחרי שבוע" });
  assert.equal(reminder.setup.status, "review");
  const review = buildSetupReviewModel(reminder.setup);
  assert.deepEqual(review.fields, ["דוח עובדים", "חשבוניות", "קבלות", "תדפיס בנק"]);
  assert.equal(review.organizationName, "געש תעשיות מתכת");
  assert.equal(review.contactName, "רמי אביהו");
  assert.equal(review.email, "rami@gmail.com");
  assert.equal(review.schedule, "חודשי · בסוף כל חודש · 14:00");
  assert.equal(review.reminder, he.studio.reminderAfterWeek);
  assert.equal(review.includesEmailContent, false);
  assert.equal(JSON.stringify(review).includes("שלום רמי"), false);
  assert.equal(leftPaneIsEmpty(reminder.setup, emptyWorkflowDraft()), true);
  assert.equal(reminder.setup.proposal.fields.every((field) => field.type === "unconfigured"), true);
});

test("no fixed contact keeps identity empty and greets without a person", () => {
  const started = startSetup(0, emptyWorkflowDraft());
  const first = applySetupUserTurn({ current: started, userMessage: INDUSTRIES_MESSAGE });
  const none = applySetupUserTurn({ current: first.setup, userMessage: he.studio.setup.noFixedContact });
  assert.equal(none.setup.recipientIdentity.contactName, null);
  assert.equal(none.setup.recipientIdentity.contactResolution, "no_fixed_contact");
  assert.equal(none.setup.proposal.recipients[0]?.name, "");
  const email = applySetupUserTurn({ current: none.setup, userMessage: "gaas@gmail.com" });
  const day = applySetupUserTurn({ current: email.setup, userMessage: "22" });
  const time = applySetupUserTurn({ current: day.setup, userMessage: "11" });
  const reminder = applySetupUserTurn({ current: time.setup, userMessage: "אחרי יום" });
  const review = buildSetupReviewModel(reminder.setup);
  assert.equal(review.contactName, he.studio.setup.noFixedContact);
  assert.match(reminder.setup.proposal.email.body, /^שלום,/);
  assert.equal(reminder.setup.proposal.email.body.includes("שלום געש"), false);
});

test("an explicit contact in the first message skips the contact question", () => {
  const result = applySetupUserTurn({
    current: startSetup(0, emptyWorkflowDraft()),
    userMessage: "קבלת חשבוניות באופן חודשי מגעש תעשיות, איש הקשר דוד כהן",
  });
  assert.equal(result.setup.recipientIdentity.organizationName, "געש תעשיות");
  assert.equal(result.setup.recipientIdentity.contactName, "דוד כהן");
  assert.equal(result.setup.recipientIdentity.contactResolution, "named");
  assert.equal(result.setup.nextQuestion?.key, "recipient_email");
});

test("company names that start with mem are not peeled after מחברת", () => {
  const matrix = applySetupUserTurn({
    current: startSetup(0, emptyWorkflowDraft()),
    userMessage: "קבלת חשבוניות באופן חודשי מחברת מטריקס",
  });
  assert.equal(matrix.setup.recipientIdentity.organizationName, "מטריקס");
  assert.equal(matrix.setup.recipientIdentity.contactResolution, "pending");
  const migdal = applySetupUserTurn({
    current: startSetup(0, emptyWorkflowDraft()),
    userMessage: "קבלת חשבוניות באופן חודשי ממגדל חברה לביטוח",
  });
  assert.equal(migdal.setup.recipientIdentity.organizationName, "מגדל חברה לביטוח");
  const menorah = applySetupUserTurn({
    current: startSetup(0, emptyWorkflowDraft()),
    userMessage: "קבלת חשבוניות באופן חודשי מחברת מנורה מבטחים",
  });
  assert.equal(menorah.setup.recipientIdentity.organizationName, "מנורה מבטחים");
});
