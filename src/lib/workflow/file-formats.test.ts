import assert from "node:assert/strict";
import { test } from "node:test";

import { he } from "@/lib/i18n/he";
import {
  ALL_SUPPORTED_FILE_MIME_TYPES,
  fileFormatLabel,
  resolvedAllowedMimeTypes,
  supportedFileMimeTypes,
} from "./file-formats";

test("new file fields use the canonical supported mime list without star-slash", () => {
  assert.equal(ALL_SUPPORTED_FILE_MIME_TYPES.includes("*/*" as never), false);
  assert.deepEqual(supportedFileMimeTypes(), [...ALL_SUPPORTED_FILE_MIME_TYPES]);
  assert.equal(fileFormatLabel([...ALL_SUPPORTED_FILE_MIME_TYPES]), he.studio.setup.formatAll);
  assert.equal(fileFormatLabel([]), he.studio.setup.formatAll);
  assert.deepEqual(resolvedAllowedMimeTypes([]), [...ALL_SUPPORTED_FILE_MIME_TYPES]);
  assert.deepEqual(resolvedAllowedMimeTypes(["application/pdf"]), ["application/pdf"]);
});
