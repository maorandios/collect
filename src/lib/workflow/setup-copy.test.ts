import assert from "node:assert/strict";
import { test } from "node:test";

import { composeSetupReply } from "./setup-copy";
import { emptyWorkflowDraft } from "./draft-schema";
import { TIMEZONE } from "./schema";
import { he } from "@/lib/i18n/he";

test("first monthly company turn is short and does not start with הבנתי", () => {
  const proposal = {
    ...emptyWorkflowDraft(),
    recipients: [{ name: "", organizationName: "ניסים נכסים בע״מ", email: "" }],
    schedule: { type: "monthly" as const, day: null, time: null, timezone: TIMEZONE },
    fields: [
      { id: "a", type: "file" as const, label: "חשבוניות", required: true, helpText: null, allowedMimeTypes: ["application/pdf"], maxFiles: 1, maxFileSizeMb: 10 },
      { id: "b", type: "file" as const, label: "קבלות", required: true, helpText: null, allowedMimeTypes: ["application/pdf"], maxFiles: 1, maxFileSizeMb: 10 },
      { id: "c", type: "file" as const, label: "תדפיסי בנק", required: true, helpText: null, allowedMimeTypes: ["application/pdf"], maxFiles: 1, maxFileSizeMb: 10 },
    ],
  };
  const message = composeSetupReply({
    currentQuestion: {
      key: "contact_name",
      step: "recipient",
      question: he.studio.setup.askContactPerson,
      answerType: "text",
    },
    proposal,
    previousQuestion: null,
    firstTurn: true,
  });
  assert.match(message, /^מעולה — בכל חודש נאסוף מניסים נכסים בע״מ/);
  assert.equal(message.startsWith("הבנתי"), false);
  assert.equal((message.match(/\?/g) ?? []).length, 1);
});

test("after a contact name the assistant does not address the user as the recipient", () => {
  const message = composeSetupReply({
    currentQuestion: {
      key: "recipient_email",
      step: "recipient",
      question: he.studio.setup.askRecipientEmail,
      answerType: "email",
    },
    proposal: {
      ...emptyWorkflowDraft(),
      recipients: [{ name: "דוד לרנר", organizationName: "געש תעשיות מתכת", email: "" }],
    },
    previousQuestion: {
      key: "contact_name",
      step: "recipient",
      question: he.studio.setup.askContactPerson,
      answerType: "text",
    },
    firstTurn: false,
  });
  assert.equal(message, "מעולה. לאיזו כתובת מייל נשלח את הבקשה?");
  assert.equal(message.includes("דוד"), false);
});
