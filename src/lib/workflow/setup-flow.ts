import { he } from "@/lib/i18n/he";
import type { DraftSchedule, WorkflowDraftDefinition } from "@/lib/workflow/draft-schema";
import { syncProposalEmail } from "@/lib/workflow/setup-email";
import { assertContactNotSkipped } from "@/lib/workflow/setup-identity";
import type { SetupQuestion, SetupStep, WorkflowSetupState } from "@/lib/workflow/setup-state";

const TRIGGER_OPTIONS = [
  { value: "once", label: he.studio.setup.triggerOnce },
  { value: "weekly", label: he.studio.setup.triggerWeekly },
  { value: "monthly", label: he.studio.setup.triggerMonthly },
  { value: "manual", label: he.studio.setup.triggerManual },
];

const REMINDER_OPTIONS = [
  { value: "24", label: he.studio.reminderAfterDay },
  { value: "48", label: he.studio.reminderAfterTwoDays },
  { value: "168", label: he.studio.reminderAfterWeek },
  { value: "none", label: he.workflow.reminderOff },
];

const WEEKDAY_OPTIONS = [
  { value: "0", label: he.studio.setup.weekdaySunday },
  { value: "1", label: he.studio.setup.weekdayMonday },
  { value: "2", label: he.studio.setup.weekdayTuesday },
  { value: "3", label: he.studio.setup.weekdayWednesday },
  { value: "4", label: he.studio.setup.weekdayThursday },
  { value: "5", label: he.studio.setup.weekdayFriday },
  { value: "6", label: he.studio.setup.weekdaySaturday },
];

const MONTH_DAY_OPTIONS = [
  { value: "1", label: he.studio.setup.monthDayQuick1 },
  { value: "10", label: he.studio.setup.monthDayQuick10 },
  { value: "15", label: he.studio.setup.monthDayQuick15 },
  { value: "20", label: he.studio.setup.monthDayQuick20 },
  { value: "25", label: he.studio.setup.monthDayQuick25 },
  { value: "31", label: he.studio.setup.monthDayEnd },
];

function scheduleTime(schedule: DraftSchedule | undefined) {
  if (!schedule || !("time" in schedule)) {
    return null;
  }
  return schedule.time ?? null;
}

function hasRecipient(draft: WorkflowDraftDefinition) {
  if (draft.recipientMode === "at_launch") {
    return true;
  }
  return draft.recipients.some((item) => item.email?.trim());
}

function nextScheduleQuestion(schedule: DraftSchedule): SetupQuestion | null {
  if (schedule.type === "once") {
    if (!schedule.date) {
      return {
        key: "once_date",
        step: "schedule_details",
        question: he.studio.setup.askOnceDate,
        answerType: "date",
      };
    }
    if (!scheduleTime(schedule)) {
      return {
        key: "once_time",
        step: "schedule_details",
        question: he.studio.setup.askTime,
        answerType: "time",
      };
    }
    return null;
  }
  if (schedule.type === "weekly") {
    if (schedule.weekday == null) {
      return {
        key: "weekly_weekday",
        step: "schedule_details",
        question: he.studio.setup.askWeekday,
        answerType: "single_choice",
        options: WEEKDAY_OPTIONS,
      };
    }
    if (!scheduleTime(schedule)) {
      return {
        key: "weekly_time",
        step: "schedule_details",
        question: he.studio.setup.askTime,
        answerType: "time",
      };
    }
    return null;
  }
  if (schedule.type === "monthly") {
    if (schedule.day == null) {
      return {
        key: "monthly_day",
        step: "schedule_details",
        question: he.studio.setup.askMonthDay,
        answerType: "text",
        options: MONTH_DAY_OPTIONS,
      };
    }
    if (!scheduleTime(schedule)) {
      return {
        key: "monthly_time",
        step: "schedule_details",
        question: he.studio.setup.askTime,
        answerType: "time",
      };
    }
    return null;
  }
  return null;
}

export function nextSetupQuestion(
  state: Pick<
    WorkflowSetupState,
    | "proposal"
    | "requirements"
    | "reminderDecision"
    | "pendingEmailCorrection"
    | "contactPersonStatus"
    | "recipientIdentity"
    | "pendingCompanyConfirm"
    | "pendingWeekdayOrMonthDay"
    | "awaitingCompanyName"
  >,
): SetupQuestion | null {
  if (state.proposal.fields.length === 0 && state.requirements.length === 0) {
    return {
      key: "requirements",
      step: "requirements",
      question: he.studio.setup.askRequirements,
      answerType: "text",
    };
  }

  if (state.awaitingCompanyName) {
    return {
      key: "company_name",
      step: "recipient",
      question: he.studio.setup.askCompanyName,
      answerType: "text",
    };
  }

  if (state.pendingCompanyConfirm) {
    return {
      key: "company_confirm",
      step: "recipient",
      question: he.studio.setup.confirmCompany.replace("{company}", state.pendingCompanyConfirm),
      answerType: "single_choice",
      options: [
        { value: "yes", label: he.studio.setup.confirmCompanyYes },
        { value: "change", label: he.studio.setup.confirmCompanyChange },
      ],
    };
  }

  if (state.pendingEmailCorrection) {
    const pending = state.pendingEmailCorrection;
    const suggested = pending.suggested || pending.suggestedDomain;
    const question =
      pending.reason === "comma_in_domain" && suggested
        ? he.studio.setup.emailCommaInDomain.replace("{email}", suggested)
        : pending.reason === "common_domain_typo" && suggested
          ? he.studio.setup.emailCommonTypo.replace("{email}", suggested)
          : he.studio.setup.emailTypoAsk
              .replace("{domain}", pending.domain ?? "")
              .replace("{suggested}", suggested ?? "");
    return {
      key: "email_typo",
      step: "recipient",
      question,
      answerType: "single_choice",
      options: [
        { value: "yes", label: he.studio.setup.emailTypoYes },
        {
          value: "rewrite",
          label:
            pending.reason === "common_domain_typo"
              ? he.studio.setup.emailTypoRewriteNo
              : he.studio.setup.emailTypoRewrite,
        },
      ],
    };
  }

  const identity = state.recipientIdentity;
  const organization = identity.organizationName?.trim() || state.proposal.recipients[0]?.organizationName?.trim() || "";
  const contactName = identity.contactResolution === "named" ? identity.contactName?.trim() || "" : "";
  const contactResolved = identity.contactResolution !== "pending";

  if (!contactResolved) {
    return {
      key: "contact_name",
      step: "recipient",
      question: organization
        ? he.studio.setup.askContactPerson
        : he.studio.setup.askContactPersonGeneric,
      answerType: "text",
      options: [{ value: "none", label: he.studio.setup.noFixedContact }],
    };
  }

  if (!hasRecipient(state.proposal)) {
    return {
      key: contactName || organization ? "recipient_email" : "recipient",
      step: "recipient",
      question:
        contactName || organization ? he.studio.setup.askRecipientEmail : he.studio.setup.askRecipient,
      answerType: contactName || organization ? "email" : "text",
    };
  }

  if (!state.proposal.schedule) {
    return {
      key: "trigger",
      step: "trigger",
      question: he.studio.setup.askTrigger,
      answerType: "single_choice",
      options: TRIGGER_OPTIONS,
    };
  }

  if (state.pendingWeekdayOrMonthDay) {
    const pending = state.pendingWeekdayOrMonthDay;
    return {
      key: "weekday_or_month_day",
      step: "schedule_details",
      question: he.studio.setup.askWeekdayOrMonthDay
        .replace("{weekday}", pending.weekdayLabel)
        .replace("{day}", String(pending.monthDay)),
      answerType: "single_choice",
      options: [
        {
          value: "weekly",
          label: he.studio.setup.weekdayEveryWeek.replace("{weekday}", pending.weekdayLabel),
        },
        {
          value: "month",
          label: he.studio.setup.monthDayChoice.replace("{day}", String(pending.monthDay)),
        },
      ],
    };
  }

  const scheduleQuestion = nextScheduleQuestion(state.proposal.schedule);
  if (scheduleQuestion) {
    return scheduleQuestion;
  }

  if (state.reminderDecision === "not_asked") {
    return {
      key: "reminder",
      step: "reminder",
      question: he.studio.setup.askReminder,
      answerType: "single_choice",
      options: REMINDER_OPTIONS,
    };
  }

  return {
    key: "review",
    step: "review",
    question: he.studio.setup.reviewPrompt,
    answerType: "confirmation",
    options: [
      { value: "apply", label: he.studio.setup.buildProcess },
      { value: "edit", label: he.studio.setup.changeDetails },
    ],
  };
}

const PROGRESS_ORDER: Array<{ id: SetupStep; group: 1 | 2 | 3 | 4 | 5 }> = [
  { id: "requirements", group: 1 },
  { id: "field_types", group: 1 },
  { id: "recipient", group: 2 },
  { id: "trigger", group: 3 },
  { id: "schedule_details", group: 3 },
  { id: "reminder", group: 4 },
  { id: "review", group: 5 },
];

export function setupProgress(state: WorkflowSetupState) {
  const currentGroup = PROGRESS_ORDER.find((item) => item.id === (state.nextQuestion?.step ?? state.currentStep))?.group ?? 1;
  return {
    current: currentGroup,
    total: 5,
    groups: [
      { id: 1, label: he.studio.setup.progressInfo, done: currentGroup > 1 },
      { id: 2, label: he.studio.setup.progressRecipient, done: currentGroup > 2 },
      { id: 3, label: he.studio.setup.progressSchedule, done: currentGroup > 3 },
      { id: 4, label: he.studio.setup.progressReminder, done: currentGroup > 4 },
      { id: 5, label: he.studio.setup.progressReview, done: state.status === "review" || state.status === "completed" },
    ],
  };
}

export function advanceSetup(state: WorkflowSetupState): WorkflowSetupState {
  const proposal = syncProposalEmail(state.proposal);
  const withEmail = { ...state, proposal };
  const question = nextSetupQuestion(withEmail);
  assertContactNotSkipped(withEmail, question);
  if (question?.key === "review" && withEmail.recipientIdentity.contactResolution === "pending") {
    throw new Error("contact_question_skipped");
  }
  const completed: SetupStep[] = [...state.completedSteps];
  function mark(step: SetupStep) {
    if (!completed.includes(step)) {
      completed.push(step);
    }
  }
  if (state.requirements.length > 0) {
    mark("requirements");
    mark("field_types");
  }
  if (
    hasRecipient(withEmail.proposal) &&
    !withEmail.pendingEmailCorrection &&
    !withEmail.pendingCompanyConfirm &&
    question?.step !== "recipient"
  ) {
    mark("recipient");
  }
  if (withEmail.proposal.schedule) {
    mark("trigger");
    if (!state.pendingWeekdayOrMonthDay && !nextScheduleQuestion(withEmail.proposal.schedule)) {
      mark("schedule_details");
    }
  }
  if (withEmail.reminderDecision !== "not_asked") {
    mark("reminder");
  }
  const atReview = question?.step === "review";
  if (atReview) {
    mark("review");
  }
  return {
    ...withEmail,
    status: atReview ? "review" : state.status === "completed" ? "completed" : "collecting",
    conversationMode: atReview ? "review" : state.conversationMode === "edit" ? "edit" : "setup",
    completedSteps: completed,
    currentStep: question?.step ?? "review",
    nextQuestion: question,
    conflict: false,
    updatedAt: new Date().toISOString(),
  };
}
