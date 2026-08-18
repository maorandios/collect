import { TIMEZONE } from "@/lib/workflow/schema";
import type { WorkflowSchedule } from "@/lib/workflow/schema";

function zonedDate(date: string, time: string) {
  return new Date(`${date}T${time}:00+03:00`);
}

function pad(value: number) {
  return String(value).padStart(2, "0");
}

function formatYmd(date: Date) {
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: TIMEZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(date);
  const year = parts.find((part) => part.type === "year")?.value;
  const month = parts.find((part) => part.type === "month")?.value;
  const day = parts.find((part) => part.type === "day")?.value;
  return `${year}-${month}-${day}`;
}

function atTimeOnDate(ymd: string, time: string) {
  return zonedDate(ymd, time);
}

function addDays(date: Date, days: number) {
  const copy = new Date(date.getTime());
  copy.setUTCDate(copy.getUTCDate() + days);
  return copy;
}

export function computeUpcomingRuns(
  schedule: WorkflowSchedule,
  now = new Date(),
  count = 3,
) {
  if (schedule.type === "send_now") {
    return [] as Date[];
  }

  const runs: Date[] = [];

  if (schedule.type === "once") {
    const at = zonedDate(schedule.date, schedule.time);
    if (at.getTime() >= now.getTime()) {
      runs.push(at);
    }
    return runs;
  }

  if (schedule.type === "weekly") {
    let cursor = new Date(now.getTime());
    for (let i = 0; i < 21 && runs.length < count; i += 1) {
      const ymd = formatYmd(cursor);
      const candidate = atTimeOnDate(ymd, schedule.time);
      const weekday = new Intl.DateTimeFormat("en-US", {
        timeZone: TIMEZONE,
        weekday: "short",
      }).format(candidate);
      const map: Record<string, number> = {
        Sun: 0,
        Mon: 1,
        Tue: 2,
        Wed: 3,
        Thu: 4,
        Fri: 5,
        Sat: 6,
      };
      if (map[weekday] === schedule.weekday && candidate.getTime() > now.getTime()) {
        runs.push(candidate);
      }
      cursor = addDays(cursor, 1);
    }
    return runs;
  }

  let year = Number(formatYmd(now).slice(0, 4));
  let month = Number(formatYmd(now).slice(5, 7));

  while (runs.length < count) {
    const lastDay = new Date(Date.UTC(year, month, 0)).getUTCDate();
    const day = Math.min(schedule.day, lastDay);
    const ymd = `${year}-${pad(month)}-${pad(day)}`;
    const candidate = atTimeOnDate(ymd, schedule.time);
    if (candidate.getTime() > now.getTime()) {
      runs.push(candidate);
    }
    month += 1;
    if (month > 12) {
      month = 1;
      year += 1;
    }
  }

  return runs;
}

export function computeNextRunAt(schedule: WorkflowSchedule, now = new Date()) {
  if (schedule.type === "send_now") {
    return now;
  }
  return computeUpcomingRuns(schedule, now, 1)[0] ?? null;
}

export function formatIsraelDateTime(value: Date | string | null | undefined) {
  if (!value) {
    return "—";
  }
  const date = typeof value === "string" ? new Date(value) : value;
  return new Intl.DateTimeFormat("he-IL", {
    timeZone: TIMEZONE,
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).format(date);
}
