import { he } from "@/lib/i18n/he";
import { extractEmails } from "@/lib/workflow/setup-extract";
import { extractContactPerson } from "@/lib/workflow/setup-identity";
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


const EMAIL_TYPOS: Record<string, string> = {
  "gmial.com": "gmail.com",
  "gamil.com": "gmail.com",
  "gmai.com": "gmail.com",
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

export type EmailValidationReason =
  | "comma_in_domain"
  | "missing_at"
  | "multiple_at"
  | "contains_space"
  | "missing_tld"
  | "common_domain_typo"
  | "invalid_structure";

export type EmailValidationResult =
  | { valid: true; normalizedEmail: string }
  | { valid: false; reason: EmailValidationReason; suggestion?: string };

export function looksLikeEmailAttempt(message: string) {
  const text = message.replace(/\\@/g, "@").trim();
  if (!text) {
    return false;
  }
  return /@/.test(text) || /gmail|hotmail|outlook/i.test(text) || /^[A-Za-z0-9._%+-]+\.[A-Za-z]{2,}$/.test(text);
}

export function validateEmail(raw: string): EmailValidationResult {
  const input = raw.replace(/\\@/g, "@").trim();
  if (!input) {
    return { valid: false, reason: "invalid_structure" };
  }
  if (input.includes(",") && /@[^@]*,/.test(input)) {
    const suggestion = input.replace(",", ".");
    const nested = validateEmail(suggestion);
    return {
      valid: false,
      reason: "comma_in_domain",
      suggestion: nested.valid ? nested.normalizedEmail : suggestion,
    };
  }
  if (/\s/.test(input)) {
    return { valid: false, reason: "contains_space" };
  }
  const atCount = (input.match(/@/g) ?? []).length;
  if (atCount === 0) {
    return { valid: false, reason: "missing_at" };
  }
  if (atCount > 1) {
    return { valid: false, reason: "multiple_at" };
  }
  const at = input.indexOf("@");
  const local = input.slice(0, at);
  const domain = input.slice(at + 1);
  if (!local || !domain) {
    return { valid: false, reason: "invalid_structure" };
  }
  const suggestedDomain = EMAIL_TYPOS[domain.toLowerCase()];
  if (suggestedDomain) {
    return { valid: false, reason: "common_domain_typo", suggestion: `${local}@${suggestedDomain}` };
  }
  if (!domain.includes(".")) {
    return { valid: false, reason: "missing_tld" };
  }
  if (!looksLikeEmail(input)) {
    return { valid: false, reason: "invalid_structure" };
  }
  return { valid: true, normalizedEmail: input };
}

export function emailValidationMessage(result: Extract<EmailValidationResult, { valid: false }>) {
  if (result.reason === "comma_in_domain" && result.suggestion) {
    return he.studio.setup.emailCommaInDomain.replace("{email}", result.suggestion);
  }
  if (result.reason === "missing_at") {
    return he.studio.setup.emailMissingAt;
  }
  if (result.reason === "multiple_at") {
    return he.studio.setup.emailMultipleAt;
  }
  if (result.reason === "contains_space") {
    return he.studio.setup.emailContainsSpace;
  }
  if (result.reason === "missing_tld") {
    return he.studio.setup.emailMissingTld;
  }
  if (result.reason === "common_domain_typo" && result.suggestion) {
    return he.studio.setup.emailCommonTypo.replace("{email}", result.suggestion);
  }
  return he.studio.setup.emailInvalidStructure;
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

const HEBREW_MONTH_DAY_WORDS: Array<{ day: number; pattern: RegExp }> = [
  { day: 31, pattern: /סוף החודש|האחרון בחודש|סוף חודש/ },
  { day: 21, pattern: /ה?עשרים ואחד/ },
  { day: 22, pattern: /ה?עשרים ו(?:שתיים|שתים)/ },
  { day: 10, pattern: /(?:^|\s)ה?עשרה(?:\s|$)/ },
  { day: 9, pattern: /(?:^|\s)ה?תשעה(?:\s|$)/ },
  { day: 8, pattern: /(?:^|\s)ה?שמונה(?:\s|$)/ },
  { day: 7, pattern: /(?:^|\s)ה?שבעה(?:\s|$)/ },
  { day: 6, pattern: /(?:^|\s)ה?שישה(?:\s|$)/ },
  { day: 5, pattern: /(?:^|\s)ה?חמישה(?:\s|$)/ },
  { day: 4, pattern: /(?:^|\s)ה?ארבעה(?:\s|$)/ },
  { day: 3, pattern: /(?:^|\s)ה?שלושה(?:\s|$)/ },
  { day: 2, pattern: /(?:^|\s)ה?(?:שניים|שתיים|שתים)(?:\s|$)/ },
  { day: 1, pattern: /(?:^|\s)ה?אחד(?:\s|$)/ },
];

const WEEKDAY_NAME = "ראשון|שני|שלישי|רביעי|חמישי|שישי|שבת";
const BARE_WEEKDAY = new RegExp(`^(?:ביום\\s+|יום\\s+)?ה?(${WEEKDAY_NAME})$`, "u");
const WEEKDAY_LABELS = ["ראשון", "שני", "שלישי", "רביעי", "חמישי", "שישי", "שבת"] as const;

function clampMonthDay(day: number) {
  return day >= 1 && day <= 31 ? day : null;
}

export function weekdayLabel(weekday: number) {
  return WEEKDAY_LABELS[weekday] ?? "";
}

export function extractBareWeekdayName(message: string) {
  const text = message.trim();
  if (!BARE_WEEKDAY.test(text)) {
    return null;
  }
  return extractWeekday(text.replace(/^(?:ביום|יום)\s+/u, "").replace(/^ה/, ""));
}

export function parseMonthlyDayMode(message: string): "end_of_month" | "specific_day" {
  return /סוף החודש|האחרון בחודש|סוף חודש|end_of_month/.test(message.trim())
    ? "end_of_month"
    : "specific_day";
}

export function extractMonthDay(message: string, question: SetupQuestion | null) {
  const text = message.trim();
  if (extractBareWeekdayName(text) != null) {
    return null;
  }
  const dated = text.match(/בתאריך\s+(\d{1,2})/);
  if (dated) {
    return clampMonthDay(Number(dated[1]));
  }
  const everyMonth = text.match(/(\d{1,2})\s+בכל\s+חודש/);
  if (everyMonth) {
    return clampMonthDay(Number(everyMonth[1]));
  }
  const month = text.match(/(?:בכל\s+)?(\d{1,2})\s+בחודש/);
  if (month) {
    return clampMonthDay(Number(month[1]));
  }
  const prefixed = text.match(/^ב[-\s־]?(\d{1,2})$/u);
  if (prefixed) {
    return clampMonthDay(Number(prefixed[1]));
  }
  for (const item of HEBREW_MONTH_DAY_WORDS) {
    if (item.pattern.test(text)) {
      return item.day;
    }
  }
  if (question?.key === "monthly_day" || question?.key === "change" || question?.key === "weekday_or_month_day") {
    const only = text.match(/^\s*(\d{1,2})\s*$/);
    if (only) {
      return clampMonthDay(Number(only[1]));
    }
  }
  return null;
}

export function parseWeekdayOrMonthDayChoice(
  message: string,
  pending: { weekday: number; monthDay: number } | null,
) {
  const text = message.trim();
  if (!text) {
    return null;
  }
  if (text === "weekly" || /בכל שבוע|שבועי/.test(text)) {
    return { kind: "weekly" as const };
  }
  if (text === "month" || text === "monthly") {
    return { kind: "month" as const, day: pending?.monthDay ?? null };
  }
  const day = extractMonthDay(text, { key: "weekday_or_month_day", step: "schedule_details", question: text, answerType: "text" });
  if (day != null) {
    return { kind: "month" as const, day };
  }
  if (pending && text === String(pending.monthDay)) {
    return { kind: "month" as const, day: pending.monthDay };
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
  return extractContactPerson(message)?.value ?? null;
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
  if (/^מספר$|כמספר|\bnumber\b/i.test(text)) {
    return "number" as const;
  }
  return null;
}

export type SetupScheduleIntent = "once" | "weekly" | "monthly" | "manual" | "send_now" | "daily";

export function parseScheduleIntent(message: string): SetupScheduleIntent | null {
  const text = message.trim();
  if (!text) {
    return null;
  }
  if (new RegExp(`(?:כל יום|בימי)\\s+(?:${WEEKDAY_NAME})`, "u").test(text)) {
    return "weekly";
  }
  if (
    /כל חודש|מדי חודש|פעם בחודש|בכל חודש|חודשי|בקשה חודשית|תהליך חודשי|monthly|(?:בכל\s+)?\d{1,2}\s+בחודש/i.test(
      text,
    )
  ) {
    return "monthly";
  }
  if (/כל שבוע|מדי שבוע|פעם בשבוע|שבועי|תהליך שבועי|weekly/i.test(text)) {
    return "weekly";
  }
  if (new RegExp(`כל יום(?!\\s+(?:${WEEKDAY_NAME}))`, "u").test(text) || /\bdaily\b/i.test(text)) {
    return "daily";
  }
  if (/באופן חד[־\-\s]?פעמי|פעם אחת|חד[־\-\s]?פעמי|\bonce\b/i.test(text)) {
    return "once";
  }
  if (/לפי הצורך|ידני|manual/i.test(text)) {
    return "manual";
  }
  if (/עכשיו|מיידי|send_now/i.test(text)) {
    return "send_now";
  }
  return null;
}

export function parseTriggerType(message: string) {
  const intent = parseScheduleIntent(message);
  if (!intent || intent === "daily") {
    return null;
  }
  return intent;
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
  const cleaned = message.replace(/\\@/g, "@");
  return extractEmails(cleaned)[0] ?? (looksLikeEmail(cleaned) ? cleaned.trim() : null);
}

export function parseNoFixedContact(message: string) {
  return /אין איש קשר/.test(message.trim());
}

export function parseCompanyConfirm(message: string) {
  const text = message.trim();
  if (text === "yes" || text === "כן") {
    return "confirm" as const;
  }
  if (/שינוי שם/.test(text)) {
    return "change" as const;
  }
  return null;
}

export function suggestEmailTypo(email: string) {
  const result = validateEmail(email);
  if (result.valid || !result.suggestion) {
    return null;
  }
  const at = result.suggestion.lastIndexOf("@");
  return {
    original: email.replace(/\\@/g, "@").trim(),
    suggested: result.suggestion,
    domain: email.replace(/\\@/g, "@").trim().slice(email.replace(/\\@/g, "@").trim().lastIndexOf("@") + 1).toLowerCase(),
    suggestedDomain: result.suggestion.slice(at + 1),
    reason: result.reason,
  };
}

export function parseEmailTypoChoice(message: string) {
  const text = message.trim();
  if (text === "yes" || /כן.*תקן|לתקן/.test(text) || text === he.studio.setup.emailTypoYes) {
    return "confirm" as const;
  }
  if (
    text === "no" ||
    text === "rewrite" ||
    /אכתוב מחדש|לא,\s*אכתוב|לא.*השאיר|להשאיר/.test(text) ||
    text === he.studio.setup.emailTypoRewrite ||
    text === he.studio.setup.emailTypoRewriteNo
  ) {
    return "rewrite" as const;
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
    return parseEmailTypoChoice(message) != null || validateEmail(message).valid;
  }
  if (question.key === "company_confirm") {
    return parseCompanyConfirm(message) != null;
  }
  if (question.key === "company_name" || question.key === "recipient_contact" || question.key === "contact_name") {
    return message.length >= 2;
  }
  if (question.key.startsWith("field_type:")) {
    return parseFieldKind(message) != null;
  }
  if (question.step === "field_types") {
    return parseFieldKind(message) != null;
  }
  if (question.answerType === "email" || question.key === "recipient_email") {
    return looksLikeEmailAttempt(message) || firstEmail(message) != null;
  }
  if (question.step === "trigger") {
    return parseTriggerType(message) != null;
  }
  if (question.key === "weekly_weekday") {
    return extractWeekday(message) != null;
  }
  if (question.key === "monthly_day") {
    return extractMonthDay(message, question) != null || extractBareWeekdayName(message) != null;
  }
  if (question.key === "weekday_or_month_day") {
    return parseWeekdayOrMonthDayChoice(message, null) != null || extractBareWeekdayName(message) != null;
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
    return parseEmailTypoChoice(value) ? value : validateEmail(value).valid ? value : null;
  }
  if (question.key === "company_confirm") {
    return parseCompanyConfirm(value) ? value : null;
  }
  if (question.key === "company_name" || question.key === "recipient_contact" || question.key === "contact_name") {
    return value.length >= 2 ? value : null;
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
    if (extractBareWeekdayName(value) != null) {
      return value;
    }
    return extractMonthDay(value, question) == null ? null : value;
  }
  if (question.key === "weekday_or_month_day") {
    return parseWeekdayOrMonthDayChoice(value, null) || extractBareWeekdayName(value) != null ? value : null;
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
