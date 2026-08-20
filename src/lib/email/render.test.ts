import assert from "node:assert/strict";
import { test } from "node:test";

import { requestEmailBodyToHtml } from "./render";
import { unescapeEmailAddress } from "./escape";
import { defaultEmailBody } from "@/lib/workflow/setup-email";
import { emptyWorkflowDraft } from "@/lib/workflow/draft-schema";
import { TIMEZONE } from "@/lib/workflow/schema";

test("email body HTML uses RTL paragraphs and a list", () => {
  const proposal = {
    ...emptyWorkflowDraft(),
    recipients: [{ name: "דוד כהן", organizationName: "ניסים נכסים בע״מ", email: "gmail22@gmail.com" }],
    schedule: { type: "monthly" as const, day: 21, time: "09:00", timezone: TIMEZONE },
    fields: [
      { id: "a", type: "file" as const, label: "חשבוניות", required: true, helpText: null, allowedMimeTypes: ["application/pdf"], maxFiles: 1, maxFileSizeMb: 10 },
      { id: "b", type: "file" as const, label: "קבלות", required: true, helpText: null, allowedMimeTypes: ["application/pdf"], maxFiles: 1, maxFileSizeMb: 10 },
      { id: "c", type: "file" as const, label: "תדפיסי בנק", required: true, helpText: null, allowedMimeTypes: ["application/pdf"], maxFiles: 1, maxFileSizeMb: 10 },
    ],
  };
  const body = defaultEmailBody(proposal);
  const html = requestEmailBodyToHtml(body);
  assert.match(html, /<p dir="rtl"/);
  assert.match(html, /<ul dir="rtl"/);
  assert.match(html, /<li>חשבוניות<\/li>/);
  assert.match(html, /<li>קבלות<\/li>/);
  assert.match(html, /<li>תדפיסי בנק<\/li>/);
  assert.match(body, /\n/);
});

test("backslash-at is not shown in email addresses", () => {
  assert.equal(unescapeEmailAddress("gmail22\\@gmail.com"), "gmail22@gmail.com");
  const html = requestEmailBodyToHtml("נא לשלוח אל gmail22\\@gmail.com");
  assert.equal(html.includes("\\@"), false);
  assert.match(html, /gmail22@gmail.com/);
});
