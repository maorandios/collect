import assert from "node:assert/strict";
import { test } from "node:test";

import { emptyWorkflowDraft } from "./draft-schema";
import { buildFieldFromEditor, validateFieldEditor } from "./field-editor";
import { applySetupUserTurn, startSetup } from "./setup-agent";

test("opening a field editor without save does not create a placeholder", () => {
  assert.equal(validateFieldEditor({ type: "short_text", label: "", required: true }), "יש להזין תווית לשדה.");
});

test("adding a text field requires a label and does not use טרם הוגדר", () => {
  const error = validateFieldEditor({ type: "short_text", label: "הערות", required: false });
  assert.equal(error, null);
  const field = buildFieldFromEditor({ type: "short_text", label: "הערות", required: false }, "pending");
  assert.equal(field.label, "הערות");
  assert.equal(field.label.includes("טרם הוגדר"), false);
});

test("adding a file field keeps the chosen preset", () => {
  const field = buildFieldFromEditor(
    { type: "file", label: "חשבונית", required: true, filePreset: "pdf" },
    "pending",
  );
  assert.equal(field.type, "file");
  if (field.type === "file") {
    assert.deepEqual(field.allowedMimeTypes, ["application/pdf"]);
  }
});

test("first setup turn extracts two items and asks one question", () => {
  const started = startSetup(0, emptyWorkflowDraft());
  const result = applySetupUserTurn({
    current: started,
    userMessage: "איסוף חשבוניות ואישור פיקוח על ביצוע הצביעה",
  });
  assert.equal(result.setup.requirements.length, 2);
  assert.equal(result.setup.nextQuestion ? 1 : 0, 1);
  assert.equal(result.setup.status, "collecting");
  assert.match(result.assistantMessage, /חשבונ/);
  assert.match(result.assistantMessage, /אישור/);
  assert.equal(result.assistantMessage.includes("ומה כתובת"), false);
});

test("a later turn still exposes only one next question", () => {
  const started = startSetup(0, emptyWorkflowDraft());
  const first = applySetupUserTurn({
    current: started,
    userMessage: "חשבונית ואישור פיקוח",
  });
  const second = applySetupUserTurn({
    current: first.setup,
    userMessage: "העלאת קובץ",
  });
  assert.equal(second.setup.requirements.every((item) => item.kind !== "ambiguous"), true);
  assert.equal(second.setup.nextQuestion?.step, "recipient");
  assert.equal(second.setup.nextQuestion ? 1 : 0, 1);
});
