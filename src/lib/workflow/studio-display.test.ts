import assert from "node:assert/strict";
import { test } from "node:test";

import { emptyWorkflowDraft } from "./draft-schema";
import {
  definedText,
  eventModeLabel,
  fieldCountLabel,
  mailboxSummary,
  monthlyEditorDayValue,
  nextRunSummary,
  recipientSummary,
  reminderSummary,
  scheduleSummary,
  shouldShowNextSendCard,
} from "./studio-display";

test("missing values use the Hebrew placeholder", () => {
  const draft = emptyWorkflowDraft();
  assert.equal(definedText(""), "טרם הוגדר");
  assert.equal(definedText(null), "טרם הוגדר");
  assert.equal(eventModeLabel(undefined), "טרם הוגדר");
  assert.equal(scheduleSummary(undefined), "טרם הוגדר");
  assert.equal(recipientSummary(draft), "טרם הוגדר");
  assert.equal(fieldCountLabel(0), "טרם הוגדר");
  assert.equal(reminderSummary(draft), "ללא תזכורת");
  assert.equal(mailboxSummary(null), "Gmail לא מחובר");
  assert.equal(nextRunSummary({ type: "monthly", day: 25, time: null, timezone: "Asia/Jerusalem" }), "תחושב לאחר בחירת שעה");
  assert.equal(
    nextRunSummary({ type: "weekly", weekday: 0, time: "08:00", timezone: "Asia/Jerusalem" }),
    "תחושב לאחר הפעלת התהליך",
  );
});

test("event mode and recipients use Hebrew studio copy", () => {
  assert.equal(eventModeLabel({ type: "send_now" }), "מיידי חד־פעמי");
  assert.equal(eventModeLabel({ type: "manual" }), "ידני");
  assert.equal(
    eventModeLabel({ type: "once", date: "2026-08-25", time: "09:00", timezone: "Asia/Jerusalem" }),
    "חד־פעמי מתוזמן",
  );
  assert.equal(
    scheduleSummary({ type: "monthly", day: 31, time: "13:00", timezone: "Asia/Jerusalem", monthlyDayMode: "end_of_month" }),
    "בסוף כל חודש · 13:00",
  );
  assert.equal(
    scheduleSummary({ type: "monthly", day: 25, time: null, timezone: "Asia/Jerusalem" }),
    "בכל 25 בחודש · שעה טרם הוגדרה",
  );
  assert.equal(eventModeLabel({ type: "monthly", day: 25, time: null, timezone: "Asia/Jerusalem" }), "חודשי");
  assert.equal(fieldCountLabel(3), "3 שדות");
  assert.equal(
    reminderSummary({
      ...emptyWorkflowDraft(),
      reminder: { enabled: true, afterHours: 168 },
      reminderDecision: "enabled",
    }),
    "תזכורת אחרי שבוע",
  );
  assert.equal(
    monthlyEditorDayValue({
      type: "monthly",
      day: 31,
      monthlyDayMode: "end_of_month",
      time: "14:00",
      timezone: "Asia/Jerusalem",
    }),
    "end_of_month",
  );
  assert.equal(
    shouldShowNextSendCard("draft", { type: "monthly", day: 31, time: "14:00", timezone: "Asia/Jerusalem" }),
    false,
  );
  assert.equal(
    shouldShowNextSendCard("active", { type: "monthly", day: 31, time: "14:00", timezone: "Asia/Jerusalem" }),
    true,
  );
  assert.equal(
    shouldShowNextSendCard("paused", { type: "monthly", day: 31, time: "14:00", timezone: "Asia/Jerusalem" }),
    true,
  );
  assert.equal(shouldShowNextSendCard("active", { type: "manual" }), false);
  assert.equal(
    shouldShowNextSendCard("completed", { type: "monthly", day: 31, time: "14:00", timezone: "Asia/Jerusalem" }),
    false,
  );
  assert.equal(
    recipientSummary({
      ...emptyWorkflowDraft(),
      recipientMode: "at_launch",
    }),
    "הנמען יוזן בעת יצירת האירוע",
  );
});
