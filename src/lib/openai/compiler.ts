import "server-only";

import { zodTextFormat } from "openai/helpers/zod";

import { getOpenAiModel } from "@/lib/env";
import { getOpenAI } from "@/lib/openai/client";
import {
  WorkflowCompilerResultSchema,
  type CompileConversationInput,
  type WorkflowCompilerResult,
} from "@/lib/workflow/compiler-result";

const SYSTEM_PROMPT = `אתם סוכן הקמה של תהליך איסוף מידע בקולקט.
חלצו את כל הדרישות שנאמרו, כולל פריטים שמחוברים ב־ו׳.
אם נאמר «חשבונית ואישור פיקוח» החזירו שני שדות נפרדים. אסור למזג שני מסמכים לשדה אחד.
«אישור» בלי סוג ברור הוא עמום — אל תבחרו File אוטומטית.
assistantMessage קצר. השרת יחליף אותו. אל תשאלו יותר משאלה אחת.
אסור להפעיל, לפרסם, לשלוח או למחוק תהליך.
אסור להמציא כתובת מייל, תאריך או תיבת שולח שלא נאמרו במפורש.
אם חסר מייל לנמען — השאירו email כ-null.
שמרו על מזהי שדות קיימים. מחקו שדה רק אם הוא מופיע ב-removedFieldIds.
נושא המייל מתאר את הבקשה בלבד. 3–9 מילים. בלי שם הנמען ובלי שם חברה.
send_now הוא שליחה מיידית. manual הוא תבנית ידנית. אל תמירו ביניהם.
אל תסיקו send_now או manual אם לא נאמר במפורש.
תזמון חלקי מותר: יום בלי שעה נשאר בלי שעה.
שדה קובץ: PDF רק אם נאמר PDF. אם נאמר רק דוח/מסמך/קובץ — allowedMimeTypes ריק.
תזכורת רק אם המשתמש ביקש. אל תבקשו לחבר Gmail.`;

export async function compileConversationWithOpenAI(
  input: CompileConversationInput,
): Promise<WorkflowCompilerResult> {
  const client = getOpenAI();
  const trusted = {
    currentDraft: input.draft,
    connectedMailboxEmail: input.mailboxEmail,
    timezone: "Asia/Jerusalem",
    today: input.today,
  };

  const response = await client.responses.parse({
    model: getOpenAiModel(),
    input: [
      { role: "system", content: SYSTEM_PROMPT },
      { role: "developer", content: JSON.stringify(trusted) },
      ...input.messages.map((message) => ({
        role: message.role,
        content: message.content,
      })),
    ],
    text: {
      format: zodTextFormat(WorkflowCompilerResultSchema, "workflow_compiler_result"),
    },
  });

  const parsed = WorkflowCompilerResultSchema.safeParse(response.output_parsed);
  if (!parsed.success) {
    throw new Error("openai_parse_failed");
  }
  return parsed.data;
}
