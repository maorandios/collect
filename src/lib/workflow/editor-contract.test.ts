import assert from "node:assert/strict";
import { test } from "node:test";

import { he } from "@/lib/i18n/he";
import {
  activateGuard,
  draftSaveRowPatch,
  parseEditorJson,
  publishedRowFromEditor,
  publishChangesGuard,
  requirePublishedEditorJson,
} from "./editor-contract";
import { activationPlan, publishActionForStatus, publishChangesPlan } from "./lifecycle";
import { editorDefinitionSource } from "./normalize";
import { roniExampleWorkflow } from "./example";
import type { WorkflowDefinition } from "./schema";

const tz = "Asia/Jerusalem" as const;
const mailboxId = "11111111-1111-1111-1111-111111111111";
const userId = "22222222-2222-2222-2222-222222222222";

const weekly: WorkflowDefinition = {
  ...roniExampleWorkflow,
  schedule: { type: "weekly", weekday: 1, time: "10:00", timezone: tz },
};

test("existing JSON editor still saves a draft without touching the published definition", () => {
  const parsed = parseEditorJson(JSON.stringify(roniExampleWorkflow));
  assert.equal(parsed.ok, true);
  if (!parsed.ok) {
    return;
  }

  const created = draftSaveRowPatch({
    existing: null,
    draft: parsed.draft,
    mailboxId,
    userId,
  });
  assert.equal(created.definition, null);
  assert.equal(created.status, "draft");
  assert.equal(created.next_run_at, null);
  assert.deepEqual(created.draft_definition.schedule, { type: "send_now" });

  const activeSave = draftSaveRowPatch({
    existing: {
      status: "active",
      name: "פעיל",
      draft_revision: 4,
    },
    draft: weekly,
    mailboxId,
    userId,
  });
  const activeKeys = Object.keys(activeSave);
  assert.equal(activeKeys.includes("definition"), false);
  assert.equal(activeKeys.includes("status"), false);
  assert.equal(activeKeys.includes("next_run_at"), false);
  assert.equal(activeSave.draft_revision, 5);
});

test("activating send_now still dispatches and completes", () => {
  const parsed = requirePublishedEditorJson(JSON.stringify(roniExampleWorkflow));
  assert.equal(parsed.ok, true);
  if (!parsed.ok) {
    return;
  }
  assert.equal(activateGuard("draft").ok, true);
  const plan = activationPlan(parsed.definition);
  assert.equal(plan.dispatchNow, true);
  assert.equal(plan.completeAfterDispatch, true);
  assert.equal(plan.nextRunAt, null);
});

test("publishing once weekly and monthly copies draft to definition without sending", () => {
  for (const schedule of [
    { type: "once" as const, date: "2026-08-20", time: "09:30", timezone: tz },
    { type: "weekly" as const, weekday: 1, time: "10:00", timezone: tz },
    { type: "monthly" as const, day: 1, time: "10:00", timezone: tz },
  ]) {
    const definition = { ...roniExampleWorkflow, schedule };
    const plan = activationPlan(definition, new Date("2026-08-18T06:00:00.000Z"));
    assert.equal(plan.dispatchNow, false, schedule.type);
    assert.equal(plan.completeAfterDispatch, false, schedule.type);
    assert.equal(plan.missingNextRun, false, schedule.type);
    const row = publishedRowFromEditor({
      definition,
      mailboxId,
      status: plan.status,
      nextRunAt: plan.nextRunAt,
    });
    assert.deepEqual(row.definition.schedule, schedule);
    assert.deepEqual(row.draft_definition.schedule, schedule);
    assert.equal(row.status, "active");
  }
});

test("applying a change on active does not send and keeps next_run_at when the schedule is unchanged", () => {
  const nextRun = "2026-08-24T07:00:00.000Z";
  const plan = publishChangesPlan({
    status: "active",
    previousSchedule: weekly.schedule,
    nextSchedule: weekly.schedule,
    currentNextRunAt: nextRun,
  });
  assert.equal(plan.dispatchNow, false);
  assert.equal(plan.resume, false);
  assert.equal(plan.status, "active");
  assert.equal(plan.nextRunAt?.toISOString(), nextRun);
});

test("applying a change on paused does not resume or send", () => {
  const nextRun = "2026-08-24T07:00:00.000Z";
  const plan = publishChangesPlan({
    status: "paused",
    previousSchedule: weekly.schedule,
    nextSchedule: { type: "weekly", weekday: 2, time: "11:00", timezone: tz },
    currentNextRunAt: nextRun,
    now: new Date("2026-08-18T09:00:00.000Z"),
  });
  assert.equal(plan.dispatchNow, false);
  assert.equal(plan.resume, false);
  assert.equal(plan.status, "paused");
  assert.notEqual(plan.nextRunAt?.toISOString(), nextRun);
});

test("completed cannot be activated or have changes applied", () => {
  const activateBlocked = activateGuard("completed");
  const publishBlocked = publishChangesGuard("completed");
  assert.equal(activateBlocked.ok, false);
  assert.equal(publishBlocked.ok, false);
  if (!activateBlocked.ok) {
    assert.equal(activateBlocked.message, he.errors.cannotChangeCompleted);
  }
  assert.equal(publishActionForStatus("completed"), "none");
  assert.equal(publishActionForStatus("draft"), "activate");
  assert.equal(publishActionForStatus("active"), "publishChanges");
  assert.equal(publishActionForStatus("paused"), "publishChanges");
});

test("activate is refused for active and paused processes", () => {
  assert.equal(activateGuard("active").ok, false);
  assert.equal(activateGuard("paused").ok, false);
  assert.equal(publishChangesGuard("draft").ok, false);
  assert.equal(publishChangesGuard("active").ok, true);
});

test("editor loads draft_definition and falls back to definition", () => {
  assert.deepEqual(editorDefinitionSource({ name: "טיוטה" }, { name: "פורסם" }), { name: "טיוטה" });
  assert.deepEqual(editorDefinitionSource(null, roniExampleWorkflow), roniExampleWorkflow);
});
