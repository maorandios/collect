import assert from "node:assert/strict";
import { test } from "node:test";

import { emptyWorkflowDraft } from "./draft-schema";
import { TIMEZONE } from "./schema";
import { defaultEmailBody, defaultEmailSubject, emailCoversAllFields, syncProposalEmail } from "./setup-email";

const threeFiles = {
  ...emptyWorkflowDraft(),
  recipients: [{ name: "ישראל ישראלי", organizationName: "געש מתכות בע״מ", email: "gaash@gmail.com" }],
  schedule: { type: "monthly" as const, day: 28, time: "08:00", timezone: TIMEZONE },
  fields: [
    {
      id: "a",
      type: "file" as const,
      label: "חשבוניות",
      required: true,
      helpText: null,
      allowedMimeTypes: ["application/pdf"],
      maxFiles: 1,
      maxFileSizeMb: 10,
    },
    {
      id: "b",
      type: "file" as const,
      label: "קבלות",
      required: true,
      helpText: null,
      allowedMimeTypes: ["application/pdf"],
      maxFiles: 1,
      maxFileSizeMb: 10,
    },
    {
      id: "c",
      type: "file" as const,
      label: "אישור ניכוי מס במקור",
      required: true,
      helpText: null,
      allowedMimeTypes: ["application/pdf"],
      maxFiles: 1,
      maxFileSizeMb: 10,
    },
  ],
};

test("monthly documents use a complete subject and list every field", () => {
  assert.equal(defaultEmailSubject(threeFiles), "בקשה למסמכים חודשיים");
  const body = defaultEmailBody(threeFiles);
  assert.match(body, /^שלום ישראל ישראלי,/);
  assert.match(body, /• חשבוניות/);
  assert.match(body, /• קבלות/);
  assert.match(body, /• אישור ניכוי מס במקור/);
  assert.equal(body.includes("את חשבוניות"), false);
  assert.equal(body.includes("געש מתכות"), false);
  assert.equal(emailCoversAllFields({ ...threeFiles, email: { subject: "", body } }), true);
});

test("no contact greets without a company name", () => {
  const proposal = {
    ...threeFiles,
    recipients: [{ name: "געש מתכות בע״מ", organizationName: "געש מתכות בע״מ", email: "gaash@gmail.com" }],
  };
  assert.match(defaultEmailBody(proposal), /^שלום,/);
});

test("manual email edits are not overwritten", () => {
  const locked = syncProposalEmail({
    ...threeFiles,
    email: { subject: "נושא ידני", body: "גוף ידני" },
    editorLocks: { ...threeFiles.editorLocks, emailSubject: true, emailBody: true },
  });
  assert.equal(locked.email.subject, "נושא ידני");
  assert.equal(locked.email.body, "גוף ידני");
});
