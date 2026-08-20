import assert from "node:assert/strict";
import { test } from "node:test";

import {
  extractMonthDay,
  extractTime,
  extractWeekday,
  parseEmailTypoChoice,
  parseFieldKind,
  parseMonthlyDayMode,
  parseReminderChoice,
  parseScheduleIntent,
  parseTriggerType,
  suggestEmailTypo,
  validateEmail,
} from "./setup-parse";

test("קבצים is file", () => {
  assert.equal(parseFieldKind("קבצים"), "file");
  assert.equal(parseFieldKind("קובץ"), "file");
  assert.equal(parseFieldKind("העלאת קובץ"), "file");
  assert.equal(parseFieldKind("שיעלה קובץ"), "file");
  assert.equal(parseFieldKind("מסמך"), "file");
  assert.equal(parseFieldKind("לצרף מסמך"), "file");
});

test("כן לאחר יום is a 24 hour reminder", () => {
  assert.deepEqual(parseReminderChoice("כן לאחר יום"), { decision: "enabled", afterHours: 24 });
  assert.deepEqual(parseReminderChoice("אחרי יום"), { decision: "enabled", afterHours: 24 });
  assert.deepEqual(parseReminderChoice("למחרת"), { decision: "enabled", afterHours: 24 });
  assert.deepEqual(parseReminderChoice("24 שעות"), { decision: "enabled", afterHours: 24 });
});

test("8 becomes 08:00", () => {
  assert.equal(extractTime("8", { allowBareHour: true }), "08:00");
  assert.equal(extractTime("8:00"), "08:00");
  assert.equal(extractTime("8 בבוקר"), "08:00");
  assert.equal(extractTime("שמונה בבוקר"), "08:00");
  assert.equal(extractTime("8 בערב"), "20:00");
  assert.equal(extractTime("09:15"), "09:15");
});

test("cadence phrases map to canonical schedule types", () => {
  assert.equal(parseTriggerType("כל חודש"), "monthly");
  assert.equal(parseTriggerType("מדי חודש"), "monthly");
  assert.equal(parseTriggerType("פעם בחודש"), "monthly");
  assert.equal(parseTriggerType("חודשי"), "monthly");
  assert.equal(parseTriggerType("בכל חודש"), "monthly");
  assert.equal(parseTriggerType("תשלח כל חודש"), "monthly");
  assert.equal(parseTriggerType("בקשה חודשית"), "monthly");
  assert.equal(parseTriggerType("כל שבוע"), "weekly");
  assert.equal(parseTriggerType("מדי שבוע"), "weekly");
  assert.equal(parseTriggerType("פעם בשבוע"), "weekly");
  assert.equal(parseTriggerType("שבועי"), "weekly");
  assert.equal(parseTriggerType("תהליך שבועי"), "weekly");
  assert.equal(parseTriggerType("באופן חד־פעמי"), "once");
  assert.equal(parseTriggerType("פעם אחת"), "once");
  assert.equal(parseTriggerType("לפי הצורך"), "manual");
  assert.equal(parseTriggerType("ידני"), "manual");
  assert.equal(parseScheduleIntent("כל יום"), "daily");
  assert.equal(parseTriggerType("כל יום"), null);
  assert.equal(parseTriggerType("כל יום ראשון"), "weekly");
});

test("סוף החודש is day 31 with end_of_month display mode", () => {
  const question = { key: "monthly_day", step: "schedule_details" as const, question: "תאריך", answerType: "text" as const };
  assert.equal(extractMonthDay("סוף החודש", question), 31);
  assert.equal(parseMonthlyDayMode("סוף החודש"), "end_of_month");
  assert.equal(parseMonthlyDayMode("31"), "specific_day");
  assert.equal(parseMonthlyDayMode("ב-31 בחודש"), "specific_day");
});

test("monthly date answers normalize without treating weekday names as days", () => {
  const question = { key: "monthly_day", step: "schedule_details" as const, question: "תאריך", answerType: "text" as const };
  assert.equal(extractMonthDay("21", question), 21);
  assert.equal(extractMonthDay("ב-21", question), 21);
  assert.equal(extractMonthDay("21 בחודש", question), 21);
  assert.equal(extractMonthDay("העשרים ואחד", question), 21);
  assert.equal(extractMonthDay("סוף החודש", question), 31);
  assert.equal(extractMonthDay("האחרון בחודש", question), 31);
  assert.equal(extractMonthDay("שלישי", question), null);
});

test("בימי ראשון is weekday 0", () => {
  assert.equal(extractWeekday("בימי ראשון"), 0);
  assert.equal(extractWeekday("ראשון"), 0);
  assert.equal(extractWeekday("יום ראשון"), 0);
  assert.equal(extractWeekday("כל יום ראשון"), 0);
});

test("gmial.com suggests gmail.com and is not silently fixed", () => {
  const suggestion = suggestEmailTypo("maor.andios@gmial.com");
  assert.equal(suggestion?.suggestedDomain, "gmail.com");
  assert.equal(suggestion?.suggested, "maor.andios@gmail.com");
  assert.equal(suggestion?.original, "maor.andios@gmial.com");
});

test("gmai.com suggests gmail.com", () => {
  const suggestion = suggestEmailTypo("gaash@gmai.com");
  assert.equal(suggestion?.suggestedDomain, "gmail.com");
  assert.equal(suggestion?.suggested, "gaash@gmail.com");
});

test("validateEmail reports the specific problem without calling a model", () => {
  assert.deepEqual(validateEmail("rami@gmail,com"), {
    valid: false,
    reason: "comma_in_domain",
    suggestion: "rami@gmail.com",
  });
  assert.deepEqual(validateEmail("ramigmail.com"), { valid: false, reason: "missing_at" });
  assert.deepEqual(validateEmail("rami@@gmail.com"), { valid: false, reason: "multiple_at" });
  assert.deepEqual(validateEmail("rami @gmail.com"), { valid: false, reason: "contains_space" });
  assert.deepEqual(validateEmail("rami@gmail"), { valid: false, reason: "missing_tld" });
  assert.deepEqual(validateEmail("rami@gmial.com"), {
    valid: false,
    reason: "common_domain_typo",
    suggestion: "rami@gmail.com",
  });
  assert.deepEqual(validateEmail("rami@gamil.com"), {
    valid: false,
    reason: "common_domain_typo",
    suggestion: "rami@gmail.com",
  });
  assert.deepEqual(validateEmail("rami@gmai.com"), {
    valid: false,
    reason: "common_domain_typo",
    suggestion: "rami@gmail.com",
  });
  assert.deepEqual(validateEmail("rami@gmail.com"), { valid: true, normalizedEmail: "rami@gmail.com" });
  assert.equal(parseEmailTypoChoice("כן, לתקן"), "confirm");
  assert.equal(parseEmailTypoChoice("אכתוב מחדש"), "rewrite");
  assert.equal(parseEmailTypoChoice("לא, אכתוב מחדש"), "rewrite");
});
