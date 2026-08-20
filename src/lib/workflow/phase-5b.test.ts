import assert from "node:assert/strict";
import { test } from "node:test";

import { omitDraftOnlyFields } from "./editor-locks";
import {
  getDraftRecipient,
  getDraftReminder,
  materializePublishedDefinition,
  materializedRecipientName,
  withDraftRecipient,
  withDraftReminder,
  withEmailEditingState,
} from "./draft-canonical";
import { emptyWorkflowDraft, parseWorkflowDraft } from "./draft-schema";
import { createDraftSaveQueue } from "./draft-save-queue";
import { ALL_SUPPORTED_FILE_MIME_TYPES } from "./file-formats";
import { blankIntakeDraft, draftFromIntakeExtraction, resolveIntakeRecord, shouldRunIntakeExtraction } from "./intake-draft";
import { emptyInitialWorkflowExtraction } from "./intake-extraction";
import { sanitizeInitialExtraction, validateAtomicExtraction } from "./intake-sanitize";
import { TIMEZONE } from "./schema";
import { syncProposalEmail } from "./setup-email";
import { getWizardCompletion, parseWizardStep } from "./wizard-completion";

function monthlyDraft() {
  return {
    ...emptyWorkflowDraft(),
    name: "איסוף מסמכים חודשיים",
    email: { subject: "בקשה למסמכים חודשיים", body: "שלום,\n\nנא לצרף." },
    schedule: { type: "monthly" as const, day: 31, time: "16:00", timezone: TIMEZONE, monthlyDayMode: "end_of_month" as const },
    fields: [
      {
        id: "a",
        type: "file" as const,
        label: "דוח עובדים",
        required: true,
        helpText: null,
        allowedMimeTypes: [...ALL_SUPPORTED_FILE_MIME_TYPES],
        maxFiles: 1,
        maxFileSizeMb: 10,
      },
    ],
    recipients: [{ organizationName: "געש תעשיות מתכת", name: "שלומי", email: "gam@gmail.com" }],
  };
}

test("legacy reminderDecision maps to canonical DraftReminder", () => {
  const unset = emptyWorkflowDraft();
  assert.deepEqual(getDraftReminder(unset), { state: "unset" });

  const declined = withDraftReminder(unset, { state: "disabled" });
  assert.equal(declined.reminderDecision, "declined");
  assert.equal(declined.reminder.enabled, false);
  assert.deepEqual(getDraftReminder(declined), { state: "disabled" });

  const enabled = withDraftReminder(unset, { state: "enabled", afterHours: 24 });
  assert.equal(enabled.reminder.enabled, true);
  assert.equal(enabled.reminder.afterHours, 24);
  assert.deepEqual(getDraftReminder(enabled), { state: "enabled", afterHours: 24 });

  const legacy = parseWorkflowDraft({
    reminder: { enabled: true, afterHours: 168 },
    reminderDecision: "enabled",
  });
  assert.equal(legacy.success, true);
  if (legacy.success) {
    assert.deepEqual(getDraftReminder(legacy.data), { state: "enabled", afterHours: 168 });
  }
});

test("recipient materialize uses contact then organization then email", () => {
  const named = withDraftRecipient(emptyWorkflowDraft(), {
    organizationName: "געש תעשיות מתכת",
    contactName: "שלומי חביבה",
    contactResolution: "named",
    email: "gam@gmail.com",
  });
  const recipient = getDraftRecipient(named);
  assert.equal(recipient.contactName, "שלומי חביבה");
  assert.equal(materializedRecipientName(recipient), "שלומי חביבה");

  const orgOnly = withDraftRecipient(emptyWorkflowDraft(), {
    organizationName: "געש תעשיות מתכת",
    contactName: null,
    contactResolution: "no_fixed_contact",
    email: "gam@gmail.com",
  });
  assert.equal(getDraftRecipient(orgOnly).contactResolution, "no_fixed_contact");
  assert.equal(materializedRecipientName(getDraftRecipient(orgOnly)), "געש תעשיות מתכת");
});

test("omitDraftOnlyFields drops wizard metadata before publish", () => {
  const draft = withEmailEditingState(
    {
      ...monthlyDraft(),
      intakeRequestId: "req-1",
      draftReminder: { state: "enabled", afterHours: 24 },
    },
    { subjectManuallyEdited: true, bodyManuallyEdited: true },
  );
  const published = omitDraftOnlyFields(draft as unknown as Record<string, unknown>);
  assert.equal("emailEditingState" in published, false);
  assert.equal("draftReminder" in published, false);
  assert.equal("intakeRequestId" in published, false);
  assert.equal("reminderDecision" in published, false);
  const recipients = published.recipients as Array<Record<string, unknown>>;
  assert.equal("contactResolution" in (recipients[0] ?? {}), false);
  assert.equal("contactName" in (recipients[0] ?? {}), false);
});

test("getWizardCompletion drives stepper and activation from the same issues", () => {
  const empty = getWizardCompletion(emptyWorkflowDraft());
  assert.equal(empty.readyToPublish, false);
  assert.equal(empty.steps.items.complete, false);
  assert.equal(empty.steps.activation.issues.includes(empty.steps.items.issues[0] ?? ""), true);

  const complete = withDraftReminder(monthlyDraft(), { state: "enabled", afterHours: 24 });
  const done = getWizardCompletion(complete);
  assert.equal(done.steps.items.complete, true);
  assert.equal(done.steps.recipient.complete, true);
  assert.equal(done.steps.schedule.complete, true);
  assert.equal(done.steps.preview.complete, true);
  assert.equal(done.readyToPublish, true);
  assert.equal(done.steps.activation.complete, true);
});

test("materializePublishedDefinition writes runtime reminder and recipient name", () => {
  const draft = withDraftReminder(
    withDraftRecipient(monthlyDraft(), {
      organizationName: "געש תעשיות מתכת",
      contactName: "שלומי",
      contactResolution: "named",
      email: "gam@gmail.com",
    }),
    { state: "enabled", afterHours: 24 },
  );
  const published = materializePublishedDefinition(draft);
  assert.equal(published.success, true);
  if (published.success) {
    assert.equal(published.data.reminder.enabled, true);
    assert.equal(published.data.reminder.afterHours, 24);
    assert.equal(published.data.recipients[0]?.name, "שלומי");
    assert.equal("emailEditingState" in published.data, false);
  }
});

test("manual email body is not overwritten when a field is added", () => {
  const started = withEmailEditingState(monthlyDraft(), { bodyManuallyEdited: true });
  started.email.body = "גוף ידני";
  const next = {
    ...started,
    fields: [
      ...started.fields,
      {
        id: "b",
        type: "file" as const,
        label: "קבלות",
        required: true,
        helpText: null,
        allowedMimeTypes: [...ALL_SUPPORTED_FILE_MIME_TYPES],
        maxFiles: 1,
        maxFileSizeMb: 10,
      },
    ],
  };
  const synced = syncProposalEmail(next);
  assert.equal(synced.email.body, "גוף ידני");
});

test("save queue flush and enqueue share one CAS revision chain", async () => {
  const revisions: number[] = [];
  let stored = emptyWorkflowDraft();
  let revision = 0;
  const queue = createDraftSaveQueue({
    debounceMs: 10_000,
    save: async ({ draft, expectedRevision }) => {
      assert.equal(expectedRevision, revision);
      revision += 1;
      stored = draft;
      revisions.push(expectedRevision);
      return { ok: true as const, draft, revision, workflowId: "wf-1" };
    },
  });
  queue.setRevision(0);
  queue.enqueue({ ...stored, name: "אחד" });
  queue.enqueue({ ...stored, name: "שניים" });
  await queue.flush();
  queue.enqueue({ ...stored, name: "שלוש" });
  await queue.flush();
  assert.equal(stored.name, "שלוש");
  assert.deepEqual(revisions, [0, 1]);
  queue.dispose();
});

const INDUSTRIES_INTAKE =
  "קבלת דוח עובדים, חשבוניות, קבלות ותדפיס בנק באופן חודשי מגעש תעשיות מתכת";

test("industries intake fills unconfigured fields and leaves gaps for the wizard", () => {
  let nextId = 0;
  const draft = draftFromIntakeExtraction({
    userMessage: INDUSTRIES_INTAKE,
    extraction: emptyInitialWorkflowExtraction(),
    intakeRequestId: "11111111-1111-4111-8111-111111111111",
    createId: () => {
      nextId += 1;
      return `field-${nextId}`;
    },
  });
  assert.deepEqual(
    draft.fields.map((field) => ({ label: field.label, type: field.type })),
    [
      { label: "דוח עובדים", type: "unconfigured" },
      { label: "חשבוניות", type: "unconfigured" },
      { label: "קבלות", type: "unconfigured" },
      { label: "תדפיס בנק", type: "unconfigured" },
    ],
  );
  const recipient = getDraftRecipient(draft);
  assert.equal(recipient.organizationName, "געש תעשיות מתכת");
  assert.equal(recipient.contactName, null);
  assert.equal(recipient.contactResolution, "pending");
  assert.equal(recipient.email, null);
  assert.equal(draft.schedule?.type, "monthly");
  if (draft.schedule?.type === "monthly") {
    assert.equal(draft.schedule.day ?? null, null);
    assert.equal(draft.schedule.time ?? null, null);
  }
  assert.deepEqual(getDraftReminder(draft), { state: "unset" });
  assert.equal(draft.email.subject.trim().length > 0, true);
  assert.equal(draft.email.body.includes("דוח עובדים"), true);
  assert.equal(draft.intakeRequestId, "11111111-1111-4111-8111-111111111111");
});

test("intake clientRequestId reuses the same workflow after AI failure", () => {
  const clientRequestId = "22222222-2222-4222-8222-222222222222";
  const created: string[] = [];
  function ensure(remembered: { id: string; intakeRequestId?: string } | null, found: { id: string } | null) {
    const resolved = resolveIntakeRecord({
      clientRequestId,
      remembered,
      foundByRequestId: found,
    });
    if (resolved.shouldCreate) {
      const id = `wf-${created.length + 1}`;
      created.push(id);
      return { id, intakeRequestId: clientRequestId, draft: blankIntakeDraft(clientRequestId) };
    }
    return {
      id: resolved.workflowId as string,
      intakeRequestId: clientRequestId,
      draft: blankIntakeDraft(clientRequestId),
    };
  }

  const first = ensure(null, null);
  assert.equal(shouldRunIntakeExtraction(first.draft), true);
  const retry = ensure({ id: first.id, intakeRequestId: clientRequestId }, { id: first.id });
  assert.equal(retry.id, first.id);
  assert.equal(created.length, 1);

  const filled = draftFromIntakeExtraction({
    userMessage: INDUSTRIES_INTAKE,
    extraction: emptyInitialWorkflowExtraction(),
    intakeRequestId: clientRequestId,
    createId: () => crypto.randomUUID(),
  });
  assert.equal(shouldRunIntakeExtraction(filled), false);
  const afterSuccess = resolveIntakeRecord({
    clientRequestId,
    remembered: { id: first.id, intakeRequestId: clientRequestId },
    foundByRequestId: { id: first.id },
  });
  assert.equal(afterSuccess.shouldCreate, false);
  assert.equal(afterSuccess.workflowId, first.id);
});

test("parseWizardStep defaults to items", () => {
  assert.equal(parseWizardStep("items"), "items");
  assert.equal(parseWizardStep("recipient"), "recipient");
  assert.equal(parseWizardStep("nope"), "items");
  assert.equal(parseWizardStep(undefined), "items");
});

const HOURS_INSPECTOR_INTAKE =
  "קבלת דוח שעות עובדים ואישור מפקח האתר וחשבוניות מס מגעש תעשיות מתכת";

test("lumped inspector-and-invoices extraction is sanitized into three atomic items", () => {
  const lumped = emptyInitialWorkflowExtraction();
  lumped.collectionItems = [
    { label: "דוח שעות עובדים", sourcePhrase: "דוח שעות עובדים" },
    {
      label: "אישור מפקח האתר וחשבוניות מס מגעש תעשיות מתכת",
      sourcePhrase: "אישור מפקח האתר וחשבוניות מס מגעש תעשיות מתכת",
    },
  ];
  lumped.recipient.organizationName = "מגעש תעשיות מתכת";
  lumped.recipient.organizationSourcePhrase = "מגעש תעשיות מתכת";
  assert.equal(validateAtomicExtraction(HOURS_INSPECTOR_INTAKE, lumped).ok, false);

  const sanitized = sanitizeInitialExtraction(HOURS_INSPECTOR_INTAKE, lumped);
  assert.deepEqual(
    sanitized.collectionItems.map((item) => item.label),
    ["דוח שעות עובדים", "אישור מפקח האתר", "חשבוניות מס"],
  );
  assert.equal(sanitized.recipient.organizationName, "געש תעשיות מתכת");
  assert.equal(validateAtomicExtraction(HOURS_INSPECTOR_INTAKE, sanitized).ok, true);
});

test("hours inspector intake draft has three unconfigured fields and lists them in the email", () => {
  let nextId = 0;
  const lumped = emptyInitialWorkflowExtraction();
  lumped.collectionItems = [
    { label: "דוח שעות עובדים", sourcePhrase: "דוח שעות עובדים" },
    {
      label: "אישור מפקח האתר וחשבוניות מס מגעש תעשיות מתכת",
      sourcePhrase: "אישור מפקח האתר וחשבוניות מס מגעש תעשיות מתכת",
    },
  ];
  const draft = draftFromIntakeExtraction({
    userMessage: HOURS_INSPECTOR_INTAKE,
    extraction: lumped,
    intakeRequestId: "33333333-3333-4333-8333-333333333333",
    createId: () => {
      nextId += 1;
      return `field-${nextId}`;
    },
  });
  assert.deepEqual(
    draft.fields.map((field) => ({ label: field.label, type: field.type })),
    [
      { label: "דוח שעות עובדים", type: "unconfigured" },
      { label: "אישור מפקח האתר", type: "unconfigured" },
      { label: "חשבוניות מס", type: "unconfigured" },
    ],
  );
  assert.equal(getDraftRecipient(draft).organizationName, "געש תעשיות מתכת");
  assert.equal(draft.email.subject, "בקשה למסמכים");
  assert.equal(draft.email.body.includes("דוח שעות עובדים"), true);
  assert.equal(draft.email.body.includes("אישור מפקח האתר"), true);
  assert.equal(draft.email.body.includes("חשבוניות מס"), true);
  assert.equal(draft.email.body.includes("אישור מפקח האתר וחשבוניות"), false);
  assert.equal(draft.email.body.includes("מגעש תעשיות מתכת"), false);
});
