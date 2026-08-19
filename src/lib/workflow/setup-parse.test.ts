import assert from "node:assert/strict";
import { test } from "node:test";

import {
  extractTime,
  extractWeekday,
  parseFieldKind,
  parseReminderChoice,
  parseTriggerType,
  suggestEmailTypo,
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

test("פעם בשבוע is weekly", () => {
  assert.equal(parseTriggerType("פעם בשבוע"), "weekly");
  assert.equal(parseTriggerType("כל שבוע"), "weekly");
  assert.equal(parseTriggerType("מדי שבוע"), "weekly");
  assert.equal(parseTriggerType("שבועי"), "weekly");
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
