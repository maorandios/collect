import { he, type StatusKey } from "@/lib/i18n/he";

const statusKeys = new Set<string>(Object.keys(he.statuses));

export function isStatusKey(status: string): status is StatusKey {
  return statusKeys.has(status);
}

export function statusLabel(status: string) {
  if (isStatusKey(status)) {
    return he.statuses[status];
  }
  return he.errors.generic;
}
