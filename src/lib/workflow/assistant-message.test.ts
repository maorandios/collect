import assert from "node:assert/strict";
import { test } from "node:test";

import { reconcileAssistantMessage } from "./assistant-message";
import { emptyWorkflowDraft } from "./draft-schema";

test("a contradictory monthly claim is replaced from the saved draft", () => {
  const draft = emptyWorkflowDraft();
  const message = reconcileAssistantMessage("הכנתי תהליך חודשי", draft);
  assert.equal(/חודשי/.test(message), false);
  assert.equal(/Gmail/.test(message), false);
});
