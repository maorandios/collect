import assert from "node:assert/strict";
import { test } from "node:test";

import { reminderDelayMs } from "./reminder";

test("production reminder uses hours", () => {
  assert.equal(
    reminderDelayMs({ enabled: true, afterHours: 2, afterMinutes: 3 }, { allowMinutes: false }),
    2 * 60 * 60 * 1000,
  );
});

test("dev flag can use minutes", () => {
  assert.equal(
    reminderDelayMs({ enabled: true, afterHours: 2, afterMinutes: 3 }, { allowMinutes: true }),
    3 * 60 * 1000,
  );
});

test("disabled reminder has no delay", () => {
  assert.equal(reminderDelayMs({ enabled: false, afterHours: 2 }, { allowMinutes: true }), null);
});
