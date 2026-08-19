import { NextResponse } from "next/server";

import { requireUserApi } from "@/lib/auth/require-user";
import { he } from "@/lib/i18n/he";
import { getConnectedMailboxForUser, getUserMailbox } from "@/lib/mailbox";
import { extractSetupChangeWithOpenAI, extractSetupWithOpenAI, interpretSetupAnswerWithOpenAI } from "@/lib/openai/setup-extract";
import { createSupabaseChatStore } from "@/lib/workflow/chat-store";
import { runWorkflowChatTurn } from "@/lib/workflow/chat-turn";

export const dynamic = "force-dynamic";

function methodNotAllowed() {
  return NextResponse.json({ message: he.errors.forbidden }, { status: 405 });
}

export async function POST(request: Request) {
  const auth = await requireUserApi();
  if (auth.response || !auth.user) {
    return (
      auth.response ?? NextResponse.json({ message: he.errors.unauthorized }, { status: 401 })
    );
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ message: he.workflows.invalidChatRequest }, { status: 400 });
  }

  const mailbox = await getUserMailbox(auth.user.id);
  const connected = await getConnectedMailboxForUser(auth.user.id);
  const mailboxStatus =
    connected ? "connected" : mailbox?.status === "needs_reauth" ? "needs_reauth" : "disconnected";
  const result = await runWorkflowChatTurn({
    userId: auth.user.id,
    body,
    store: createSupabaseChatStore(),
    compiler: {
      extract: extractSetupWithOpenAI,
      extractChange: extractSetupChangeWithOpenAI,
      interpretAnswer: interpretSetupAnswerWithOpenAI,
    },
    mailboxId: connected?.id ?? null,
    mailboxEmail: connected?.email ?? null,
    mailboxStatus,
  });

  return NextResponse.json(result.body, { status: result.status });
}

export function GET() {
  return methodNotAllowed();
}

export function PUT() {
  return methodNotAllowed();
}

export function PATCH() {
  return methodNotAllowed();
}

export function DELETE() {
  return methodNotAllowed();
}
