import { he } from "@/lib/i18n/he";
import { emptyWorkflowDraft, type WorkflowDraftDefinition } from "@/lib/workflow/draft-schema";
import type { SetupChangePatch } from "@/lib/workflow/setup-extraction";
import { extractTime, parseFieldKind } from "@/lib/workflow/setup-parse";
import { withHebrewArticle } from "@/lib/workflow/setup-identity";
import type { SetupQuestion, SetupRequirement, SetupStatus } from "@/lib/workflow/setup-state";
import { joinHebrewItems } from "@/lib/workflow/setup-extract";

export function unsureMessage(question: SetupQuestion | null) {
  if (!question) {
    return he.studio.setup.didNotUnderstandChange;
  }
  if (question.step === "field_types") {
    return he.studio.setup.didNotUnderstandFieldType;
  }
  if (question.step === "trigger") {
    return he.studio.setup.didNotUnderstandTrigger;
  }
  if (question.key === "email_typo" || question.answerType === "email" || question.key === "recipient_email") {
    return he.studio.setup.didNotUnderstandEmail;
  }
  if (question.answerType === "time" || question.key.endsWith("_time")) {
    return he.studio.setup.didNotUnderstandTime;
  }
  if (question.key === "weekly_weekday") {
    return he.studio.setup.didNotUnderstandWeekday;
  }
  if (question.key === "weekday_or_month_day") {
    return question.question;
  }
  if (question.key === "monthly_day") {
    return he.studio.setup.didNotUnderstandDay;
  }
  if (question.step === "reminder") {
    return he.studio.setup.didNotUnderstandReminder;
  }
  return he.studio.setup.didNotUnderstandChange;
}

export function reviewChangeAck(target: SetupChangePatch["target"] | null) {
  if (target === "weekday") {
    return he.studio.setup.updatedWeekday;
  }
  if (target === "time") {
    return he.studio.setup.updatedTime;
  }
  if (target === "recipient_email" || target === "recipient_name") {
    return he.studio.setup.updatedRecipient;
  }
  if (target === "reminder") {
    return he.studio.setup.updatedReminder;
  }
  return he.studio.setup.updatedGeneric;
}

function fieldTypeAck(question: SetupQuestion, userMessage: string, requirements: SetupRequirement[]) {
  const kind = parseFieldKind(userMessage);
  const item = requirements.find((entry) => entry.id === question.requirementId);
  const label = item ? withHebrewArticle(item.label) : /אישור/.test(question.question) ? "האישור" : "הפריט";
  if (kind === "file") {
    return he.studio.setup.ackFile.replace("{label}", label);
  }
  if (kind === "confirmation") {
    return he.studio.setup.ackConfirmation.replace("{label}", label);
  }
  if (kind === "text") {
    return he.studio.setup.ackText.replace("{label}", label);
  }
  if (kind === "number") {
    return he.studio.setup.ackNumber.replace("{label}", label);
  }
  return null;
}

function cadencePhrase(type: string | undefined) {
  if (type === "monthly") {
    return he.studio.setup.cadenceMonthly;
  }
  if (type === "weekly") {
    return he.studio.setup.cadenceWeekly;
  }
  if (type === "once") {
    return he.studio.setup.cadenceOnce;
  }
  if (type === "manual") {
    return he.studio.setup.cadenceManual;
  }
  return null;
}

function collectedLabels(proposal: WorkflowDraftDefinition, requirements: SetupRequirement[]) {
  if (requirements.length > 0) {
    return requirements.map((item) => item.label);
  }
  return proposal.fields.map((field) => field.label.trim()).filter(Boolean);
}

function questionLine(question: SetupQuestion | null) {
  return question?.question ?? "";
}

export function composeSetupReply({
  currentQuestion,
  proposal,
  acceptedValue,
  previousQuestion,
  firstTurn,
  previousStatus,
  nextStatus,
  changeTarget,
  requirements = [],
}: {
  currentQuestion: SetupQuestion | null;
  proposal: WorkflowDraftDefinition;
  acceptedValue?: string | null;
  previousQuestion: SetupQuestion | null;
  firstTurn?: boolean;
  previousStatus?: SetupStatus;
  nextStatus?: SetupStatus;
  changeTarget?: SetupChangePatch["target"] | null;
  requirements?: SetupRequirement[];
}) {
  if (nextStatus === "review" && previousStatus === "review") {
    return reviewChangeAck(changeTarget ?? null);
  }
  if (nextStatus === "review" && previousQuestion?.key === "change") {
    return reviewChangeAck(changeTarget ?? null);
  }
  if (nextStatus === "review" || currentQuestion?.key === "review") {
    return he.studio.setup.reviewPrompt;
  }

  const next = questionLine(currentQuestion);
  const items = joinHebrewItems(collectedLabels(proposal, requirements));
  const company = proposal.recipients[0]?.organizationName?.trim() ?? "";
  const cadence = cadencePhrase(proposal.schedule?.type);

  if (firstTurn && (items || company) && next) {
    if (company && cadence === he.studio.setup.cadenceMonthly && items) {
      return `${he.studio.setup.firstTurnMonthlyCompany
        .replace("{company}", company)
        .replace("{items}", items)} ${next}`.trim();
    }
    if (company && cadence && items) {
      return `${he.studio.setup.firstTurnCadenceCompany
        .replace("{cadence}", cadence)
        .replace("{company}", company)
        .replace("{items}", items)} ${next}`.trim();
    }
    if (cadence && items) {
      return `${he.studio.setup.firstTurnCadence.replace("{cadence}", cadence).replace("{items}", items)} ${next}`.trim();
    }
    if (items) {
      return `${he.studio.setup.understoodItems.replace("{items}", items)} ${next}`.trim();
    }
  }

  if (previousQuestion?.key === "recipient_contact" || previousQuestion?.key === "contact_name") {
    if (next) {
      return `${he.studio.setup.ackExcellent} ${next}`.trim();
    }
  }

  if (previousQuestion?.key === "monthly_day" || previousQuestion?.key === "weekday_or_month_day") {
    if (currentQuestion?.answerType === "time" || currentQuestion?.key?.endsWith("_time")) {
      return he.studio.setup.askTimeFollowUp;
    }
  }

  if ((previousQuestion?.answerType === "time" || previousQuestion?.key?.endsWith("_time")) && currentQuestion?.key === "reminder") {
    const schedule = proposal.schedule;
    if (schedule?.type === "monthly" && schedule.day != null && schedule.time) {
      const ack =
        schedule.monthlyDayMode === "end_of_month"
          ? he.studio.setup.ackMonthlyEndSend.replace("{time}", schedule.time)
          : he.studio.setup.ackMonthlySend.replace("{day}", String(schedule.day)).replace("{time}", schedule.time);
      return `${ack} ${he.studio.setup.askReminder}`.trim();
    }
    const time = schedule && "time" in schedule ? schedule.time : extractTime(acceptedValue ?? "", { allowBareHour: true });
    if (time) {
      return `${he.studio.setup.ackSetTime.replace("{time}", time)} ${he.studio.setup.askReminder}`.trim();
    }
  }

  if (previousQuestion?.key?.startsWith("field_type:") && acceptedValue) {
    const ack = fieldTypeAck(previousQuestion, acceptedValue, requirements);
    if (ack && next) {
      return `${ack} ${next}`.trim();
    }
  }

  return next || he.studio.setup.reviewPrompt;
}

export function buildSetupAssistantMessage({
  requirements,
  previousQuestion,
  previousStatus,
  nextQuestion,
  nextStatus,
  userMessage,
  firstTurn,
  changeTarget,
  organizationName,
  proposal,
}: {
  requirements: SetupRequirement[];
  previousQuestion?: SetupQuestion | null;
  previousStatus?: SetupStatus;
  nextQuestion: SetupQuestion | null;
  nextStatus?: SetupStatus;
  userMessage?: string;
  firstTurn: boolean;
  changeTarget?: SetupChangePatch["target"] | null;
  organizationName?: string | null;
  proposal?: WorkflowDraftDefinition;
}) {
  const draft: WorkflowDraftDefinition = proposal
    ? proposal
    : {
        ...emptyWorkflowDraft(),
        recipients: [{ name: "", organizationName: organizationName ?? null, email: "" }],
      };
  return composeSetupReply({
    currentQuestion: nextQuestion,
    proposal: draft,
    acceptedValue: userMessage,
    previousQuestion: previousQuestion ?? null,
    firstTurn,
    previousStatus,
    nextStatus,
    changeTarget,
    requirements,
  });
}

export function setupAssistantMustNotAddressUserAs(message: string, contactName: string | null) {
  const contact = contactName?.trim() ?? "";
  if (!contact) {
    return true;
  }
  if (message.includes(`הבקשה תישלח ל${contact}`) || message.includes(`תישלח ל${contact}`)) {
    return true;
  }
  if (message.includes(contact)) {
    return false;
  }
  const first = contact.split(/\s+/)[0] ?? "";
  if (first.length >= 2 && /(תודה|שלום)\s*,/.test(message) && message.includes(first)) {
    return false;
  }
  return true;
}

export function assistantMentionsAllItems(message: string, requirements: SetupRequirement[]) {
  return requirements.every((item) => {
    const token = item.label.split(/\s+/)[0] ?? item.label;
    return message.includes(token);
  });
}
