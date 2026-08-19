import assert from "node:assert/strict";
import { test } from "node:test";

import { zodTextFormat } from "openai/helpers/zod";

import { WorkflowCompilerResultSchema, parseWorkflowCompilerResult } from "./compiler-result";
import { setupAnswerInterpretationSchema, setupChangePatchSchema, setupExtractionSchema } from "./setup-extraction";

test("zodTextFormat builds a strict object schema for the compiler result", () => {
  const format = zodTextFormat(WorkflowCompilerResultSchema, "workflow_compiler_result");
  assert.equal(format.type, "json_schema");
  assert.equal(format.name, "workflow_compiler_result");
  assert.equal(format.strict, true);
  const schema = format.schema as { type?: string };
  assert.equal(schema.type, "object");
});

test("setup extraction, change patch, and answer interpretation stay structured outputs", () => {
  const extraction = zodTextFormat(setupExtractionSchema, "setup_extraction");
  const change = zodTextFormat(setupChangePatchSchema, "setup_change_patch");
  const interpret = zodTextFormat(setupAnswerInterpretationSchema, "setup_answer_interpretation");
  assert.equal(extraction.type, "json_schema");
  assert.equal(extraction.strict, true);
  assert.equal(change.type, "json_schema");
  assert.equal(change.strict, true);
  assert.equal(interpret.type, "json_schema");
  assert.equal(interpret.strict, true);
});

test("compiler result ignores a model-supplied ready flag", () => {
  const parsed = parseWorkflowCompilerResult({
    assistantMessage: "עדכנתי את הטיוטה",
    name: "סיכום",
    recipientMode: "fixed",
    recipients: [{ name: "רוני", email: null }],
    scheduleType: "send_now",
    scheduleDate: null,
    scheduleTime: null,
    scheduleWeekday: null,
    scheduleDay: null,
    emailSubject: "נושא",
    emailBody: "גוף",
    fields: [
      {
        id: null,
        type: "long_text",
        label: "סיכום",
        required: true,
        helpText: null,
        allowedMimeTypes: [],
        maxFiles: null,
        maxFileSizeMb: null,
      },
    ],
    removedFieldIds: [],
    reminderEnabled: false,
    reminderAfterHours: null,
    warnings: [],
    readyToPublish: true,
  });
  assert.equal(parsed.success, true);
  if (parsed.success) {
    assert.equal("readyToPublish" in parsed.data, false);
  }
});
