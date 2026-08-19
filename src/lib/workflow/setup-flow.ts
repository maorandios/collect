import { he } from "@/lib/i18n/he";
import type { DraftSchedule, WorkflowDraftDefinition } from "@/lib/workflow/draft-schema";
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

const FIELD_TYPE_OPTIONS = [
  { value: "file", label: he.studio.setup.fieldTypeFile },
  { value: "confirmation", label: he.studio.setup.fieldTypeConfirmation },
  { value: "text", label: he.studio.setup.fieldTypeText },
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
  state: Pick<WorkflowSetupState, "proposal" | "requirements" | "reminderDecision" | "pendingEmailCorrection">,
): SetupQuestion | null {
  const ambiguous = state.requirements.find((item) => item.kind === "ambiguous");
  if (ambiguous) {
    return {
      key: `field_type:${ambiguous.id}`,
      step: "field_types",
      question: he.studio.setup.askFieldType.replace("{label}", ambiguous.label),
      answerType: "single_choice",
      options: FIELD_TYPE_OPTIONS,
      requirementId: ambiguous.id,
    };
  }

  if (state.proposal.fields.length === 0 && state.requirements.length === 0) {
    return {
      key: "requirements",
      step: "requirements",
      question: he.studio.setup.askRequirements,
      answerType: "text",
    };
  }

  if (state.pendingEmailCorrection) {
    return {
      key: "email_typo",
      step: "recipient",
      question: he.studio.setup.emailTypoAsk
        .replace("{domain}", state.pendingEmailCorrection.domain)
        .replace("{suggested}", state.pendingEmailCorrection.suggestedDomain),
      answerType: "single_choice",
      options: [
        { value: "yes", label: he.studio.setup.emailTypoYes },
        { value: "no", label: he.studio.setup.emailTypoNo },
      ],
    };
  }

  if (!hasRecipient(state.proposal)) {
    const named = state.proposal.recipients.find((item) => item.name?.trim() && !item.email?.trim());
    return {
      key: named ? "recipient_email" : "recipient",
      step: "recipient",
      question: named
        ? he.studio.setup.askRecipientEmail.replace("{name}", named.name?.trim() ?? "")
        : he.studio.setup.askRecipient,
      answerType: named ? "email" : "text",
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
  const question = nextSetupQuestion(state);
  const completed: SetupStep[] = [...state.completedSteps];
  function mark(step: SetupStep) {
    if (!completed.includes(step)) {
      completed.push(step);
    }
  }
  if (state.requirements.length > 0 && !state.requirements.some((item) => item.kind === "ambiguous")) {
    mark("requirements");
    mark("field_types");
  }
  if (hasRecipient(state.proposal) && !state.pendingEmailCorrection) {
    mark("recipient");
  }
  if (state.proposal.schedule) {
    mark("trigger");
    if (!nextScheduleQuestion(state.proposal.schedule)) {
      mark("schedule_details");
    }
  }
  if (state.reminderDecision !== "not_asked") {
    mark("reminder");
  }
  const atReview = question?.step === "review";
  if (atReview) {
    mark("review");
  }
  return {
    ...state,
    status: atReview ? "review" : "collecting",
    completedSteps: completed,
    currentStep: question?.step ?? "review",
    nextQuestion: atReview ? question : question,
    conflict: false,
    updatedAt: new Date().toISOString(),
  };
}
