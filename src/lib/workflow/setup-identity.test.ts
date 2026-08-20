import assert from "node:assert/strict";
import { test } from "node:test";

import {
  assertContactNotSkipped,
  extractContactPerson,
  isCompanyDerivedContact,
  materializeRecipientForRuntime,
  peelMemPreposition,
} from "./setup-identity";
import { emptyWorkflowDraft } from "./draft-schema";

test("company fragments are not treated as contact names", () => {
  assert.equal(isCompanyDerivedContact("געש תעשיות", "געש תעשיות מתכת"), true);
  assert.equal(isCompanyDerivedContact("דוד כהן", "געש תעשיות מתכת"), false);
});

test("mem preposition peels געש but keeps מטריקס after מחברת", () => {
  assert.equal(peelMemPreposition("מגעש תעשיות מתכת", "מגעש תעשיות מתכת"), "געש תעשיות מתכת");
  assert.equal(peelMemPreposition("מטריקס", "מחברת מטריקס"), "מטריקס");
  assert.equal(peelMemPreposition("ממגדל חברה לביטוח", "ממגדל חברה לביטוח"), "מגדל חברה לביטוח");
  assert.equal(peelMemPreposition("מנורה מבטחים", "מחברת מנורה מבטחים"), "מנורה מבטחים");
});

test("contact extraction requires explicit evidence", () => {
  assert.equal(extractContactPerson("מגעש תעשיות מתכת"), null);
  assert.equal(extractContactPerson("מחברת געש תעשיות מתכת")?.value ?? null, null);
  assert.equal(extractContactPerson("מגעש תעשיות, איש הקשר דוד כהן")?.value, "דוד כהן");
});

test("pending contact cannot skip to email or review", () => {
  const pending = {
    recipientIdentity: {
      organizationName: "געש תעשיות מתכת",
      contactName: null,
      contactResolution: "pending" as const,
      email: null,
    },
    requirements: [{ kind: "file" }],
    pendingCompanyConfirm: null,
    awaitingCompanyName: false,
  };
  assert.throws(() => assertContactNotSkipped(pending, { key: "recipient_email" }), /contact_question_skipped/);
  assert.throws(() => assertContactNotSkipped(pending, { key: "review" }), /contact_question_skipped/);
  assert.doesNotThrow(() => assertContactNotSkipped(pending, { key: "contact_name" }));
});

test("runtime materialization does not change contactName on identity", () => {
  const identity = {
    organizationName: "געש תעשיות מתכת",
    contactName: null,
    contactResolution: "no_fixed_contact" as const,
    email: "gaas@gmail.com",
  };
  const proposal = materializeRecipientForRuntime(
    {
      ...emptyWorkflowDraft(),
      recipients: [{ name: "", organizationName: "געש תעשיות מתכת", email: "gaas@gmail.com" }],
    },
    identity,
  );
  assert.equal(proposal.recipients[0]?.name, "געש תעשיות מתכת");
  assert.equal(identity.contactName, null);
});
