import assert from "node:assert/strict";
import { test } from "node:test";

import {
  advanceOne,
  computeFollowingRun,
  computeNextRunAt,
  computeUpcomingRuns,
  formatJerusalemHm,
  formatJerusalemYmd,
  isOnceInThePast,
  jerusalemWallTimeToUtc,
  jerusalemWeekday,
} from "./next-run";
import type { WorkflowSchedule } from "../workflow/schema";

const tz = "Asia/Jerusalem" as const;

test("once in the future returns that instant", () => {
  const schedule: WorkflowSchedule = {
    type: "once",
    date: "2026-08-20",
    time: "09:30",
    timezone: tz,
  };
  const now = new Date("2026-08-18T06:00:00.000Z");
  const next = computeNextRunAt(schedule, now);
  assert.ok(next);
  assert.equal(next.toISOString(), jerusalemWallTimeToUtc("2026-08-20", "09:30").toISOString());
});

test("once in the past is blocked", () => {
  const schedule: WorkflowSchedule = {
    type: "once",
    date: "2026-08-17",
    time: "09:30",
    timezone: tz,
  };
  const now = new Date("2026-08-18T06:00:00.000Z");
  assert.equal(isOnceInThePast(schedule, now), true);
  assert.equal(computeNextRunAt(schedule, now), null);
});

test("weekly Sunday is weekday 0", () => {
  const schedule: WorkflowSchedule = {
    type: "weekly",
    weekday: 0,
    time: "09:00",
    timezone: tz,
  };
  const now = jerusalemWallTimeToUtc("2026-08-16", "08:00");
  const next = computeNextRunAt(schedule, now);
  assert.ok(next);
  assert.equal(formatJerusalemYmd(next), "2026-08-16");
  assert.equal(jerusalemWeekday(next), 0);
  assert.equal(formatJerusalemHm(next), "09:00");
});

test("monthly day 31 in February uses last day of month", () => {
  const schedule: WorkflowSchedule = {
    type: "monthly",
    day: 31,
    time: "10:00",
    timezone: tz,
  };
  const now = jerusalemWallTimeToUtc("2026-01-15", "08:00");
  const runs = computeUpcomingRuns(schedule, now, 3);
  assert.equal(formatJerusalemYmd(runs[0]), "2026-01-31");
  assert.equal(formatJerusalemYmd(runs[1]), "2026-02-28");
  assert.equal(formatJerusalemYmd(runs[2]), "2026-03-31");
});

test("Israel DST spring-forward keeps 10:00 wall time", () => {
  const schedule: WorkflowSchedule = {
    type: "weekly",
    weekday: 5,
    time: "10:00",
    timezone: tz,
  };
  const before = jerusalemWallTimeToUtc("2026-03-20", "10:00");
  const after = advanceOne(schedule, before);
  assert.ok(after);
  assert.equal(formatJerusalemYmd(after), "2026-03-27");
  assert.equal(formatJerusalemHm(after), "10:00");
  assert.notEqual(before.getUTCHours(), after.getUTCHours());
});

test("next run does not drift from worker delay", () => {
  const schedule: WorkflowSchedule = {
    type: "weekly",
    weekday: 1,
    time: "10:00",
    timezone: tz,
  };
  const scheduledFor = jerusalemWallTimeToUtc("2026-08-17", "10:00");
  const workerNow = new Date(scheduledFor.getTime() + 3_000);
  const following = computeFollowingRun(schedule, scheduledFor, workerNow);
  assert.ok(following);
  assert.equal(formatJerusalemYmd(following), "2026-08-24");
  assert.equal(formatJerusalemHm(following), "10:00");
});

test("catch-up skips missed weekly runs and jumps to the next future slot", () => {
  const schedule: WorkflowSchedule = {
    type: "weekly",
    weekday: 1,
    time: "10:00",
    timezone: tz,
  };
  const missed = jerusalemWallTimeToUtc("2026-08-03", "10:00");
  const now = jerusalemWallTimeToUtc("2026-08-18", "11:00");
  const following = computeFollowingRun(schedule, missed, now);
  assert.ok(following);
  assert.equal(formatJerusalemYmd(following), "2026-08-24");
});

test("pause/resume uses the next future slot instead of sending missed runs", () => {
  const schedule: WorkflowSchedule = {
    type: "weekly",
    weekday: 3,
    time: "14:00",
    timezone: tz,
  };
  const pausedAt = jerusalemWallTimeToUtc("2026-08-05", "14:00");
  const resumedAt = jerusalemWallTimeToUtc("2026-08-18", "09:00");
  const next = computeNextRunAt(schedule, resumedAt);
  assert.ok(next);
  assert.equal(next.getTime() > pausedAt.getTime(), true);
  assert.equal(formatJerusalemYmd(next), "2026-08-19");
  assert.equal(formatJerusalemHm(next), "14:00");
});

test("weekly weekdays from 18.08.2026 12:00 Asia/Jerusalem at 10:00", () => {
  const now = jerusalemWallTimeToUtc("2026-08-18", "12:00");
  const expected = [
    ["2026-08-23", 0],
    ["2026-08-24", 1],
    ["2026-08-25", 2],
    ["2026-08-19", 3],
    ["2026-08-20", 4],
    ["2026-08-21", 5],
    ["2026-08-22", 6],
  ] as const;
  for (const [ymd, weekday] of expected) {
    const schedule: WorkflowSchedule = {
      type: "weekly",
      weekday,
      time: "10:00",
      timezone: tz,
    };
    const next = computeNextRunAt(schedule, now);
    assert.ok(next, `weekday ${weekday}`);
    assert.equal(formatJerusalemYmd(next), ymd, `weekday ${weekday} date`);
    assert.equal(formatJerusalemHm(next), "10:00", `weekday ${weekday} time`);
    assert.equal(jerusalemWeekday(next), weekday, `weekday ${weekday} getDay`);
  }
});

test("following run snaps to schedule weekday instead of +7 from a misaligned timestamp", () => {
  const schedule: WorkflowSchedule = {
    type: "weekly",
    weekday: 1,
    time: "10:00",
    timezone: tz,
  };
  const misalignedTuesday = jerusalemWallTimeToUtc("2026-08-18", "11:00");
  const now = jerusalemWallTimeToUtc("2026-08-18", "12:00");
  const following = computeFollowingRun(schedule, misalignedTuesday, now);
  assert.ok(following);
  assert.equal(formatJerusalemYmd(following), "2026-08-24");
  assert.equal(jerusalemWeekday(following), 1);
});

test("preview of next three Monday runs stays on Monday", () => {
  const schedule: WorkflowSchedule = {
    type: "weekly",
    weekday: 1,
    time: "10:00",
    timezone: tz,
  };
  const now = jerusalemWallTimeToUtc("2026-08-18", "12:00");
  const runs = computeUpcomingRuns(schedule, now, 3);
  assert.deepEqual(
    runs.map((run) => formatJerusalemYmd(run)),
    ["2026-08-24", "2026-08-31", "2026-09-07"],
  );
  assert.ok(runs.every((run) => jerusalemWeekday(run) === 1));
});

test("manual has no next run while send_now still resolves to now", () => {
  const now = new Date("2026-08-18T09:00:00.000Z");
  assert.equal(computeNextRunAt({ type: "manual" }, now), null);
  assert.equal(computeUpcomingRuns({ type: "manual" }, now).length, 0);
  assert.equal(computeFollowingRun({ type: "manual" }, now, now), null);
  assert.equal(computeNextRunAt({ type: "send_now" }, now)?.toISOString(), now.toISOString());
});
