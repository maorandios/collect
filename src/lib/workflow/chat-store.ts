import "server-only";

import { he } from "@/lib/i18n/he";
import { createAdminClient } from "@/lib/supabase/admin";
import { emptyWorkflowDraft } from "@/lib/workflow/draft-schema";
import { draftFromRecord, type ChatTurnStore, type ChatWorkflowRecord, type StoredChatMessage } from "@/lib/workflow/chat-types";
import { parseWorkflowSetupState } from "@/lib/workflow/setup-state";
import { materializeRecipientForRuntime } from "@/lib/workflow/setup-identity";

const WORKFLOW_COLUMNS =
  "id, status, draft_definition, definition, draft_revision, setup_revision, deleted_at, setup_state";
const WORKFLOW_COLUMNS_NO_SETUP_REV =
  "id, status, draft_definition, definition, draft_revision, deleted_at, setup_state";
const WORKFLOW_COLUMNS_MIN = "id, status, draft_definition, definition, draft_revision, deleted_at";

function asRecord(row: ChatWorkflowRecord): ChatWorkflowRecord {
  return {
    ...row,
    draft_revision: Number(row.draft_revision ?? 0),
    setup_revision: Number(row.setup_revision ?? 0),
    setup_state: row.setup_state ?? null,
  };
}

function missingColumn(error: { code?: string; message?: string } | null | undefined, column: string) {
  return Boolean(
    error &&
      (error.code === "42703" ||
        error.code === "PGRST204" ||
        new RegExp(column).test(String(error.message))),
  );
}

function missingSetupState(error: { code?: string; message?: string } | null | undefined) {
  return missingColumn(error, "setup_state");
}

function missingSetupRevision(error: { code?: string; message?: string } | null | undefined) {
  return missingColumn(error, "setup_revision");
}

function missingRpc(error: { code?: string; message?: string } | null | undefined, name: string) {
  return Boolean(
    error &&
      (error.code === "42883" ||
        error.code === "PGRST202" ||
        new RegExp(name).test(String(error.message)) ||
        /Could not find the function/.test(String(error.message))),
  );
}

function rpcError(error: { message?: string } | null | undefined) {
  const message = String(error?.message ?? "");
  if (message.includes("revision_conflict")) {
    return "revision_conflict";
  }
  if (message.includes("setup_conflict")) {
    return "setup_conflict";
  }
  if (message.includes("not_review")) {
    return "not_review";
  }
  if (message.includes("completed")) {
    return "completed";
  }
  if (message.includes("not_found")) {
    return "not_found";
  }
  return null;
}

export async function findOwnedByIntakeRequestId(
  userId: string,
  intakeRequestId: string,
  admin: ReturnType<typeof createAdminClient> = createAdminClient(),
): Promise<ChatWorkflowRecord | null> {
  const first = await admin
    .from("workflows")
    .select(WORKFLOW_COLUMNS)
    .eq("user_id", userId)
    .is("deleted_at", null)
    .contains("draft_definition", { intakeRequestId })
    .order("created_at", { ascending: true })
    .limit(1)
    .maybeSingle();
  if (!first.error) {
    return first.data ? asRecord(first.data as ChatWorkflowRecord) : null;
  }
  if (missingSetupRevision(first.error)) {
    const second = await admin
      .from("workflows")
      .select(WORKFLOW_COLUMNS_NO_SETUP_REV)
      .eq("user_id", userId)
      .is("deleted_at", null)
      .contains("draft_definition", { intakeRequestId })
      .order("created_at", { ascending: true })
      .limit(1)
      .maybeSingle();
    if (!second.error) {
      return second.data ? asRecord(second.data as ChatWorkflowRecord) : null;
    }
    if (!missingSetupState(second.error)) {
      return null;
    }
  }
  if (missingSetupState(first.error) || missingSetupRevision(first.error)) {
    const fallback = await admin
      .from("workflows")
      .select(WORKFLOW_COLUMNS_MIN)
      .eq("user_id", userId)
      .is("deleted_at", null)
      .contains("draft_definition", { intakeRequestId })
      .order("created_at", { ascending: true })
      .limit(1)
      .maybeSingle();
    return fallback.data ? asRecord(fallback.data as ChatWorkflowRecord) : null;
  }
  return null;
}

export function createSupabaseChatStore(
  admin: ReturnType<typeof createAdminClient> = createAdminClient(),
): ChatTurnStore {
  async function selectOwned(workflowId: string, userId: string) {
    const first = await admin
      .from("workflows")
      .select(WORKFLOW_COLUMNS)
      .eq("id", workflowId)
      .eq("user_id", userId)
      .is("deleted_at", null)
      .maybeSingle();
    if (!first.error) {
      return first;
    }
    if (missingSetupRevision(first.error)) {
      const second = await admin
        .from("workflows")
        .select(WORKFLOW_COLUMNS_NO_SETUP_REV)
        .eq("id", workflowId)
        .eq("user_id", userId)
        .is("deleted_at", null)
        .maybeSingle();
      if (!second.error || !missingSetupState(second.error)) {
        return second;
      }
    }
    if (missingSetupState(first.error) || missingSetupRevision(first.error)) {
      return admin
        .from("workflows")
        .select(WORKFLOW_COLUMNS_MIN)
        .eq("id", workflowId)
        .eq("user_id", userId)
        .is("deleted_at", null)
        .maybeSingle();
    }
    return first;
  }

  return {
    async createDraft(userId, options) {
      const draft = {
        ...emptyWorkflowDraft(),
        ...(options?.intakeRequestId ? { intakeRequestId: options.intakeRequestId } : {}),
      };
      const baseInsert = {
        user_id: userId,
        name: he.workflows.untitledDraft,
        definition: null,
        draft_definition: draft,
        status: "draft",
        next_run_at: null,
        draft_revision: 0,
      };
      const insert = { ...baseInsert, setup_revision: 0 };
      const first = await admin.from("workflows").insert(insert).select(WORKFLOW_COLUMNS).single();
      if (!first.error && first.data) {
        return asRecord(first.data as ChatWorkflowRecord);
      }
      if (missingSetupRevision(first.error)) {
        const second = await admin.from("workflows").insert(baseInsert).select(WORKFLOW_COLUMNS_NO_SETUP_REV).single();
        if (!second.error && second.data) {
          return asRecord(second.data as ChatWorkflowRecord);
        }
        if (missingSetupState(second.error)) {
          const third = await admin.from("workflows").insert(baseInsert).select(WORKFLOW_COLUMNS_MIN).single();
          if (third.error || !third.data) {
            throw new Error("save_failed");
          }
          return asRecord(third.data as ChatWorkflowRecord);
        }
        throw new Error("save_failed");
      }
      if (missingSetupState(first.error)) {
        const fallback = await admin.from("workflows").insert(baseInsert).select(WORKFLOW_COLUMNS_MIN).single();
        if (fallback.error || !fallback.data) {
          throw new Error("save_failed");
        }
        return asRecord(fallback.data as ChatWorkflowRecord);
      }
      throw new Error("save_failed");
    },

    async getOwned(workflowId, userId) {
      const loaded = await selectOwned(workflowId, userId);
      return loaded.data ? asRecord(loaded.data as ChatWorkflowRecord) : null;
    },

    async findMessage(workflowId, clientTurnId, role) {
      const { data } = await admin
        .from("workflow_messages")
        .select("role, content, client_turn_id")
        .eq("workflow_id", workflowId)
        .eq("client_turn_id", clientTurnId)
        .eq("role", role)
        .maybeSingle();
      return (data as StoredChatMessage | null) ?? null;
    },

    async insertMessage(input) {
      const { error } = await admin.from("workflow_messages").insert({
        workflow_id: input.workflowId,
        user_id: input.userId,
        client_turn_id: input.clientTurnId,
        role: input.role,
        content: input.content,
      });
      if (error && error.code !== "23505") {
        throw new Error("save_failed");
      }
    },

    async listRecent(workflowId, limit) {
      const { data, error } = await admin
        .from("workflow_messages")
        .select("role, content, client_turn_id, created_at")
        .eq("workflow_id", workflowId)
        .order("created_at", { ascending: false })
        .limit(limit);
      if (error) {
        throw new Error("save_failed");
      }
      return ((data ?? []) as StoredChatMessage[]).slice().reverse();
    },

    async applyTurn(input) {
      const { data, error } = await admin.rpc("apply_workflow_draft_turn", {
        p_workflow_id: input.workflowId,
        p_user_id: input.userId,
        p_expected_revision: input.expectedRevision,
        p_draft_definition: input.draft,
        p_client_turn_id: input.clientTurnId,
        p_assistant_content: input.assistantContent,
      });
      if (error) {
        if (String(error.message).includes("revision_conflict")) {
          throw new Error("revision_conflict");
        }
        throw new Error("save_failed");
      }
      const row = Array.isArray(data) ? data[0] : data;
      const newRevision = Number((row as { new_revision?: number } | null)?.new_revision);
      if (!Number.isFinite(newRevision)) {
        throw new Error("save_failed");
      }
      return { newRevision };
    },

    async applySetupTurn(input) {
      const { data, error } = await admin.rpc("apply_workflow_setup_turn", {
        p_workflow_id: input.workflowId,
        p_user_id: input.userId,
        p_expected_draft_revision: input.expectedDraftRevision,
        p_expected_setup_revision: input.expectedSetupRevision,
        p_setup_state: input.setup,
        p_client_turn_id: input.clientTurnId,
        p_assistant_content: input.assistantContent,
      });
      if (!error) {
        const row = Array.isArray(data) ? data[0] : data;
        const draftRevision = Number((row as { draft_revision?: number } | null)?.draft_revision);
        const setupRevision = Number((row as { setup_revision?: number } | null)?.setup_revision);
        if (!Number.isFinite(draftRevision) || !Number.isFinite(setupRevision)) {
          throw new Error("save_failed");
        }
        return { draftRevision, setupRevision };
      }
      const known = rpcError(error);
      if (known && !missingRpc(error, "apply_workflow_setup_turn")) {
        throw new Error(known);
      }

      const existingAssistant = await this.findMessage(input.workflowId, input.clientTurnId, "assistant");
      const current = await this.getOwned(input.workflowId, input.userId);
      if (!current) {
        throw new Error("not_found");
      }
      if (current.status === "completed") {
        throw new Error("completed");
      }
      if (existingAssistant) {
        return { draftRevision: current.draft_revision, setupRevision: current.setup_revision };
      }
      if (current.draft_revision !== input.expectedDraftRevision || current.setup_revision !== input.expectedSetupRevision) {
        throw new Error("revision_conflict");
      }

      const nextSetupRevision = current.setup_revision + 1;
      const patch: Record<string, unknown> = {
        setup_state: input.setup,
        setup_revision: nextSetupRevision,
      };
      let updated = await admin
        .from("workflows")
        .update(patch)
        .eq("id", input.workflowId)
        .eq("user_id", input.userId)
        .eq("draft_revision", input.expectedDraftRevision)
        .eq("setup_revision", input.expectedSetupRevision)
        .select("draft_revision, setup_revision")
        .maybeSingle();
      if (updated.error && missingSetupRevision(updated.error)) {
        delete patch.setup_revision;
        updated = await admin
          .from("workflows")
          .update(patch)
          .eq("id", input.workflowId)
          .eq("user_id", input.userId)
          .eq("draft_revision", input.expectedDraftRevision)
          .select("draft_revision")
          .maybeSingle();
      }
      if (updated.error && missingSetupState(updated.error)) {
        await this.insertMessage({
          workflowId: input.workflowId,
          userId: input.userId,
          clientTurnId: input.clientTurnId,
          role: "assistant",
          content: input.assistantContent,
        });
        return { draftRevision: current.draft_revision, setupRevision: current.setup_revision };
      }
      if (updated.error) {
        throw new Error("save_failed");
      }
      if (!updated.data) {
        const racedAssistant = await this.findMessage(input.workflowId, input.clientTurnId, "assistant");
        const latest = await this.getOwned(input.workflowId, input.userId);
        if (racedAssistant && latest) {
          return { draftRevision: latest.draft_revision, setupRevision: latest.setup_revision };
        }
        throw new Error("revision_conflict");
      }

      await this.insertMessage({
        workflowId: input.workflowId,
        userId: input.userId,
        clientTurnId: input.clientTurnId,
        role: "assistant",
        content: input.assistantContent,
      });
      return {
        draftRevision: Number((updated.data as { draft_revision?: number }).draft_revision ?? current.draft_revision),
        setupRevision: Number.isFinite(Number((updated.data as { setup_revision?: number }).setup_revision))
          ? Number((updated.data as { setup_revision?: number }).setup_revision)
          : current.setup_revision,
      };
    },

    async applySetupProposal(input) {
      const { data, error } = await admin.rpc("apply_workflow_setup_proposal", {
        p_workflow_id: input.workflowId,
        p_user_id: input.userId,
        p_expected_draft_revision: input.expectedDraftRevision,
        p_expected_setup_revision: input.expectedSetupRevision,
      });
      if (!error) {
        const row = Array.isArray(data) ? data[0] : data;
        const typed = row as { draft_revision?: number; setup_revision?: number; draft_definition?: unknown } | null;
        const newRevision = Number(typed?.draft_revision);
        const setupRevision = Number(typed?.setup_revision);
        const draft = draftFromRecord({
          id: input.workflowId,
          status: "draft",
          draft_definition: typed?.draft_definition,
          definition: null,
          draft_revision: newRevision,
          setup_revision: setupRevision,
          deleted_at: null,
        });
        if (!Number.isFinite(newRevision) || !Number.isFinite(setupRevision)) {
          throw new Error("save_failed");
        }
        await this.insertMessage({
          workflowId: input.workflowId,
          userId: input.userId,
          clientTurnId: crypto.randomUUID(),
          role: "assistant",
          content: he.studio.setup.processBuilt,
        });
        return { newRevision, setupRevision, draft };
      }
      const known = rpcError(error);
      if (known && !missingRpc(error, "apply_workflow_setup_proposal")) {
        throw new Error(known);
      }

      const latest = await this.getOwned(input.workflowId, input.userId);
      if (!latest) {
        throw new Error("not_found");
      }
      if (latest.status === "completed") {
        throw new Error("completed");
      }
      if (latest.draft_revision !== input.expectedDraftRevision || latest.setup_revision !== input.expectedSetupRevision) {
        throw new Error("revision_conflict");
      }
      const parsedResult = parseWorkflowSetupState(latest.setup_state);
      const parsed = parsedResult.success
        ? parsedResult.data
        : input.setup && input.setup.status === "review"
          ? input.setup
          : null;
      if (!parsed || parsed.status !== "review") {
        throw new Error("not_review");
      }
      if (parsed.baseDraftRevision !== latest.draft_revision) {
        throw new Error("setup_conflict");
      }
      const newRevision = latest.draft_revision + 1;
      const nextSetupRevision = latest.setup_revision + 1;
      const completed = {
        ...parsed,
        status: "completed" as const,
        conversationMode: "edit" as const,
        pendingEdit: null,
        nextQuestion: null,
        baseDraftRevision: newRevision,
        updatedAt: new Date().toISOString(),
      };
      const proposal = materializeRecipientForRuntime(parsed.proposal, parsed.recipientIdentity);
      const patch: Record<string, unknown> = {
        draft_definition: proposal,
        draft_revision: newRevision,
        setup_state: completed,
        setup_revision: nextSetupRevision,
      };
      if (latest.status === "draft" && proposal.name.trim()) {
        patch.name = proposal.name.trim();
      }
      let updated = await admin
        .from("workflows")
        .update(patch)
        .eq("id", input.workflowId)
        .eq("user_id", input.userId)
        .eq("draft_revision", input.expectedDraftRevision)
        .eq("setup_revision", input.expectedSetupRevision)
        .select("draft_revision, setup_revision")
        .maybeSingle();
      if (updated.error && missingSetupRevision(updated.error)) {
        delete patch.setup_revision;
        updated = await admin
          .from("workflows")
          .update(patch)
          .eq("id", input.workflowId)
          .eq("user_id", input.userId)
          .eq("draft_revision", input.expectedDraftRevision)
          .select("draft_revision")
          .maybeSingle();
      }
      if (updated.error && missingSetupState(updated.error)) {
        delete patch.setup_state;
        delete patch.setup_revision;
        const retry = await admin
          .from("workflows")
          .update(patch)
          .eq("id", input.workflowId)
          .eq("user_id", input.userId)
          .eq("draft_revision", input.expectedDraftRevision)
          .select("draft_revision")
          .maybeSingle();
        if (retry.error || !retry.data) {
          throw new Error(retry.error ? "save_failed" : "revision_conflict");
        }
        await this.insertMessage({
          workflowId: input.workflowId,
          userId: input.userId,
          clientTurnId: crypto.randomUUID(),
          role: "assistant",
          content: he.studio.setup.processBuilt,
        });
        return { newRevision, setupRevision: latest.setup_revision, draft: proposal };
      }
      if (updated.error) {
        throw new Error("save_failed");
      }
      if (!updated.data) {
        throw new Error("revision_conflict");
      }
      await this.insertMessage({
        workflowId: input.workflowId,
        userId: input.userId,
        clientTurnId: crypto.randomUUID(),
        role: "assistant",
        content: he.studio.setup.processBuilt,
      });
      return {
        newRevision,
        setupRevision: Number((updated.data as { setup_revision?: number }).setup_revision ?? nextSetupRevision),
        draft: proposal,
      };
    },

    async applyEdit(input) {
      const { data, error } = await admin.rpc("apply_workflow_draft_edit", {
        p_workflow_id: input.workflowId,
        p_user_id: input.userId,
        p_expected_revision: input.expectedRevision,
        p_draft_definition: input.draft,
      });
      if (!error) {
        const row = Array.isArray(data) ? data[0] : data;
        const newRevision = Number((row as { new_revision?: number } | null)?.new_revision);
        if (!Number.isFinite(newRevision)) {
          throw new Error("save_failed");
        }
        return { newRevision };
      }
      if (String(error.message).includes("revision_conflict")) {
        throw new Error("revision_conflict");
      }
      if (String(error.message).includes("completed")) {
        throw new Error("completed");
      }
      const missingFn = error.code === "42883" || /apply_workflow_draft_edit/.test(String(error.message));
      if (!missingFn) {
        throw new Error("save_failed");
      }

      const { data: current } = await admin
        .from("workflows")
        .select("draft_revision, status")
        .eq("id", input.workflowId)
        .eq("user_id", input.userId)
        .is("deleted_at", null)
        .maybeSingle();
      if (!current) {
        throw new Error("not_found");
      }
      if (current.status === "completed") {
        throw new Error("completed");
      }
      if (Number(current.draft_revision) !== input.expectedRevision) {
        throw new Error("revision_conflict");
      }
      const newRevision = Number(current.draft_revision) + 1;
      const nextDraft = {
        ...input.draft,
        fields: input.draft.fields.map((field) =>
          field.id && field.id !== "pending" ? field : { ...field, id: crypto.randomUUID() },
        ),
      };
      const patch: Record<string, unknown> = {
        draft_definition: nextDraft,
        draft_revision: newRevision,
      };
      if (current.status === "draft" && nextDraft.name.trim()) {
        patch.name = nextDraft.name.trim();
      }
      const { error: updateError } = await admin
        .from("workflows")
        .update(patch)
        .eq("id", input.workflowId)
        .eq("user_id", input.userId)
        .eq("draft_revision", input.expectedRevision);
      if (updateError) {
        throw new Error("save_failed");
      }
      return { newRevision };
    },
  };
}
