import assert from "node:assert/strict";
import { test } from "node:test";

import { he } from "@/lib/i18n/he";
import { draftFromRecord, type ChatTurnStore, type ChatWorkflowRecord, type StoredChatMessage } from "./chat-types";
import { runWorkflowChatTurn } from "./chat-turn";
import { emptySetupExtraction, type SetupExtraction } from "./setup-extraction";
import { emptyWorkflowDraft, type WorkflowDraftDefinition } from "./draft-schema";
import { emptySetupState, type WorkflowSetupState } from "./setup-state";

const userId = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const turnId = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const otherTurn = "cccccccc-cccc-4ccc-8ccc-cccccccccccc";

function stubExtraction(overrides: Partial<SetupExtraction> = {}): SetupExtraction {
  return {
    ...emptySetupExtraction(),
    ...overrides,
  };
}

class MemoryStore implements ChatTurnStore {
  workflows = new Map<string, ChatWorkflowRecord>();
  messages: (StoredChatMessage & { workflow_id: string; user_id: string })[] = [];
  extractCalls = 0;
  nextId = 1;

  async createDraft(ownerId: string) {
    const id = `00000000-0000-4000-8000-00000000000${this.nextId}`;
    this.nextId += 1;
    const record: ChatWorkflowRecord = {
      id,
      status: "draft",
      draft_definition: emptyWorkflowDraft(),
      definition: null,
      draft_revision: 0,
      setup_revision: 0,
      deleted_at: null,
    };
    this.workflows.set(`${ownerId}:${id}`, record);
    return record;
  }

  async getOwned(workflowId: string, ownerId: string) {
    return this.workflows.get(`${ownerId}:${workflowId}`) ?? null;
  }

  async findMessage(workflowId: string, clientTurnId: string, role: StoredChatMessage["role"]) {
    return (
      this.messages.find(
        (item) =>
          item.workflow_id === workflowId && item.client_turn_id === clientTurnId && item.role === role,
      ) ?? null
    );
  }

  async insertMessage(input: {
    workflowId: string;
    userId: string;
    clientTurnId: string;
    role: StoredChatMessage["role"];
    content: string;
  }) {
    const exists = this.messages.some(
      (item) =>
        item.workflow_id === input.workflowId &&
        item.client_turn_id === input.clientTurnId &&
        item.role === input.role,
    );
    if (exists) {
      return;
    }
    this.messages.push({
      workflow_id: input.workflowId,
      user_id: input.userId,
      client_turn_id: input.clientTurnId,
      role: input.role,
      content: input.content,
    });
  }

  async listRecent(workflowId: string) {
    return this.messages.filter((item) => item.workflow_id === workflowId);
  }

  async applyTurn(input: {
    workflowId: string;
    userId: string;
    expectedRevision: number;
    draft: WorkflowDraftDefinition;
    clientTurnId: string;
    assistantContent: string;
  }) {
    const record = this.workflows.get(`${input.userId}:${input.workflowId}`);
    if (!record) {
      throw new Error("not_found");
    }
    if (record.draft_revision !== input.expectedRevision) {
      throw new Error("revision_conflict");
    }
    record.draft_definition = input.draft;
    record.draft_revision += 1;
    await this.insertMessage({
      workflowId: input.workflowId,
      userId: input.userId,
      clientTurnId: input.clientTurnId,
      role: "assistant",
      content: input.assistantContent,
    });
    return { newRevision: record.draft_revision };
  }

  async applySetupTurn(input: {
    workflowId: string;
    userId: string;
    expectedDraftRevision: number;
    expectedSetupRevision: number;
    setup: import("./setup-state").WorkflowSetupState;
    clientTurnId: string;
    assistantContent: string;
  }) {
    const record = this.workflows.get(`${input.userId}:${input.workflowId}`);
    if (!record) {
      throw new Error("not_found");
    }
    if (record.status === "completed") {
      throw new Error("completed");
    }
    const existing = await this.findMessage(input.workflowId, input.clientTurnId, "assistant");
    if (existing) {
      return { draftRevision: record.draft_revision, setupRevision: record.setup_revision };
    }
    if (record.draft_revision !== input.expectedDraftRevision) {
      throw new Error("revision_conflict");
    }
    if (record.setup_revision !== input.expectedSetupRevision) {
      throw new Error("revision_conflict");
    }
    record.setup_state = input.setup;
    record.setup_revision += 1;
    await this.insertMessage({
      workflowId: input.workflowId,
      userId: input.userId,
      clientTurnId: input.clientTurnId,
      role: "assistant",
      content: input.assistantContent,
    });
    return { draftRevision: record.draft_revision, setupRevision: record.setup_revision };
  }

  async applySetupProposal(input: {
    workflowId: string;
    userId: string;
    expectedDraftRevision: number;
    expectedSetupRevision: number;
    setup?: import("./setup-state").WorkflowSetupState;
  }) {
    const record = this.workflows.get(`${input.userId}:${input.workflowId}`);
    if (!record) {
      throw new Error("not_found");
    }
    if (record.status === "completed") {
      throw new Error("completed");
    }
    if (record.draft_revision !== input.expectedDraftRevision) {
      throw new Error("revision_conflict");
    }
    if (record.setup_revision !== input.expectedSetupRevision) {
      throw new Error("revision_conflict");
    }
    const setup = (record.setup_state as import("./setup-state").WorkflowSetupState | undefined) ?? input.setup;
    if (!setup || setup.status !== "review") {
      throw new Error("not_review");
    }
    if (setup.baseDraftRevision !== record.draft_revision) {
      throw new Error("setup_conflict");
    }
    record.draft_definition = setup.proposal;
    record.draft_revision += 1;
    record.setup_revision += 1;
    record.setup_state = { ...setup, status: "completed" };
    return { newRevision: record.draft_revision, setupRevision: record.setup_revision, draft: setup.proposal };
  }

  async applyEdit(input: {
    workflowId: string;
    userId: string;
    expectedRevision: number;
    draft: WorkflowDraftDefinition;
  }) {
    const record = this.workflows.get(`${input.userId}:${input.workflowId}`);
    if (!record) {
      throw new Error("not_found");
    }
    if (record.draft_revision !== input.expectedRevision) {
      throw new Error("revision_conflict");
    }
    record.draft_definition = input.draft;
    record.draft_revision += 1;
    return { newRevision: record.draft_revision };
  }
}

async function run(
  store: MemoryStore,
  body: unknown,
  extract: () => Promise<SetupExtraction> | SetupExtraction = () => stubExtraction(),
) {
  return runWorkflowChatTurn({
    userId,
    body,
    store,
    compiler: {
      extract: async () => {
        store.extractCalls += 1;
        return {
          extraction: await extract(),
          usage: { model: "gpt-5.6-luna", latencyMs: 12, inputTokens: 800, outputTokens: 120, fallback: false },
        };
      },
      extractChange: async () => {
        store.extractCalls += 1;
        throw new Error("should not extract change");
      },
      interpretAnswer: async () => {
        store.extractCalls += 1;
        throw new Error("should not interpret answer");
      },
    },
    mailboxId: "11111111-1111-4111-8111-111111111111",
    mailboxEmail: "office@example.com",
  });
}

test("a Hebrew message becomes a structured draft and creates the workflow first", async () => {
  const store = new MemoryStore();
  const result = await run(store, {
    message: "שלח לרוני בקשה לסיכום העבודה",
    clientTurnId: turnId,
    expectedRevision: 0,
  }, () => stubExtraction());

  assert.equal(result.status, 200);
  assert.ok(result.body.workflowId);
  assert.equal(result.body.draft?.name, "");
  assert.equal(result.body.revision, 0);
  assert.equal(result.body.setupState?.proposal.recipients[0]?.name, "רוני");
  assert.equal(result.body.setupState?.proposal.recipients[0]?.email, "");
  assert.equal(result.body.setupRevision, 1);
  assert.equal(result.body.aiUsed, true);
  assert.equal(result.body.aiUsage?.model, "gpt-5.6-luna");
  assert.equal(result.body.nextQuestion ? 1 : 0, 1);
  assert.equal(result.body.readyToPublish, false);
  assert.equal(store.messages[0]?.role, "user");
  assert.equal(store.messages[1]?.role, "assistant");
  assert.equal(store.extractCalls, 1);
});

test("retrying the same clientTurnId does not call the model again", async () => {
  const store = new MemoryStore();
  const body = {
    message: "שלח לרוני בקשה לסיכום העבודה",
    clientTurnId: turnId,
    expectedRevision: 0,
  };
  const first = await run(store, body, () => stubExtraction());
  const second = await run(
    store,
    { ...body, workflowId: first.body.workflowId, expectedRevision: 0 },
    () => {
      throw new Error("should not compile");
    },
  );
  assert.equal(second.status, 200);
  assert.equal(second.body.assistantMessage, first.body.assistantMessage);
  assert.equal(second.body.setupRevision, first.body.setupRevision);
  assert.equal(store.extractCalls, 1);
  assert.equal(store.messages.filter((item) => item.role === "assistant").length, 1);
});

test("an AI failure stores an error and leaves the draft unchanged", async () => {
  const store = new MemoryStore();
  const created = await store.createDraft(userId);
  const result = await run(store, {
    workflowId: created.id,
    message: "שלח לרוני בקשה",
    clientTurnId: turnId,
    expectedRevision: 0,
  }, async () => {
    throw new Error("openai_down");
  });
  assert.equal(result.status, 502);
  assert.equal(result.body.revision, 0);
  assert.deepEqual(result.body.draft?.fields, []);
  assert.equal(store.messages.some((item) => item.role === "error"), true);
  assert.equal(store.messages.some((item) => item.role === "assistant"), false);
});

test("a stale revision returns 409 before calling the model", async () => {
  const store = new MemoryStore();
  const created = await store.createDraft(userId);
  created.draft_revision = 4;
  const result = await run(store, {
    workflowId: created.id,
    message: "עדכון",
    clientTurnId: turnId,
    expectedRevision: 0,
  }, () => stubExtraction());
  assert.equal(result.status, 409);
  assert.equal(result.body.message, he.workflows.revisionConflict);
  assert.equal(store.extractCalls, 0);
});

test("a stale setup revision returns 409 with the latest setup", async () => {
  const store = new MemoryStore();
  const first = await run(store, {
    message: "שלח לרוני בקשה לסיכום העבודה",
    clientTurnId: turnId,
    expectedRevision: 0,
    expectedSetupRevision: 0,
  }, () => stubExtraction());
  assert.equal(first.status, 200);
  assert.equal(first.body.setupRevision, 1);
  const second = await run(store, {
    workflowId: first.body.workflowId,
    message: "עדכון ישן",
    clientTurnId: otherTurn,
    expectedRevision: 0,
    expectedSetupRevision: 0,
  }, () => stubExtraction());
  assert.equal(second.status, 409);
  assert.equal(second.body.message, he.workflows.revisionConflict);
  assert.equal(second.body.setupRevision, 1);
  assert.equal(second.body.setupState?.proposal.name, first.body.setupState?.proposal.name);
  assert.equal(store.extractCalls, 1);
});

test("completed workflows cannot be edited through chat", async () => {
  const store = new MemoryStore();
  const created = await store.createDraft(userId);
  created.status = "completed";
  const result = await run(store, {
    workflowId: created.id,
    message: "עדכון",
    clientTurnId: otherTurn,
    expectedRevision: 0,
  }, () => stubExtraction());
  assert.equal(result.status, 409);
  assert.equal(store.extractCalls, 0);
});

test("first turn keeps monthly day 25, second adds email, third adds time and becomes publishable", async () => {
  const store = new MemoryStore();
  const first = await run(store, {
    message: "בכל 25 בחודש שלח לרוני בקשה לסיכום",
    clientTurnId: turnId,
    expectedRevision: 0,
  });
  assert.equal(first.body.draft?.schedule, undefined);
  assert.equal(first.body.setupState?.proposal.schedule?.type, "monthly");
  if (first.body.setupState?.proposal.schedule?.type === "monthly") {
    assert.equal(first.body.setupState.proposal.schedule.day, 25);
  }
  assert.equal(first.body.setupState?.proposal.recipients[0]?.email, "");
  assert.equal(first.body.nextQuestions?.length, 1);
  assert.equal(first.body.setupRevision, 1);
  assert.equal(store.extractCalls, 1);

  const second = await run(store, {
    workflowId: first.body.workflowId,
    message: "המייל של רוני הוא roni@example.com",
    clientTurnId: otherTurn,
    expectedRevision: 0,
    expectedSetupRevision: 1,
  });
  assert.equal(second.status, 200);
  assert.equal(second.body.draft?.schedule, undefined);
  assert.equal(second.body.revision, 0);
  assert.equal(second.body.setupRevision, 2);
  assert.equal(second.body.aiUsed, false);
  assert.equal(second.body.aiUsage?.inputTokens, 0);
  assert.equal(second.body.setupState?.proposal.schedule?.type, "monthly");
  if (second.body.setupState?.proposal.schedule?.type === "monthly") {
    assert.equal(second.body.setupState.proposal.schedule.day, 25);
    assert.equal(second.body.setupState.proposal.schedule.time, null);
  }
  assert.equal(second.body.setupState?.proposal.recipients[0]?.email, "roni@example.com");
  assert.equal(second.body.nextQuestions?.length, 1);
  assert.equal(store.extractCalls, 1);

  const thirdTurn = "dddddddd-dddd-4ddd-8ddd-dddddddddddd";
  const third = await run(store, {
    workflowId: first.body.workflowId,
    message: "09:00",
    clientTurnId: thirdTurn,
    expectedRevision: 0,
    expectedSetupRevision: 2,
  });
  assert.equal(third.status, 200);
  assert.equal(third.body.revision, 0);
  assert.equal(third.body.aiUsed, false);
  if (third.body.setupState?.proposal.schedule?.type === "monthly") {
    assert.equal(third.body.setupState.proposal.schedule.day, 25);
    assert.equal(third.body.setupState.proposal.schedule.time, "09:00");
  }
  assert.equal(store.extractCalls, 1);
});

test("assistant message does not claim a schedule that is missing from the draft", async () => {
  const store = new MemoryStore();
  const result = await run(store, {
    message: "אסוף סיכום מרוני",
    clientTurnId: turnId,
    expectedRevision: 0,
  }, () => stubExtraction({
    scheduleType: "none",
  }));
  assert.equal(result.body.draft?.schedule, undefined);
  assert.equal(result.body.setupState?.proposal.schedule, undefined);
});

test("disconnected Gmail is a connection blocker and is not asked in the assistant message", async () => {
  const store = new MemoryStore();
  const result = await runWorkflowChatTurn({
    userId,
    body: {
      message: "בכל 25 בחודש שלח לרוני",
      clientTurnId: turnId,
      expectedRevision: 0,
    },
    store,
    compiler: {
      extract: async () => ({
        extraction: stubExtraction({ scheduleType: "monthly", scheduleDay: 25, recipientName: "רוני" }),
        usage: { model: "gpt-5.6-luna", latencyMs: 8, inputTokens: 400, outputTokens: 80, fallback: false },
      }),
      extractChange: async () => {
        throw new Error("should not extract change");
      },
      interpretAnswer: async () => {
        throw new Error("should not interpret answer");
      },
    },
    mailboxId: null,
    mailboxEmail: null,
  });
  assert.equal(result.status, 200);
  assert.equal(result.body.blockers?.includes(he.studio.gmailDisconnected), true);
  assert.equal(result.body.blockers?.includes(he.errors.gmailRequired), false);
  assert.equal(result.body.externalIssues?.some((issue) => issue.key === "gmail_disconnected"), true);
  assert.equal(result.body.conversationIssues?.some((issue) => issue.category === "mailbox"), false);
  assert.equal(/Gmail/.test(result.body.assistantMessage ?? ""), false);
  assert.equal(result.body.readyToPublish, false);
});

test("a second turn with email and time completes conversation issues without a new recipient", async () => {
  const store = new MemoryStore();
  const first = await run(store, {
    message: "בכל 25 בחודש שלח לרוני בקשה לסיכום עבודה וחשבונית PDF",
    clientTurnId: turnId,
    expectedRevision: 0,
  });
  assert.equal(first.body.draftComplete, false);
  assert.equal(first.body.nextQuestions?.length, 1);
  assert.equal(first.body.nextQuestions?.[0]?.answerType, "email");
  assert.equal(store.extractCalls, 1);

  const second = await run(store, {
    workflowId: first.body.workflowId,
    message: "roni@example.com בשעה 09:00",
    clientTurnId: otherTurn,
    expectedRevision: 0,
    expectedSetupRevision: 1,
  });
  assert.equal(second.body.draft?.recipients.length, 0);
  assert.equal(second.body.setupState?.proposal.recipients.length, 1);
  assert.equal(second.body.setupState?.proposal.recipients[0]?.email, "roni@example.com");
  if (second.body.setupState?.proposal.schedule?.type === "monthly") {
    assert.equal(second.body.setupState.proposal.schedule.day, 25);
    assert.equal(second.body.setupState.proposal.schedule.time, null);
  }
  assert.equal(second.body.aiUsed, false);
  assert.equal(second.body.aiUsage?.inputTokens, 0);
  assert.equal(store.extractCalls, 1);
});

test("applySetupProposal copies the proposal into draft_definition once", async () => {
  const store = new MemoryStore();
  const record = await store.createDraft(userId);
  const proposal = {
    ...emptyWorkflowDraft(),
    name: "איסוף חשבוניות",
    recipients: [{ name: "דוד קידוחים בע״מ", email: "support@example.com" }],
    schedule: { type: "monthly" as const, day: 20, time: "09:00", timezone: "Asia/Jerusalem" },
    fields: [
      {
        id: "11111111-1111-4111-8111-111111111111",
        type: "file" as const,
        label: "חשבונית",
        required: true,
        helpText: null,
        allowedMimeTypes: ["application/pdf"],
        maxFiles: 1,
        maxFileSizeMb: 10,
      },
      {
        id: "22222222-2222-4222-8222-222222222222",
        type: "file" as const,
        label: "אישור פיקוח על ביצוע הצביעה",
        required: true,
        helpText: null,
        allowedMimeTypes: ["application/pdf"],
        maxFiles: 1,
        maxFileSizeMb: 10,
      },
    ],
  };
  record.setup_state = {
    status: "review",
    baseDraftRevision: 0,
    proposal,
    requirements: [],
    completedSteps: ["review"],
    currentStep: "review",
    nextQuestion: null,
    reminderDecision: "enabled",
    conflict: false,
    updatedAt: new Date().toISOString(),
  };
  const before = draftFromRecord(record);
  assert.equal(before.fields.length, 0);
  const applied = await store.applySetupProposal({
    workflowId: record.id,
    userId,
    expectedDraftRevision: 0,
    expectedSetupRevision: 0,
  });
  assert.equal(applied.newRevision, 1);
  assert.equal(applied.setupRevision, 1);
  assert.equal(applied.draft.fields.length, 2);
  const latest = await store.getOwned(record.id, userId);
  assert.equal(latest?.draft_revision, 1);
  assert.equal(latest?.setup_revision, 1);
  assert.equal(draftFromRecord(latest!).fields.length, 2);
});

function collectingSetup(label: string): WorkflowSetupState {
  return emptySetupState(0, { ...emptyWorkflowDraft(), name: label });
}

test("two setup turns with the same setup revision — only one succeeds", async () => {
  const store = new MemoryStore();
  const record = await store.createDraft(userId);
  const first = await store.applySetupTurn({
    workflowId: record.id,
    userId,
    expectedDraftRevision: 0,
    expectedSetupRevision: 0,
    setup: collectingSetup("first"),
    clientTurnId: turnId,
    assistantContent: "first",
  });
  assert.equal(first.setupRevision, 1);
  await assert.rejects(
    () =>
      store.applySetupTurn({
        workflowId: record.id,
        userId,
        expectedDraftRevision: 0,
        expectedSetupRevision: 0,
        setup: collectingSetup("second"),
        clientTurnId: otherTurn,
        assistantContent: "second",
      }),
    { message: "revision_conflict" },
  );
  const latest = await store.getOwned(record.id, userId);
  assert.equal(latest?.setup_revision, 1);
  assert.equal((latest?.setup_state as WorkflowSetupState).proposal.name, "first");
});

test("retry of the same clientTurnId does not change setup state or revision", async () => {
  const store = new MemoryStore();
  const record = await store.createDraft(userId);
  await store.applySetupTurn({
    workflowId: record.id,
    userId,
    expectedDraftRevision: 0,
    expectedSetupRevision: 0,
    setup: collectingSetup("original"),
    clientTurnId: turnId,
    assistantContent: "original",
  });
  const retried = await store.applySetupTurn({
    workflowId: record.id,
    userId,
    expectedDraftRevision: 0,
    expectedSetupRevision: 0,
    setup: collectingSetup("overwrite"),
    clientTurnId: turnId,
    assistantContent: "overwrite",
  });
  assert.equal(retried.draftRevision, 0);
  assert.equal(retried.setupRevision, 1);
  const latest = await store.getOwned(record.id, userId);
  assert.equal(latest?.setup_revision, 1);
  assert.equal((latest?.setup_state as WorkflowSetupState).proposal.name, "original");
  assert.equal(store.messages.filter((item) => item.role === "assistant").length, 1);
});

test("a stale setup turn does not overwrite a newer turn", async () => {
  const store = new MemoryStore();
  const record = await store.createDraft(userId);
  await store.applySetupTurn({
    workflowId: record.id,
    userId,
    expectedDraftRevision: 0,
    expectedSetupRevision: 0,
    setup: collectingSetup("older"),
    clientTurnId: turnId,
    assistantContent: "older",
  });
  await store.applySetupTurn({
    workflowId: record.id,
    userId,
    expectedDraftRevision: 0,
    expectedSetupRevision: 1,
    setup: collectingSetup("newer"),
    clientTurnId: otherTurn,
    assistantContent: "newer",
  });
  await assert.rejects(
    () =>
      store.applySetupTurn({
        workflowId: record.id,
        userId,
        expectedDraftRevision: 0,
        expectedSetupRevision: 0,
        setup: collectingSetup("stale"),
        clientTurnId: "dddddddd-dddd-4ddd-8ddd-dddddddddddd",
        assistantContent: "stale",
      }),
    { message: "revision_conflict" },
  );
  const latest = await store.getOwned(record.id, userId);
  assert.equal(latest?.setup_revision, 2);
  assert.equal((latest?.setup_state as WorkflowSetupState).proposal.name, "newer");
});

test("a manual draft edit that bumps draft revision invalidates an old proposal", async () => {
  const store = new MemoryStore();
  const record = await store.createDraft(userId);
  const proposal = { ...emptyWorkflowDraft(), name: "Proposal ישן" };
  record.setup_state = {
    status: "review",
    baseDraftRevision: 0,
    proposal,
    requirements: [],
    completedSteps: ["review"],
    currentStep: "review",
    nextQuestion: null,
    reminderDecision: "enabled",
    conflict: false,
    updatedAt: new Date().toISOString(),
  };
  await store.applyEdit({
    workflowId: record.id,
    userId,
    expectedRevision: 0,
    draft: { ...emptyWorkflowDraft(), name: "עריכה ידנית" },
  });
  assert.equal(record.draft_revision, 1);
  await assert.rejects(
    () =>
      store.applySetupProposal({
        workflowId: record.id,
        userId,
        expectedDraftRevision: 0,
        expectedSetupRevision: 0,
      }),
    { message: "revision_conflict" },
  );
  await assert.rejects(
    () =>
      store.applySetupProposal({
        workflowId: record.id,
        userId,
        expectedDraftRevision: 1,
        expectedSetupRevision: 0,
      }),
    { message: "setup_conflict" },
  );
  const latest = await store.getOwned(record.id, userId);
  assert.equal(latest?.draft_revision, 1);
  assert.equal(draftFromRecord(latest!).name, "עריכה ידנית");
  assert.equal((latest?.setup_state as WorkflowSetupState).status, "review");
});

test("applying a setup proposal succeeds only once", async () => {
  const store = new MemoryStore();
  const record = await store.createDraft(userId);
  record.setup_state = {
    status: "review",
    baseDraftRevision: 0,
    proposal: { ...emptyWorkflowDraft(), name: "איסוף" },
    requirements: [],
    completedSteps: ["review"],
    currentStep: "review",
    nextQuestion: null,
    reminderDecision: "enabled",
    conflict: false,
    updatedAt: new Date().toISOString(),
  };
  const first = await store.applySetupProposal({
    workflowId: record.id,
    userId,
    expectedDraftRevision: 0,
    expectedSetupRevision: 0,
  });
  assert.equal(first.newRevision, 1);
  assert.equal(first.setupRevision, 1);
  await assert.rejects(
    () =>
      store.applySetupProposal({
        workflowId: record.id,
        userId,
        expectedDraftRevision: 1,
        expectedSetupRevision: 1,
      }),
    { message: "not_review" },
  );
  const latest = await store.getOwned(record.id, userId);
  assert.equal(latest?.draft_revision, 1);
  assert.equal(latest?.setup_revision, 1);
  assert.equal((latest?.setup_state as WorkflowSetupState).status, "completed");
});

test("a deterministic alias does not call Luna interpret", async () => {
  const store = new MemoryStore();
  const first = await run(
    store,
    {
      message: "חשבונית ואישור פיקוח",
      clientTurnId: turnId,
      expectedRevision: 0,
    },
    () =>
      stubExtraction({
        items: [
          { label: "חשבונית", kind: "file", filePreset: "pdf" },
          { label: "אישור פיקוח", kind: "ambiguous", filePreset: null },
        ],
      }),
  );
  assert.equal(store.extractCalls, 1);
  const second = await run(store, {
    workflowId: first.body.workflowId,
    message: "קבצים",
    clientTurnId: otherTurn,
    expectedRevision: 0,
    expectedSetupRevision: 1,
  });
  assert.equal(second.status, 200);
  assert.equal(second.body.aiUsed, false);
  assert.equal(second.body.aiUsage?.inputTokens, 0);
  assert.equal(store.extractCalls, 1);
  assert.equal(second.body.draft?.fields.length, 0);
  assert.equal(second.body.setupState?.proposal.fields.length, 2);
});

test("a quick-reply label uses the same chat route as typed text", async () => {
  const store = new MemoryStore();
  const first = await run(
    store,
    {
      message: "חשבונית ואישור פיקוח",
      clientTurnId: turnId,
      expectedRevision: 0,
    },
    () =>
      stubExtraction({
        items: [
          { label: "חשבונית", kind: "file", filePreset: "pdf" },
          { label: "אישור פיקוח", kind: "ambiguous", filePreset: null },
        ],
      }),
  );
  const second = await run(store, {
    workflowId: first.body.workflowId,
    message: he.studio.setup.fieldTypeFile,
    clientTurnId: otherTurn,
    expectedRevision: 0,
    expectedSetupRevision: 1,
  });
  assert.equal(second.status, 200);
  assert.equal(second.body.aiUsed, false);
  assert.equal(store.extractCalls, 1);
  assert.equal(second.body.setupState?.proposal.fields.some((field) => field.type === "file"), true);
});

test("Luna fallback understands a phrasing that is not an alias", async () => {
  const store = new MemoryStore();
  const first = await run(
    store,
    {
      message: "חשבונית ואישור פיקוח",
      clientTurnId: turnId,
      expectedRevision: 0,
    },
    () =>
      stubExtraction({
        items: [
          { label: "חשבונית", kind: "file", filePreset: "pdf" },
          { label: "אישור פיקוח", kind: "ambiguous", filePreset: null },
        ],
      }),
  );
  const second = await runWorkflowChatTurn({
    userId,
    body: {
      workflowId: first.body.workflowId,
      message: "בפורמט סרוק בבקשה",
      clientTurnId: otherTurn,
      expectedRevision: 0,
      expectedSetupRevision: 1,
    },
    store,
    compiler: {
      extract: async () => {
        throw new Error("should not extract");
      },
      extractChange: async () => {
        throw new Error("should not extract change");
      },
      interpretAnswer: async ({ userMessage }) => {
        store.extractCalls += 1;
        assert.equal(userMessage, "בפורמט סרוק בבקשה");
        return {
          interpretation: { understood: true, canonicalValue: "file", confidence: 0.91 },
          usage: { model: "gpt-5.6-luna", latencyMs: 18, inputTokens: 36, outputTokens: 10, fallback: false },
        };
      },
    },
    mailboxId: "11111111-1111-4111-8111-111111111111",
    mailboxEmail: "office@example.com",
  });
  assert.equal(second.status, 200);
  assert.equal(second.body.aiUsed, true);
  assert.equal(store.extractCalls, 2);
  assert.equal(second.body.setupState?.proposal.fields.length, 2);
  assert.equal(second.body.draft?.fields.length, 0);
});
