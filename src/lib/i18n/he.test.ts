import assert from "node:assert/strict";
import { test } from "node:test";

import { eventLabel } from "./events";
import { he } from "./he";
import { statusLabel } from "./status";

function collectStrings(value: unknown): string[] {
  if (typeof value === "string") {
    return [value];
  }
  if (!value || typeof value !== "object") {
    return [];
  }
  return Object.values(value).flatMap(collectStrings);
}

test("UI dictionary has no leftover workflow loanword", () => {
  for (const value of collectStrings(he)) {
    assert.equal(value.includes("וורקפלואו"), false, value);
  }
});

test("status labels come only from he.statuses", () => {
  assert.equal(statusLabel("draft"), he.statuses.draft);
  assert.equal(statusLabel("active"), he.statuses.active);
  assert.equal(statusLabel("connected"), he.statuses.connected);
  assert.equal(statusLabel("unknown_status"), he.errors.generic);
});

test("event labels are Hebrew", () => {
  assert.equal(eventLabel("email_sent"), he.events.email_sent);
  assert.equal(eventLabel("submitted"), he.events.submitted);
  assert.equal(eventLabel("filling_started"), he.events.filling_started);
  assert.equal(eventLabel("unknown_event"), he.errors.generic);
});
