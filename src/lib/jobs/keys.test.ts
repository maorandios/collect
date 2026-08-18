import assert from "node:assert/strict";
import { test } from "node:test";

import { sendEmailIdempotencyKey, sendReminderIdempotencyKey } from "../jobs/keys";

test("email and reminder idempotency keys are stable", () => {
  const requestId = "11111111-1111-1111-1111-111111111111";
  const due = "2026-08-18T10:00:00.000Z";
  assert.equal(sendEmailIdempotencyKey(requestId), `send_email:${requestId}`);
  assert.equal(
    sendReminderIdempotencyKey(requestId, due),
    `send_reminder:${requestId}:${due}`,
  );
  assert.equal(sendEmailIdempotencyKey(requestId), sendEmailIdempotencyKey(requestId));
  assert.equal(
    sendReminderIdempotencyKey(requestId, due),
    sendReminderIdempotencyKey(requestId, due),
  );
});
