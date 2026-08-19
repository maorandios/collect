import { extractEmails } from "@/lib/workflow/setup-extract";
import type { SetupQuestion } from "@/lib/workflow/setup-state";

const WEEKDAYS: Array<{ day: number; pattern: RegExp }> = [
  { day: 0, pattern: /בימי ראשון|כל יום ראשון|יום ראשון|(^|\s)ראשון(\s|$)/ },
  { day: 2, pattern: /בימי שלישי|כל יום שלישי|יום שלישי|(^|\s)שלישי(\s|$)/ },
  { day: 3, pattern: /בימי רביעי|כל יום רביעי|יום רביעי|(^|\s)רביעי(\s|$)/ },
  { day: 4, pattern: /בימי חמישי|כל יום חמישי|יום חמישי|(^|\s)חמישי(\s|$)/ },
  { day: 1, pattern: /בימי שני|כל יום שני|יום שני|(^|\s)שני(\s|$)/ },
  { day: 5, pattern: /בימי שישי|כל יום שישי|יום שישי|(^|\s)שישי(\s|$)/ },
  { day: 6, pattern: /בימי שבת|כל יום שבת|יום שבת|(^|\s)שבת(\s|$)/ },
];

const PERSON_SKIP = new Set(["כל", "טופס", "מייל", "בקשה", "תהליך", "חודש", "שבוע", "חברת", "נהל", "מנהל"]);
const FROM_WORD_SKIP = /מנהל|מחברת|מטופס|מסמך/;

const EMAIL_TYPOS: Record<string, string> = {
  "gmial.com": "gmail.com",
  "gamil.com": "gmail.com",
  "hotmial.com": "hotmail.com",
  "outlok.com": "outlook.com",
};

const HOUR_WORDS: Array<{ word: string; hour: number }> = [
  { word: "שתים עשרה", hour: 12 },
  { word: "שתיים עשרה", hour: 12 },
  { word: "אחת עשרה", hour: 11 },
  { word: "עשר", hour: 10 },
  { word: "תשע", hour: 9 },
  { word: "שמונה", hour: 8 },
  { word: "שבע", hour: 7 },
  { word: "שש", hour: 6 },
  { word: "חמש", hour: 5 },
  { word: "ארבע", hour: 4 },
  { word: "שלוש", hour: 3 },
  { word: "שתיים", hour: 2 },
  { word: "שתים", hour: 2 },
  { word: "אחת", hour: 1 },
];

export const SETUP_INTERPRET_MIN_CONFIDENCE = 0.7;

export function looksLikeEmail(value: string) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value.trim());
}

function formatTime(hours: number, minutes: number) {
  if (hours > 23 || minutes > 59) {
    return null;
  }
  return `${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}`;
}

function applyDayPeriod(hours: number, period: string | undefined) {
  if (!period) {
    return hours;
  }
  if (/ערב|לילה/.test(period) && hours < 12) {
    return hours + 12;
  }
  if (/בוקר|צהר/.test(period) && hours === 12) {
    return 0;
  }
  return hours;
}

export function extractTime(message: string, options?: { allowBareHour?: boolean }) {
  const text = message.trim();
  const colon = text.match(/(?:בשעה\s*)?(\d{1,2})[:.](\d{2})(?:\s*(בבוקר|בערב|בלילה|בצהריים))?/);
  if (colon) {
    return formatTime(applyDayPeriod(Number(colon[1]), colon[3]), Number(colon[2]));
  }

  for (const item of HOUR_WORDS) {
    const word = text.match(new RegExp(`^${item.word}\\s*(בבוקר|בערב|בלילה|בצהריים)?$`));
    if (word) {
      return formatTime(applyDayPeriod(item.hour, word[1]), 0);
    }
  }

  const numbered = text.match(/^(\d{1,2})\s*(בבוקר|בערב|בלילה|בצהריים)$/);
  if (numbered) {
    return formatTime(applyDayPeriod(Number(numbered[1]), numbered[2]), 0);
  }

  if (options?.allowBareHour) {
    const bare = text.match(/^\s*(\d{1,2})\s*$/);
    if (bare) {
      return formatTime(Number(bare[1]), 0);
    }
  }
  return null;
}

export function extractWeekday(message: string) {
  const numbered = message.trim().match(/^[0-6]$/);
  if (numbered) {
    return Number(numbered[0]);
  }
  for (const item of WEEKDAYS) {
    if (item.pattern.test(message)) {
      return item.day;
    }
  }
  return null;
}

export function extractMonthDay(message: string, question: SetupQuestion | null) {
  const month = message.match(/(?:בכל\s+)?(\d{1,2})\s+בחודש/);
  if (month) {
    const day = Number(month[1]);
    return day >= 1 && day <= 31 ? day : null;
  }
  if (question?.key === "monthly_day" || question?.key === "change") {
    const only = message.match(/^\s*(\d{1,2})\s*$/);
    if (only) {
      const day = Number(only[1]);
      return day >= 1 && day <= 31 ? day : null;
    }
  }
  return null;
}

export function extractDate(message: string) {
  const iso = message.match(/\d{4}-\d{2}-\d{2}/);
  if (iso) {
    return iso[0];
  }
  const numbered = message.match(/(\d{1,2})[./](\d{1,2})[./](\d{4})/);
  if (!numbered) {
    return null;
  }
  return `${numbered[3]}-${String(numbered[2]).padStart(2, "0")}-${String(numbered[1]).padStart(2, "0")}`;
}

export function extractPersonName(message: string) {
  const to = message.match(/(?:שלח|שלחו|אסוף|אספו)\s+ל([א-ת]{2,12})(?:\s+([א-ת]{2,12}))?/);
  if (to?.[1] && !PERSON_SKIP.has(to[1])) {
    if (to[2] && !PERSON_SKIP.has(to[2])) {
      return `${to[1]} ${to[2]}`;
    }
    return to[1];
  }
  const fromTwo = message.match(/\sמ(?!נהל|חברת)([א-ת]{2,12}\s+[א-ת]{2,12})(?:\s|$)/);
  if (fromTwo?.[1] && !PERSON_SKIP.has(fromTwo[1].split(/\s+/)[0] ?? "")) {
    return fromTwo[1];
  }
  const from = message.match(/\sמ(?!נהל|חברת)([א-ת]{2,12})(?:\s|$)/);
  if (from?.[1] && !PERSON_SKIP.has(from[1]) && !FROM_WORD_SKIP.test(`מ${from[1]}`)) {
    return from[1];
  }
  return null;
}

export function parseFieldKind(message: string) {
  const text = message.trim();
  if (
    /קובץ|קבצים|העלאת קובץ|שיעלה קובץ|מסמך|לצרף מסמך|\bfile\b/i.test(text) &&
    !/טקסט/.test(text)
  ) {
    return "file" as const;
  }
  if (/סימון אישור|סימון|^אישור$|confirmation/i.test(text) && !/קובץ|מסמך/.test(text)) {
    return "confirmation" as const;
  }
  if (/טקסט חופשי|^טקסט$|כטקסט|\btext\b/i.test(text)) {
    return "text" as const;
  }
  return null;
}

export function parseTriggerType(message: string) {
  if (/חודשי|monthly/i.test(message) || /(?:בכל\s+)?\d{1,2}\s+בחודש/.test(message)) {
    return "monthly" as const;
  }
  if (/שבועי|weekly|כל שבוע|פעם בשבוע|מדי שבוע/i.test(message)) {
    return "weekly" as const;
  }
  if (/חד־פעמי|חד פעמי|חד-פעמי|once/i.test(message)) {
    return "once" as const;
  }
  if (/ידני|manual/i.test(message)) {
    return "manual" as const;
  }
  if (/עכשיו|מיידי|send_now/i.test(message)) {
    return "send_now" as const;
  }
  return null;
}

export function parseReminderChoice(message: string) {
  if (/ללא תזכורת|none|^לא$/.test(message)) {
    return { decision: "declined" as const, afterHours: null };
  }
  if (/אחרי שבוע|לאחר שבוע|168/.test(message)) {
    return { decision: "enabled" as const, afterHours: 168 };
  }
  if (/אחרי יומיים|לאחר יומיים|48/.test(message)) {
    return { decision: "enabled" as const, afterHours: 48 };
  }
  if (/אחרי יום|לאחר יום|יום אחרי|24 שעות|למחרת|24|^כן$/.test(message)) {
    return { decision: "enabled" as const, afterHours: 24 };
  }
  return null;
}

export function firstEmail(message: string) {
  return extractEmails(message)[0] ?? (looksLikeEmail(message) ? message.trim() : null);
}

export function suggestEmailTypo(email: string) {
  const trimmed = email.trim();
  const at = trimmed.lastIndexOf("@");
  if (at < 0) {
    return null;
  }
  const domain = trimmed.slice(at + 1).toLowerCase();
  const suggestedDomain = EMAIL_TYPOS[domain];
  if (!suggestedDomain) {
    return null;
  }
  return {
    original: trimmed,
    suggested: `${trimmed.slice(0, at)}@${suggestedDomain}`,
    domain,
    suggestedDomain,
  };
}

export function parseEmailTypoChoice(message: string) {
  const text = message.trim();
  if (text === "yes" || /כן.*תקן|לתקן/.test(text) || text === "כן") {
    return "confirm" as const;
  }
  if (text === "no" || /לא.*השאיר|להשאיר/.test(text) || text === "לא") {
    return "keep" as const;
  }
  return null;
}

export function answerLooksParsed(question: SetupQuestion | null, text: string) {
  if (!question) {
    return false;
  }
  const message = text.trim();
  if (!message) {
    return false;
  }
  if (question.options?.some((option) => option.label === message || option.value === message)) {
    return true;
  }
  if (question.key === "email_typo") {
    return parseEmailTypoChoice(message) != null;
  }
  if (question.step === "field_types") {
    return parseFieldKind(message) != null;
  }
  if (question.answerType === "email" || question.key === "recipient_email") {
    return firstEmail(message) != null;
  }
  if (question.step === "trigger") {
    return parseTriggerType(message) != null;
  }
  if (question.key === "weekly_weekday") {
    return extractWeekday(message) != null;
  }
  if (question.key === "monthly_day") {
    return extractMonthDay(message, question) != null;
  }
  if (question.key === "once_date") {
    return extractDate(message) != null;
  }
  if (question.answerType === "time" || question.key.endsWith("_time")) {
    return extractTime(message, { allowBareHour: true }) != null;
  }
  if (question.step === "reminder") {
    return parseReminderChoice(message) != null;
  }
  return false;
}

export function canonicalAnswerForQuestion(question: SetupQuestion, canonical: string) {
  const value = canonical.trim();
  if (!value) {
    return null;
  }
  if (question.options?.length) {
    const match = question.options.find((option) => option.value === value || option.label === value);
    if (match) {
      return match.label;
    }
  }
  if (question.key === "email_typo") {
    return parseEmailTypoChoice(value) ? value : null;
  }
  if (question.step === "field_types") {
    return parseFieldKind(value) ? value : null;
  }
  if (question.answerType === "email" || question.key === "recipient_email") {
    return looksLikeEmail(value) ? value : firstEmail(value);
  }
  if (question.step === "trigger") {
    return parseTriggerType(value) ? value : null;
  }
  if (question.key === "weekly_weekday") {
    return extractWeekday(value) == null ? null : value;
  }
  if (question.key === "monthly_day") {
    return extractMonthDay(value, question) == null ? null : value;
  }
  if (question.key === "once_date") {
    return extractDate(value);
  }
  if (question.answerType === "time" || question.key.endsWith("_time")) {
    return extractTime(value, { allowBareHour: true });
  }
  if (question.step === "reminder") {
    return parseReminderChoice(value) ? value : null;
  }
  return value;
}
