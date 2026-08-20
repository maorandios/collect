import assert from "node:assert/strict";
import { test } from "node:test";

import { emptyWorkflowDraft } from "./draft-schema";
import { TIMEZONE } from "./schema";
import { buildSetupReviewModel } from "./setup-review";
import { emptySetupState } from "./setup-state";

test("chat review model has no email subject or body", () => {
  const setup = emptySetupState(0, {
    ...emptyWorkflowDraft(),
    recipients: [{ name: "דוד כהן", organizationName: "געש תעשיות מתכת", email: "gaas@gmail.com" }],
    schedule: { type: "monthly", day: 22, time: "11:00", timezone: TIMEZONE },
    email: { subject: "בקשה למסמכים חודשיים", body: "שלום דוד כהן,\n\nנא לצרף" },
    fields: [
      { id: "a", type: "file", label: "דוח עובדים", required: true, helpText: null, allowedMimeTypes: ["application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", "application/vnd.ms-excel", "text/csv"], maxFiles: 1, maxFileSizeMb: 10 },
    ],
  });
  setup.status = "review";
  setup.recipientIdentity = {
    organizationName: "געש תעשיות מתכת",
    contactName: "דוד כהן",
    contactResolution: "named",
    email: "gaas@gmail.com",
  };
  const review = buildSetupReviewModel(setup);
  assert.equal(review.includesEmailContent, false);
  assert.equal("subject" in review, false);
  assert.equal("body" in review, false);
  assert.equal(JSON.stringify(review).includes("בקשה למסמכים חודשיים"), false);
  assert.equal(JSON.stringify(review).includes("נא לצרף"), false);
  assert.equal(review.schedule, "חודשי · בכל 22 בחודש · 11:00");
  assert.equal(review.fields[0], "דוח עובדים");
  assert.equal(review.contactName, "דוד כהן");
});

test("end of month is shown as בסוף כל חודש", () => {
  const setup = emptySetupState(0, {
    ...emptyWorkflowDraft(),
    schedule: { type: "monthly", day: 31, time: "13:00", timezone: TIMEZONE, monthlyDayMode: "end_of_month" },
    fields: [
      { id: "a", type: "file", label: "חשבוניות", required: true, helpText: null, allowedMimeTypes: ["application/pdf"], maxFiles: 1, maxFileSizeMb: 10 },
    ],
  });
  setup.status = "review";
  const review = buildSetupReviewModel(setup);
  assert.equal(review.schedule, "חודשי · בסוף כל חודש · 13:00");
  assert.equal(review.schedule.includes("בכל 31 בחודש"), false);
  assert.equal(review.includesEmailContent, false);
});
