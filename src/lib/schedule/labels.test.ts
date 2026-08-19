import assert from "node:assert/strict";
import { test } from "node:test";

import { scheduleLabel, WEEKDAY, WEEKDAY_LABELS, weekdayLabel } from "./labels";
import { computeNextRunAt, formatJerusalemYmd, jerusalemWallTimeToUtc } from "./next-run";
import { parseWorkflowDefinition, type WorkflowDefinition } from "../workflow/schema";

test("Hebrew weekday labels match 0=Sunday … 6=Saturday", () => {
  assert.equal(WEEKDAY.sunday, 0);
  assert.equal(WEEKDAY.monday, 1);
  assert.equal(WEEKDAY.tuesday, 2);
  assert.equal(WEEKDAY.wednesday, 3);
  assert.equal(WEEKDAY.thursday, 4);
  assert.equal(WEEKDAY.friday, 5);
  assert.equal(WEEKDAY.saturday, 6);
  assert.deepEqual([...WEEKDAY_LABELS], [
    "יום ראשון",
    "יום שני",
    "יום שלישי",
    "יום רביעי",
    "יום חמישי",
    "יום שישי",
    "יום שבת",
  ]);
});

function weeklyDefinition(weekday: number): WorkflowDefinition {
  return {
    version: 1,
    name: "בדיקת יום",
    senderMailboxId: null,
    recipientMode: "fixed",
    recipients: [{ name: "רוני", email: "roni@example.com" }],
    schedule: {
      type: "weekly",
      weekday,
      time: "10:00",
      timezone: "Asia/Jerusalem",
    },
    email: { subject: "נושא", body: "גוף" },
    fields: [{ id: "summary", type: "long_text", label: "סיכום", required: true, helpText: null }],
    reminder: { enabled: false, afterHours: null },
  };
}

test("schema, preview label, and next-run keep the same weekday after JSON reload", () => {
  const now = jerusalemWallTimeToUtc("2026-08-18", "12:00");
  const expectedDates = [
    "2026-08-23",
    "2026-08-24",
    "2026-08-25",
    "2026-08-19",
    "2026-08-20",
    "2026-08-21",
    "2026-08-22",
  ];

  for (let weekday = 0; weekday <= 6; weekday += 1) {
    const parsed = parseWorkflowDefinition(weeklyDefinition(weekday));
    assert.equal(parsed.success, true);
    if (!parsed.success || parsed.data.schedule.type !== "weekly") {
      continue;
    }
    assert.equal(parsed.data.schedule.weekday, weekday);

    const reloaded = parseWorkflowDefinition(JSON.parse(JSON.stringify(parsed.data)));
    assert.equal(reloaded.success, true);
    if (!reloaded.success || reloaded.data.schedule.type !== "weekly") {
      continue;
    }
    assert.equal(reloaded.data.schedule.weekday, weekday);
    assert.equal(scheduleLabel(reloaded.data), `שבועי · ${weekdayLabel(weekday)} · 10:00`);

    const next = computeNextRunAt(reloaded.data.schedule, now);
    assert.ok(next);
    assert.equal(formatJerusalemYmd(next), expectedDates[weekday]);
  }
});
