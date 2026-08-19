import "server-only";

import { zodTextFormat } from "openai/helpers/zod";

import {
  getOpenAiSetupFallbackModel,
  getOpenAiSetupModel,
  getOpenAiSetupReasoningEffort,
} from "@/lib/env";
import { getOpenAI } from "@/lib/openai/client";
import {
  setupAnswerInterpretationSchema,
  setupChangePatchSchema,
  setupExtractionSchema,
  type SetupAiUsage,
  type SetupAnswerInterpretation,
  type SetupChangePatch,
  type SetupExtraction,
} from "@/lib/workflow/setup-extraction";
import { compactSetupForModel } from "@/lib/workflow/setup-agent";
import type { WorkflowSetupState } from "@/lib/workflow/setup-state";

const EXTRACT_SYSTEM = `אתם מחלץ הקמה לקולקט. החזירו רק extraction מובנה.
חלצו את כל פריטי האיסוף. «חשבונית ואישור» הם שני פריטים.
«אישור» בלי סוג ברור הוא ambiguous. אל תמציאו מייל.
אל תיצרו פריט שהוא כתובת מייל, שעה או יום בשבוע.`;

const CHANGE_SYSTEM = `אתם מחלץ שינוי ל-Proposal קיים. החזירו patch קטן בלבד.
replace, לא append. שמרו על מזהה שדה קיים כשמשנים סוג.`;

const INTERPRET_SYSTEM = `אתם מפרש תשובה אחת לשאלה בהקמת תהליך. אין Proposal ואין היסטוריה.
החזירו understood, canonicalValue, confidence.
canonicalValue חייב להיות ערך מותר מהרשימה, או ערך מנורמל: שעה HH:MM, אימייל, weekday 0-6, reminder 24/48/168/none, file/confirmation/text, weekly/monthly/once/manual.
אם לא בטוחים, understood=false ו-canonicalValue=null.`;

const SETUP_TIMEOUT_MS = 20000;
const EXTRACT_MAX_OUTPUT = 700;
const CHANGE_MAX_OUTPUT = 400;
const INTERPRET_MAX_OUTPUT = 120;

export type SetupExtractInput = {
  userMessage: string;
  mailboxEmail: string | null;
  today: string;
  recent?: Array<{ role: "user" | "assistant"; content: string }>;
  setup?: WorkflowSetupState | null;
};

function usageFrom(
  model: string,
  started: number,
  response: { usage?: { input_tokens?: number; output_tokens?: number } | null },
  fallback: boolean,
): SetupAiUsage {
  return {
    model,
    latencyMs: Date.now() - started,
    inputTokens: Number(response.usage?.input_tokens ?? 0),
    outputTokens: Number(response.usage?.output_tokens ?? 0),
    fallback,
  };
}

function logSetupAi(kind: "extract" | "change" | "interpret", usage: SetupAiUsage) {
  console.info(
    JSON.stringify({
      event: "setup_ai",
      kind,
      model: usage.model,
      latencyMs: usage.latencyMs,
      inputTokens: usage.inputTokens,
      outputTokens: usage.outputTokens,
      fallback: usage.fallback,
    }),
  );
}

async function parseWithFallback<T>(
  schema: Parameters<typeof zodTextFormat>[0],
  name: string,
  input: Array<{ role: "system" | "developer" | "user" | "assistant"; content: string }>,
  maxOutput: number,
  parse: (data: unknown) => { success: true; data: T } | { success: false },
): Promise<{ parsed: T; usage: SetupAiUsage }> {
  const client = getOpenAI();
  const primary = getOpenAiSetupModel();
  const fallbackModel = getOpenAiSetupFallbackModel();
  const effort = getOpenAiSetupReasoningEffort();
  const started = Date.now();

  async function once(model: string, fallback: boolean) {
    const request = {
      model,
      max_output_tokens: maxOutput,
      reasoning: { effort },
      input,
      text: { format: zodTextFormat(schema, name) },
    };
    const response = await Promise.race([
      client.responses.parse(request as never),
      new Promise<never>((_, reject) => {
        setTimeout(() => reject(new Error("openai_timeout")), SETUP_TIMEOUT_MS);
      }),
    ]);
    return {
      response,
      usage: usageFrom(model, started, response as { usage?: { input_tokens?: number; output_tokens?: number } }, fallback),
    };
  }

  try {
    const first = await once(primary, false);
    const parsed = parse((first.response as { output_parsed?: unknown }).output_parsed);
    if (parsed.success) {
      return { parsed: parsed.data, usage: first.usage };
    }
    throw new Error("openai_parse_failed");
  } catch (error) {
    if (primary === fallbackModel) {
      throw error;
    }
    const second = await once(fallbackModel, true);
    const parsed = parse((second.response as { output_parsed?: unknown }).output_parsed);
    if (!parsed.success) {
      throw new Error("openai_parse_failed");
    }
    return { parsed: parsed.data, usage: second.usage };
  }
}

export async function extractSetupWithOpenAI(
  input: SetupExtractInput,
): Promise<{ extraction: SetupExtraction; usage: SetupAiUsage }> {
  const trusted = {
    timezone: "Asia/Jerusalem",
    today: input.today,
    mailboxEmail: input.mailboxEmail,
  };
  const result = await parseWithFallback(
    setupExtractionSchema,
    "setup_extraction",
    [
      { role: "system", content: EXTRACT_SYSTEM },
      { role: "developer", content: JSON.stringify(trusted) },
      { role: "user", content: input.userMessage },
    ],
    EXTRACT_MAX_OUTPUT,
    (data) => setupExtractionSchema.safeParse(data),
  );
  logSetupAi("extract", result.usage);
  return { extraction: result.parsed, usage: result.usage };
}

export async function extractSetupChangeWithOpenAI(
  input: SetupExtractInput & { setup: WorkflowSetupState },
): Promise<{ patch: SetupChangePatch; usage: SetupAiUsage }> {
  const recent = (input.recent ?? [])
    .filter((item) => item.role === "user" || item.role === "assistant")
    .slice(-2);
  const result = await parseWithFallback(
    setupChangePatchSchema,
    "setup_change_patch",
    [
      { role: "system", content: CHANGE_SYSTEM },
      { role: "developer", content: JSON.stringify(compactSetupForModel(input.setup)) },
      ...recent.map((item) => ({ role: item.role, content: item.content })),
      { role: "user", content: input.userMessage },
    ],
    CHANGE_MAX_OUTPUT,
    (data) => setupChangePatchSchema.safeParse(data),
  );
  logSetupAi("change", result.usage);
  return { patch: result.parsed, usage: result.usage };
}

export async function interpretSetupAnswerWithOpenAI(input: {
  question: { key: string; step: string; question: string; answerType: string; options?: Array<{ value: string; label: string }> };
  userMessage: string;
}): Promise<{ interpretation: SetupAnswerInterpretation; usage: SetupAiUsage }> {
  const result = await parseWithFallback(
    setupAnswerInterpretationSchema,
    "setup_answer_interpretation",
    [
      { role: "system", content: INTERPRET_SYSTEM },
      {
        role: "user",
        content: JSON.stringify({
          question: input.question.question,
          answerType: input.question.answerType,
          options: input.question.options ?? [],
          answer: input.userMessage,
        }),
      },
    ],
    INTERPRET_MAX_OUTPUT,
    (data) => setupAnswerInterpretationSchema.safeParse(data),
  );
  logSetupAi("interpret", result.usage);
  return { interpretation: result.parsed, usage: result.usage };
}
