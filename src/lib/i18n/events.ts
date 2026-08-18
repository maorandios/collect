import { he, type EventKey } from "@/lib/i18n/he";

const eventKeys = new Set<string>(Object.keys(he.events));

export function isEventKey(type: string): type is EventKey {
  return eventKeys.has(type);
}

export function eventLabel(type: string) {
  const key = type.trim().toLowerCase();
  if (isEventKey(key)) {
    return he.events[key];
  }
  return he.errors.generic;
}
