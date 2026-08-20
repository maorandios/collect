import "server-only";

import { zodTextFormat } from "openai/helpers/zod";

import {
  getOpenAiSetupFallbackModel,
  getOpenAiSetupModel,
  getOpenAiSetupReasoningEffort,
} from "@/lib/env";
import { getOpenAI } from "@/lib/openai/client";
import {
  initialWorkflowExtractionSchema,
  type InitialWorkflowExtraction,
} from "@/lib/workflow/intake-extraction";
import {
  setupAnswerInterpretationSchema,
  setupChangePatchSchema,
  setupExtractionSchema,
  type SetupAiUsage,
  type SetupAnswerInterpretation,
  type SetupChangePatch,
  type SetupExtraction,
} from "@/lib/workflow/setup-extraction";
import {
  heuristicIntakeExtraction,
  preferAtomicExtraction,
  sanitizeInitialExtraction,
  validateAtomicExtraction,
} from "@/lib/workflow/intake-sanitize";
import { compactSetupForModel } from "@/lib/workflow/setup-agent";
import type { WorkflowSetupState } from "@/lib/workflow/setup-state";

const INTAKE_SYSTEM = `אתם מחלץ הקמה חד־פעמי לקולקט. החזירו רק extraction מובנה.
כל collectionItem הוא פריט איסוף אטומי אחד: label ו-sourcePhrase מילה-במילה מהטקסט.
פריט אחד לכל deliverable. שמרו על סדר הפריטים המקורי.
פצלו רשימות המחוברות בפסיקים, +, «וגם», או ו׳ החיבור כשלאחריה מתחיל שם מסמך חדש: חשבוניות, קבלות, אישור, דוח, תדפיס.
«אישור מפקח האתר וחשבוניות מס» הם שני פריטים. «חשבוניות וקבלות» הם שני פריטים.
אל תכניסו ל-collectionItems שם חברה, איש קשר, אימייל, תזמון, או מילות יחס כמו «מחברת» או «מגעש».
«דוד ובניו» הוא שם חברה אחד. אל תפצלו ו׳ שבתוך שם חברה.
אל תחליטו על סוג הקלט. אל תמציאו שדות או מייל.
recipient.organizationName הוא שם החברה המנורמל בלי «מ־» או «מחברת». organizationSourcePhrase הוא המקטע המקורי בטקסט.
דוגמאות:
«קבלת חשבוניות וקבלות מחברת געש» → חשבוניות, קבלות; חברה געש.
«איסוף דוח שעות עובדים, אישור מנהל וחשבוניות מס מניסים בנייה» → דוח שעות עובדים, אישור מנהל, חשבוניות מס; חברה ניסים בנייה.
«קבלת אישור ניהול ספרים ואישור ניכוי מס במקור מחברת דוד ובניו» → אישור ניהול ספרים, אישור ניכוי מס במקור; חברה דוד ובניו.
תזמון רק אם נאמר במפורש. אחרת scheduleType=none.
תזכורת רק אם נאמרה. אחרת { "state": "unset" }.`;

const INTAKE_REPAIR_SYSTEM = `${INTAKE_SYSTEM}
תיקון ממוקד: החילוץ הקודם לא היה אטומי. פצלו כל deliverable ל-collectionItem נפרד. הסירו את מקטע החברה מכל label. אל תוסיפו פריט שהוא שם החברה.`;

const EXTRACT_SYSTEM = `אתם מחלץ הקמה לקולקט. החזירו רק extraction מובנה.
חלצו את כל פריטי האיסוף בסדר הופעתם. «חשבונית ואישור» הם שני פריטים.
«חשבוניות», «קבלות», «תדפיס בנק», «אישור ניכוי מס במקור», «אישור ניהול ספרים», «פוליסת ביטוח», «דוח שעות» ו«הצעת מחיר» הם קבצים.
«דוח עובדים» הוא ambiguous. «אישור מנהל האתר», «אישור מפקח», «אישור ביצוע» ו«אישור מנהל פרויקט» הם ambiguous.
שם חברה: העתיקו מהטקסט המקורי. אחרי «חברת» או «מחברת» אל תסירו מ׳ משמות כמו מטריקס, מגדל, מנורה. ב«מגעש תעשיות» האות מ׳ היא מילת יחס והשם הוא «געש תעשיות».
איש קשר הוא אדם מפורש בלבד. מלאו contactPerson.value רק עם evidence מילה-במילה מהטקסט, למשל «איש הקשר דוד כהן» או «לדוד כהן». שם חברה אינו recipientName ואינו contactPerson.
אל תמציאו מייל. אל תיצרו פריט שהוא כתובת מייל, שעה או יום בשבוע.
אל תכתבו נושא או גוף מייל חלקי. השאירו emailSubject ו-emailBody ריקים.`;

const CHANGE_SYSTEM = `אתם מחלץ שינוי ל-Proposal קיים. החזירו patch קטן בלבד.
replace, לא append. שמרו על מזהה שדה קיים כשמשנים סוג.`;

const INTERPRET_SYSTEM = `אתם מפרש תשובה אחת לשאלה בהקמת תהליך. אין Proposal ואין היסטוריה.
החזירו understood, canonicalValue, confidence.
canonicalValue חייב להיות ערך מותר מהרשימה, או ערך מנורמל: שעה HH:MM, אימייל, weekday 0-6, reminder 24/48/168/none, file/confirmation/text/number, weekly/monthly/once/manual.
אם לא בטוחים, understood=false ו-canonicalValue=null.`;

const SETUP_TIMEOUT_MS = 20000;
const EXTRACT_MAX_OUTPUT = 700;
const INTAKE_MAX_OUTPUT = 900;
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

async function parseStructured<T>({
  schema,
  name,
  input,
  maxOutput,
  parse,
  model,
  fallback,
  started = Date.now(),
}: {
  schema: Parameters<typeof zodTextFormat>[0];
  name: string;
  input: Array<{ role: "system" | "developer" | "user" | "assistant"; content: string }>;
  maxOutput: number;
  parse: (data: unknown) => { success: true; data: T } | { success: false };
  model: string;
  fallback: boolean;
  started?: number;
}): Promise<{ parsed: T; usage: SetupAiUsage }> {
  const client = getOpenAI();
  const effort = getOpenAiSetupReasoningEffort();
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
  const usage = usageFrom(
    model,
    started,
    response as { usage?: { input_tokens?: number; output_tokens?: number } },
    fallback,
  );
  const parsed = parse((response as { output_parsed?: unknown }).output_parsed);
  if (!parsed.success) {
    throw new Error("openai_parse_failed");
  }
  return { parsed: parsed.data, usage };
}

async function parseWithFallback<T>(
  schema: Parameters<typeof zodTextFormat>[0],
  name: string,
  input: Array<{ role: "system" | "developer" | "user" | "assistant"; content: string }>,
  maxOutput: number,
  parse: (data: unknown) => { success: true; data: T } | { success: false },
): Promise<{ parsed: T; usage: SetupAiUsage }> {
  const primary = getOpenAiSetupModel();
  const fallbackModel = getOpenAiSetupFallbackModel();
  const started = Date.now();
  try {
    return await parseStructured({
      schema,
      name,
      input,
      maxOutput,
      parse,
      model: primary,
      fallback: false,
      started,
    });
  } catch (error) {
    if (primary === fallbackModel) {
      throw error;
    }
    return parseStructured({
      schema,
      name,
      input,
      maxOutput,
      parse,
      model: fallbackModel,
      fallback: true,
      started,
    });
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

export async function extractInitialWorkflowWithOpenAI(
  input: SetupExtractInput,
): Promise<{ extraction: InitialWorkflowExtraction; usage: SetupAiUsage }> {
  const trusted = {
    timezone: "Asia/Jerusalem",
    today: input.today,
    mailboxEmail: input.mailboxEmail,
  };
  const parse = (data: unknown) => initialWorkflowExtractionSchema.safeParse(data);
  const primary = await parseWithFallback(
    initialWorkflowExtractionSchema,
    "initial_workflow_extraction",
    [
      { role: "system", content: INTAKE_SYSTEM },
      { role: "developer", content: JSON.stringify(trusted) },
      { role: "user", content: input.userMessage },
    ],
    INTAKE_MAX_OUTPUT,
    parse,
  );
  const sanitized = sanitizeInitialExtraction(input.userMessage, primary.parsed);
  if (validateAtomicExtraction(input.userMessage, sanitized).ok) {
    logSetupAi("extract", primary.usage);
    return { extraction: sanitized, usage: primary.usage };
  }

  const fallbackModel = getOpenAiSetupFallbackModel();
  if (primary.usage.fallback || getOpenAiSetupModel() === fallbackModel) {
    const extraction = preferAtomicExtraction(
      input.userMessage,
      sanitized,
      heuristicIntakeExtraction(input.userMessage),
    );
    logSetupAi("extract", primary.usage);
    return { extraction, usage: primary.usage };
  }

  const invalid = validateAtomicExtraction(input.userMessage, sanitized);
  const repaired = await parseStructured({
    schema: initialWorkflowExtractionSchema,
    name: "initial_workflow_extraction",
    input: [
      { role: "system", content: INTAKE_REPAIR_SYSTEM },
      { role: "developer", content: JSON.stringify({ ...trusted, previousReasons: invalid.ok ? [] : invalid.reasons }) },
      { role: "user", content: input.userMessage },
    ],
    maxOutput: INTAKE_MAX_OUTPUT,
    parse,
    model: fallbackModel,
    fallback: true,
    started: Date.now() - primary.usage.latencyMs,
  });
  const sanitizedRepair = sanitizeInitialExtraction(input.userMessage, repaired.parsed);
  const extraction = validateAtomicExtraction(input.userMessage, sanitizedRepair).ok
    ? sanitizedRepair
    : preferAtomicExtraction(
        input.userMessage,
        sanitizedRepair,
        preferAtomicExtraction(input.userMessage, sanitized, heuristicIntakeExtraction(input.userMessage)),
      );
  logSetupAi("extract", repaired.usage);
  return { extraction, usage: repaired.usage };
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
