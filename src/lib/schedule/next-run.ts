import { formatInTimeZone, fromZonedTime } from "date-fns-tz";

import { TIMEZONE, type WorkflowSchedule } from "@/lib/workflow/schema";

export function jerusalemWallTimeToUtc(ymd: string, time: string) {
  return fromZonedTime(`${ymd} ${time}:00`, TIMEZONE);
}

export function formatJerusalemYmd(date: Date) {
  return formatInTimeZone(date, TIMEZONE, "yyyy-MM-dd");
}

export function formatJerusalemHm(date: Date) {
  return formatInTimeZone(date, TIMEZONE, "HH:mm");
}

function pad(value: number) {
  return String(value).padStart(2, "0");
}

function calendarDate(ymd: string) {
  const [year, month, day] = ymd.split("-").map(Number);
  return new Date(Date.UTC(year, month - 1, day));
}

function ymdFromCalendar(date: Date) {
  return `${date.getUTCFullYear()}-${pad(date.getUTCMonth() + 1)}-${pad(date.getUTCDate())}`;
}

export function jerusalemWeekday(date: Date) {
  return calendarDate(formatJerusalemYmd(date)).getUTCDay();
}

function addCalendarDays(ymd: string, days: number) {
  const date = calendarDate(ymd);
  date.setUTCDate(date.getUTCDate() + days);
  return ymdFromCalendar(date);
}

function lastDayOfMonth(year: number, month: number) {
  return new Date(Date.UTC(year, month, 0)).getUTCDate();
}

export function monthlyOccurrence(year: number, month: number, day: number, time: string) {
  const last = lastDayOfMonth(year, month);
  const clamped = Math.min(day, last);
  return jerusalemWallTimeToUtc(`${year}-${pad(month)}-${pad(clamped)}`, time);
}

function firstWeeklyOnOrAfter(
  schedule: Extract<WorkflowSchedule, { type: "weekly" }>,
  now: Date,
  mode: "onOrAfter" | "after" = "onOrAfter",
) {
  const startYmd = formatJerusalemYmd(now);
  const isMatch = (candidate: Date) =>
    mode === "after" ? candidate.getTime() > now.getTime() : candidate.getTime() >= now.getTime();
  for (let offset = 0; offset < 8; offset += 1) {
    const ymd = addCalendarDays(startYmd, offset);
    const candidate = jerusalemWallTimeToUtc(ymd, schedule.time);
    if (jerusalemWeekday(candidate) === schedule.weekday && isMatch(candidate)) {
      return candidate;
    }
  }
  return null;
}

function firstMonthlyOnOrAfter(schedule: Extract<WorkflowSchedule, { type: "monthly" }>, now: Date) {
  const ymd = formatJerusalemYmd(now);
  const year = Number(ymd.slice(0, 4));
  const month = Number(ymd.slice(5, 7));
  for (let offset = 0; offset < 14; offset += 1) {
    const total = year * 12 + (month - 1) + offset;
    const nextYear = Math.floor(total / 12);
    const nextMonth = (total % 12) + 1;
    const candidate = monthlyOccurrence(nextYear, nextMonth, schedule.day, schedule.time);
    if (candidate.getTime() >= now.getTime()) {
      return candidate;
    }
  }
  return null;
}

export function advanceOne(schedule: WorkflowSchedule, from: Date) {
  if (schedule.type === "send_now" || schedule.type === "once" || schedule.type === "manual") {
    return null;
  }

  if (schedule.type === "weekly") {
    return firstWeeklyOnOrAfter(schedule, from, "after");
  }

  const ymd = formatJerusalemYmd(from);
  const year = Number(ymd.slice(0, 4));
  const month = Number(ymd.slice(5, 7));
  const total = year * 12 + month;
  return monthlyOccurrence(Math.floor(total / 12), (total % 12) + 1, schedule.day, schedule.time);
}

export function computeUpcomingRuns(
  schedule: WorkflowSchedule,
  now = new Date(),
  count = 3,
) {
  if (schedule.type === "send_now" || schedule.type === "manual") {
    return [] as Date[];
  }

  if (schedule.type === "once") {
    const at = jerusalemWallTimeToUtc(schedule.date, schedule.time);
    return at.getTime() >= now.getTime() ? [at] : [];
  }

  const first =
    schedule.type === "weekly"
      ? firstWeeklyOnOrAfter(schedule, now)
      : firstMonthlyOnOrAfter(schedule, now);
  if (!first) {
    return [];
  }

  const runs = [first];
  let cursor = first;
  while (runs.length < count) {
    const next = advanceOne(schedule, cursor);
    if (!next) {
      break;
    }
    runs.push(next);
    cursor = next;
  }
  return runs;
}

export function computeNextRunAt(schedule: WorkflowSchedule, now = new Date()) {
  if (schedule.type === "send_now") {
    return now;
  }
  if (schedule.type === "manual") {
    return null;
  }
  return computeUpcomingRuns(schedule, now, 1)[0] ?? null;
}

export function computeFollowingRun(
  schedule: WorkflowSchedule,
  scheduledFor: Date,
  now = new Date(),
) {
  if (schedule.type === "send_now" || schedule.type === "once" || schedule.type === "manual") {
    return null;
  }

  let next = advanceOne(schedule, scheduledFor);
  while (next && next.getTime() <= now.getTime()) {
    next = advanceOne(schedule, next);
  }
  return next;
}

export function isOnceInThePast(schedule: WorkflowSchedule, now = new Date()) {
  if (schedule.type !== "once") {
    return false;
  }
  return jerusalemWallTimeToUtc(schedule.date, schedule.time).getTime() < now.getTime();
}
