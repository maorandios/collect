import { he } from "@/lib/i18n/he";
import { weekdayLabel } from "@/lib/schedule/labels";
import { isOnceInThePast } from "@/lib/schedule/next-run";
import { unconfiguredFieldsMessage } from "@/lib/workflow/draft-fields";
import type { DraftSchedule, WorkflowDraftDefinition } from "@/lib/workflow/draft-schema";
import { TIMEZONE } from "@/lib/workflow/schema";

export type CompletionIssue = {
  key: string;
  category: "trigger" | "schedule" | "recipient" | "fields" | "email" | "mailbox" | "validation" | "reminder";
  resolution: "chat" | "settings";
  message: string;
  question?: string;
  answerType?: "text" | "email" | "time" | "date" | "single_choice" | "confirmation";
  options?: Array<{ value: string; label: string }>;
  settingsHref?: string;
};

export type MailboxCompletionStatus = "connected" | "disconnected" | "needs_reauth";

export type CompletionState = {
  conversationIssues: CompletionIssue[];
  externalIssues: CompletionIssue[];
  nextQuestions: CompletionIssue[];
  draftComplete: boolean;
  readyToPublish: boolean;
};

export type CompletionOptions = {
  hasMailbox: boolean;
  mailboxStatus?: MailboxCompletionStatus;
  now?: Date;
  userMessage?: string;
};

const EVENT_MODE_OPTIONS = [
  { value: "monthly", label: he.studio.eventMode.monthly },
  { value: "weekly", label: he.studio.eventMode.weekly },
  { value: "once", label: he.studio.eventMode.once },
  { value: "manual", label: he.studio.eventMode.manual },
  { value: "send_now", label: he.studio.eventMode.sendNow },
];

function namedMissingEmail(draft: WorkflowDraftDefinition) {
  return draft.recipients.find((recipient) => recipient.name?.trim() && !recipient.email?.trim()) ?? null;
}

function scheduleTime(schedule: DraftSchedule | undefined) {
  if (!schedule || !("time" in schedule)) {
    return null;
  }
  return schedule.time ?? null;
}

function looksLikeInvalidEmailAttempt(message: string) {
  if (!message.includes("@")) {
    return false;
  }
  return !/[^\s@]+@[^\s@]+\.[^\s@]+/.test(message);
}

function looksLikeAmbiguousTime(message: string) {
  if (/(?:בשעה\s*)?\d{1,2}[:.]\d{2}/.test(message)) {
    return false;
  }
  return /בבוקר|בערב|בצהריים|אחה[״"]?צ|בלילה/.test(message);
}

function conversationIssuesFromDraft(draft: WorkflowDraftDefinition, userMessage?: string): CompletionIssue[] {
  const issues: CompletionIssue[] = [];
  const schedule = draft.schedule;
  const recipientMode = draft.recipientMode ?? "fixed";

  if (!schedule) {
    issues.push({
      key: "event_mode_missing",
      category: "trigger",
      resolution: "chat",
      message: he.workflows.missingEventMode,
      question: "מתי לשלוח את הבקשה?",
      answerType: "single_choice",
      options: EVENT_MODE_OPTIONS,
    });
  } else if (schedule.type === "once") {
    if (!schedule.date) {
      issues.push({
        key: "once_date_missing",
        category: "schedule",
        resolution: "chat",
        message: he.workflows.missingScheduleDate,
        question: "באיזה תאריך לשלוח?",
        answerType: "date",
      });
    }
    if (!scheduleTime(schedule)) {
      issues.push(timeIssue(schedule, userMessage));
    }
    if (schedule.date && scheduleTime(schedule)) {
      const past = isOnceInThePast({
        type: "once",
        date: schedule.date,
        time: schedule.time as string,
        timezone: schedule.timezone ?? TIMEZONE,
      });
      if (past) {
        issues.push({
          key: "once_in_past",
          category: "validation",
          resolution: "chat",
          message: he.workflows.onceInPast,
          question: "המועד שצוין כבר עבר. מה התאריך והשעה החדשים?",
          answerType: "text",
        });
      }
    }
  } else if (schedule.type === "weekly") {
    if (schedule.weekday == null) {
      issues.push({
        key: "weekly_weekday_missing",
        category: "schedule",
        resolution: "chat",
        message: he.workflows.missingScheduleWeekday,
        question: "באיזה יום בשבוע לשלוח?",
        answerType: "single_choice",
        options: [
          { value: "0", label: he.workflow.sunday },
          { value: "1", label: he.workflow.monday },
          { value: "2", label: he.workflow.tuesday },
          { value: "3", label: he.workflow.wednesday },
          { value: "4", label: he.workflow.thursday },
          { value: "5", label: he.workflow.friday },
          { value: "6", label: he.workflow.saturday },
        ],
      });
    }
    if (!scheduleTime(schedule)) {
      issues.push(timeIssue(schedule, userMessage));
    }
  } else if (schedule.type === "monthly") {
    if (schedule.day == null) {
      issues.push({
        key: "monthly_day_missing",
        category: "schedule",
        resolution: "chat",
        message: he.workflows.missingScheduleDay,
        question: "באיזה יום בחודש לשלוח?",
        answerType: "text",
      });
    }
    if (!scheduleTime(schedule)) {
      issues.push(timeIssue(schedule, userMessage));
    }
  }

  if (recipientMode === "at_launch" && schedule && schedule.type !== "manual") {
    issues.push({
      key: "at_launch_needs_manual",
      category: "validation",
      resolution: "chat",
      message: he.workflows.atLaunchNeedsManual,
      question: "בחירת נמען בהפעלה אפשרית רק בתהליך ידני. לשנות לאופן ידני?",
      answerType: "confirmation",
    });
  } else if (recipientMode !== "at_launch") {
    const missingNamed = namedMissingEmail(draft);
    if (missingNamed) {
      const invalid = Boolean(userMessage && looksLikeInvalidEmailAttempt(userMessage));
      issues.push({
        key: invalid ? "recipient_email_invalid" : "recipient_email_missing",
        category: "recipient",
        resolution: "chat",
        message: invalid
          ? `כתובת המייל של ${missingNamed.name?.trim()} אינה תקינה`
          : `חסרה כתובת המייל של ${missingNamed.name?.trim()}`,
        question: invalid ? "כתובת המייל אינה תקינה. מה הכתובת הנכונה?" : "מה כתובת המייל של הנמען?",
        answerType: "email",
      });
    } else if (draft.recipients.every((item) => !item.email?.trim())) {
      issues.push({
        key: "recipient_missing",
        category: "recipient",
        resolution: "chat",
        message: he.workflows.missingRecipients,
        question: "למי לשלוח את הבקשה, ומה כתובת המייל?",
        answerType: "text",
      });
    }
  }

  if (draft.fields.length === 0) {
    issues.push({
      key: "fields_missing",
      category: "fields",
      resolution: "chat",
      message: he.workflows.missingFields,
      question: "מה הנמען צריך למלא בטופס?",
      answerType: "text",
    });
  }

  if (!draft.email.subject.trim() || !draft.email.body.trim()) {
    issues.push({
      key: "email_copy_missing",
      category: "email",
      resolution: "chat",
      message: he.workflows.missingEmail,
      question: "מה צריכים להיות נושא וגוף המייל?",
      answerType: "text",
    });
  }

  const fieldIds = new Set<string>();
  for (const field of draft.fields) {
    if (fieldIds.has(field.id)) {
      issues.push({
        key: "duplicate_field_id",
        category: "validation",
        resolution: "chat",
        message: he.workflows.duplicateFieldId,
        question: "יש שדות כפולים בטופס. אילו שדות להשאיר?",
        answerType: "text",
      });
      break;
    }
    fieldIds.add(field.id);
  }

  return issues;
}

function timeIssue(schedule: DraftSchedule, userMessage?: string): CompletionIssue {
  const ambiguous = Boolean(userMessage && looksLikeAmbiguousTime(userMessage));
  const dayHint =
    schedule.type === "monthly" && schedule.day != null
      ? `ביום ה־${schedule.day}`
      : schedule.type === "weekly" && schedule.weekday != null
        ? `ב${weekdayLabel(schedule.weekday)}`
        : schedule.type === "once" && schedule.date
          ? `ב־${schedule.date}`
          : "";
  return {
    key: ambiguous ? "schedule_time_ambiguous" : "monthly_time_missing",
    category: "schedule",
    resolution: "chat",
    message: ambiguous ? "שעת השליחה אינה חד־משמעית" : he.workflows.missingScheduleTime,
    question: ambiguous
      ? "לא הבנתי את השעה. באיזו שעה מדויקת לשלוח? למשל 09:00."
      : dayHint
        ? `באיזו שעה ${dayHint} לשלוח?`
        : "באיזו שעה לשלוח?",
    answerType: "time",
  };
}

function externalIssuesFromMailbox(options: CompletionOptions): CompletionIssue[] {
  if (options.hasMailbox && (options.mailboxStatus ?? "connected") === "connected") {
    return [];
  }
  if (options.mailboxStatus === "needs_reauth") {
    return [
      {
        key: "gmail_needs_reauth",
        category: "mailbox",
        resolution: "settings",
        message: he.statuses.needs_reauth,
        settingsHref: "/settings",
      },
    ];
  }
  return [
    {
      key: "gmail_disconnected",
      category: "mailbox",
      resolution: "settings",
      message: he.studio.gmailDisconnected,
      settingsHref: "/settings",
    },
  ];
}

const QUESTION_ORDER = [
  "event_mode_missing",
  "once_date_missing",
  "monthly_day_missing",
  "weekly_weekday_missing",
  "recipient_mode_missing",
  "recipient_missing",
  "recipient_email_invalid",
  "recipient_email_missing",
  "schedule_time_ambiguous",
  "monthly_time_missing",
  "fields_missing",
  "email_copy_missing",
  "at_launch_needs_manual",
  "once_in_past",
  "duplicate_field_id",
];

export function selectNextQuestions(issues: CompletionIssue[]) {
  const byKey = new Map(issues.filter((issue) => issue.question).map((issue) => [issue.key, issue]));
  const ranked = QUESTION_ORDER.map((key) => byKey.get(key)).filter((issue): issue is CompletionIssue => Boolean(issue));
  const emailIssue = ranked.find((issue) => issue.key.startsWith("recipient_email") || issue.key === "recipient_missing");
  const timeIssueItem = ranked.find((issue) => issue.key.includes("time"));
  const weekdayIssue = ranked.find((issue) => issue.key === "weekly_weekday_missing");
  if (weekdayIssue && timeIssueItem && emailIssue) {
    return [weekdayIssue, timeIssueItem, emailIssue];
  }
  if (emailIssue && timeIssueItem) {
    return [emailIssue, timeIssueItem];
  }
  if (weekdayIssue && timeIssueItem) {
    return [weekdayIssue, timeIssueItem];
  }
  return ranked.slice(0, 2);
}

export function reminderOfferIssue(): CompletionIssue {
  return {
    key: "reminder_offer",
    category: "reminder",
    resolution: "chat",
    message: he.studio.reminderOffer,
    question: he.studio.reminderOffer,
    answerType: "single_choice",
    options: [
      { value: "24", label: he.studio.reminderAfterDay },
      { value: "48", label: he.studio.reminderAfterTwoDays },
      { value: "168", label: he.studio.reminderAfterWeek },
      { value: "none", label: he.workflow.reminderOff },
    ],
  };
}

export function shouldOfferReminder(draft: WorkflowDraftDefinition) {
  return (draft.reminderDecision ?? "unset") === "unset";
}

export function getCompletionState(
  draft: WorkflowDraftDefinition,
  options: CompletionOptions,
): CompletionState {
  const conversationIssues = conversationIssuesFromDraft(draft, options.userMessage);
  const mailboxIssues = externalIssuesFromMailbox(options);
  const unconfiguredMessage = unconfiguredFieldsMessage(draft.fields);
  const unconfiguredIssues: CompletionIssue[] = unconfiguredMessage
    ? [
        {
          key: "unconfigured_fields",
          category: "fields",
          resolution: "settings",
          message: unconfiguredMessage,
        },
      ]
    : [];
  const externalIssues = [...mailboxIssues, ...unconfiguredIssues];
  const draftComplete = conversationIssues.length === 0;
  const nextQuestions = draftComplete
    ? shouldOfferReminder(draft)
      ? [reminderOfferIssue()]
      : []
    : selectNextQuestions(conversationIssues);
  return {
    conversationIssues,
    externalIssues,
    nextQuestions,
    draftComplete,
    readyToPublish: draftComplete && mailboxIssues.length === 0 && unconfiguredIssues.length === 0,
  };
}

export function combinedQuestionText(questions: CompletionIssue[]) {
  const keys = questions.map((issue) => issue.key);
  const hasWeekday = keys.includes("weekly_weekday_missing");
  const hasTime = keys.some((key) => key.includes("time"));
  const hasEmail = keys.some((key) => key.startsWith("recipient_email") || key === "recipient_missing");
  if (hasWeekday && hasTime && hasEmail) {
    return "באיזה יום ושעה לשלוח, ומה כתובת המייל של הנמען?";
  }
  if (hasWeekday && hasTime) {
    return "באיזה יום ושעה לשלוח?";
  }
  if (hasEmail && hasTime) {
    return "מה כתובת המייל של הנמען ובאיזו שעה לשלוח?";
  }
  const texts = questions.map((issue) => issue.question).filter((value): value is string => Boolean(value));
  if (texts.length === 2 && questions[0]?.answerType === "email" && questions[1]?.answerType === "time") {
    return "מה כתובת המייל של הנמען ובאיזו שעה לשלוח?";
  }
  return texts.join(" ");
}

function collectionHint(draft: WorkflowDraftDefinition) {
  const field = draft.fields[0]?.label.trim();
  if (field) {
    return field.replace(/^בקשה ל/, "");
  }
  const name = draft.name.trim().replace(/^בקשה ל/, "");
  return name || "המידע";
}

function shortSummary(draft: WorkflowDraftDefinition, questions: CompletionIssue[]) {
  const keys = new Set(questions.map((issue) => issue.key));
  const schedule = draft.schedule;
  const askingWeekday = keys.has("weekly_weekday_missing");
  const askingTime = [...keys].some((key) => key.includes("time"));
  const askingDay = keys.has("monthly_day_missing");
  const time =
    schedule && "time" in schedule && schedule.time && !askingTime ? ` לשעה ${schedule.time}` : "";

  if (schedule?.type === "weekly" && askingWeekday && askingTime) {
    return `הגדרתי בקשה שבועית לקבלת ${collectionHint(draft)}.`;
  }
  if (schedule?.type === "weekly" && askingWeekday && time) {
    return `קבעתי שליחה${time}.`;
  }
  if (schedule?.type === "weekly" && askingTime && schedule.weekday != null) {
    return `קבעתי שליחה ב${weekdayLabel(schedule.weekday)}.`;
  }
  if (schedule?.type === "monthly" && schedule.day != null && (askingTime || keys.has("recipient_email_missing"))) {
    return `הגדרתי בקשה חודשית בכל ${schedule.day} בחודש.`;
  }
  if (schedule?.type === "monthly" && askingDay) {
    return "הגדרתי שליחה חודשית.";
  }
  if (schedule?.type === "once" && askingTime && schedule.date) {
    return `קבעתי שליחה ב־${schedule.date}.`;
  }
  if (schedule?.type === "once") {
    return "הגדרתי בקשה חד־פעמית.";
  }
  if (schedule?.type === "manual") {
    return "הגדרתי תהליך להפעלה ידנית.";
  }
  if (schedule?.type === "send_now") {
    return "הגדרתי שליחה מיידית.";
  }
  if (keys.has("event_mode_missing")) {
    return `הגדרתי בקשה לקבלת ${collectionHint(draft)}.`;
  }
  if (keys.has("fields_missing")) {
    return "הגדרתי את אופן השליחה.";
  }
  return "עדכנתי את הטיוטה.";
}

function wordCount(text: string) {
  return text.trim().split(/\s+/).filter(Boolean).length;
}

export function buildLoopAssistantMessage({
  draft,
  completion,
  status,
  hasUnpublishedChanges,
}: {
  draft: WorkflowDraftDefinition;
  completion: CompletionState;
  status?: string;
  hasUnpublishedChanges?: boolean;
}) {
  const offeringReminder = completion.nextQuestions.some((issue) => issue.key === "reminder_offer");
  if (offeringReminder) {
    return he.studio.reminderOffer;
  }
  if (completion.nextQuestions.length > 0) {
    const text = `${shortSummary(draft, completion.nextQuestions)} ${combinedQuestionText(completion.nextQuestions)}`.trim();
    if (wordCount(text) <= 36) {
      return text;
    }
    return combinedQuestionText(completion.nextQuestions);
  }
  if (completion.draftComplete && !completion.readyToPublish) {
    const mailbox = completion.externalIssues.find((issue) => issue.category === "mailbox");
    if (mailbox?.key === "gmail_needs_reauth") {
      return "הגדרת התהליך הושלמה. נשאר להתחבר מחדש ל־Gmail.";
    }
    return he.studio.gmailComplete;
  }
  if (completion.readyToPublish && (status === "active" || status === "paused") && hasUnpublishedChanges) {
    return "השינויים מוכנים לבדיקה. הם עדיין לא הוחלו על התהליך הפעיל.";
  }
  if (completion.readyToPublish) {
    return he.studio.processReady;
  }
  return "עדכנתי את הטיוטה.";
}

export function completionBlockerMessages(completion: CompletionState) {
  return [...completion.conversationIssues, ...completion.externalIssues].map((issue) => issue.message);
}
