import { TIMEZONE } from "@/lib/workflow/schema";

export {
  computeFollowingRun,
  computeNextRunAt,
  computeUpcomingRuns,
  isOnceInThePast,
} from "@/lib/schedule/next-run";

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
