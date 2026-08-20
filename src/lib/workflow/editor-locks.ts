export type EditorLockKey =
  | "name"
  | "emailSubject"
  | "emailBody"
  | "schedule"
  | "recipients"
  | "fields"
  | "reminder";

export type EditorLocks = Partial<Record<EditorLockKey, boolean>>;

const AREA_PATTERNS: Record<EditorLockKey, RegExp> = {
  name: /שם התהליך|שנה את השם/,
  emailSubject: /נושא(?:\s*המייל)?/,
  emailBody: /גוף(?:\s*המייל)?|תוכן המייל/,
  schedule: /תזמון|יום בשבוע|יום בחודש|שעת שליחה|שנה את המועד|יום ראשון|יום שני|יום שלישי|יום רביעי|יום חמישי|יום שישי|יום שבת/,
  recipients: /נמענ|כתובת המייל|שלח ל/,
  fields: /שדה|שדות|הטופס|הוסף שדה|מחק שדה/,
  reminder: /תזכורת|אחרי יום|אחרי יומיים|אחרי שבוע|ללא תזכורת/,
};

export function userRequestedLockArea(userMessage: string, key: EditorLockKey) {
  return AREA_PATTERNS[key].test(userMessage);
}

export function mergeEditorLocks(current: EditorLocks | undefined, keys: EditorLockKey[]): EditorLocks {
  const next = { ...current };
  for (const key of keys) {
    next[key] = true;
  }
  return next;
}

export function omitDraftOnlyFields(draft: Record<string, unknown>) {
  const rest = { ...draft };
  delete rest.editorLocks;
  delete rest.reminderDecision;
  delete rest.draftReminder;
  delete rest.emailEditingState;
  delete rest.intakeRequestId;
  if (Array.isArray(rest.recipients)) {
    rest.recipients = rest.recipients.map((recipient) => {
      if (!recipient || typeof recipient !== "object") {
        return recipient;
      }
      const next = { ...(recipient as Record<string, unknown>) };
      delete next.contactName;
      delete next.contactResolution;
      return next;
    });
  }
  return rest;
}
