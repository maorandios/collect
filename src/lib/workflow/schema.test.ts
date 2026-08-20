import assert from "node:assert/strict";
import { test } from "node:test";

import { parseWorkflowDraft } from "./draft-schema";
import { roniExampleWorkflow } from "./example";
import { normalizeWorkflowDefinition } from "./normalize";
import { parseWorkflowDefinition } from "./schema";

const oldSendNowJson = {
  version: 1,
  name: "סיכום חודשי",
  senderMailboxId: null,
  recipients: [{ name: "רוני", email: "roni@example.com" }],
  schedule: { type: "send_now" },
  email: { subject: "נושא", body: "גוף" },
  fields: [{ id: "summary", type: "long_text", label: "סיכום", required: true, helpText: null }],
  reminder: { enabled: false, afterHours: null },
};

test("old JSON without recipientMode stays send_now and becomes fixed", () => {
  const parsed = parseWorkflowDefinition(oldSendNowJson);
  assert.equal(parsed.success, true);
  if (!parsed.success) {
    return;
  }
  assert.equal(parsed.data.schedule.type, "send_now");
  assert.equal(parsed.data.recipientMode, "fixed");
  assert.notEqual(parsed.data.schedule.type, "manual");
  const normalized = normalizeWorkflowDefinition(parsed.data);
  assert.equal(normalized.schedule.type, "send_now");
  assert.equal(normalized.recipientMode, "fixed");
});

test("send_now is never mapped to manual", () => {
  const parsed = parseWorkflowDefinition(roniExampleWorkflow);
  assert.equal(parsed.success, true);
  if (!parsed.success) {
    return;
  }
  assert.equal(parsed.data.schedule.type, "send_now");
});

test("manual schedule parses", () => {
  const parsed = parseWorkflowDefinition({
    ...oldSendNowJson,
    schedule: { type: "manual" },
    recipientMode: "at_launch",
    recipients: [],
  });
  assert.equal(parsed.success, true);
  if (!parsed.success) {
    return;
  }
  assert.equal(parsed.data.schedule.type, "manual");
  assert.equal(parsed.data.recipientMode, "at_launch");
});

test("draft schema accepts an incomplete process", () => {
  const parsed = parseWorkflowDraft({ version: 1, name: "טיוטה" });
  assert.equal(parsed.success, true);
  if (!parsed.success) {
    return;
  }
  assert.equal(parsed.data.name, "טיוטה");
  assert.equal(parsed.data.fields.length, 0);
});

test("draft schema keeps a partial monthly schedule and published schema rejects it", () => {
  const partial = {
    version: 1,
    name: "חודשי חלקי",
    schedule: { type: "monthly", day: 25 },
  };
  const draft = parseWorkflowDraft(partial);
  assert.equal(draft.success, true);
  if (draft.success) {
    assert.equal(draft.data.schedule?.type, "monthly");
    if (draft.data.schedule?.type === "monthly") {
      assert.equal(draft.data.schedule.day, 25);
      assert.equal(draft.data.schedule.time ?? null, null);
    }
  }
  assert.equal(parseWorkflowDefinition(partial).success, false);
});

test("published recipient JSON without organizationName still parses", () => {
  const parsed = parseWorkflowDefinition(oldSendNowJson);
  assert.equal(parsed.success, true);
  if (parsed.success) {
    assert.equal(parsed.data.recipients[0]?.organizationName ?? null, null);
  }
});
