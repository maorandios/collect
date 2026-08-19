import { he } from "@/lib/i18n/he";
import type { SetupChangePatch } from "@/lib/workflow/setup-extraction";
import { extractTime, parseFieldKind } from "@/lib/workflow/setup-parse";
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

function fieldTypeAck(question: SetupQuestion, userMessage: string) {
  const kind = parseFieldKind(userMessage);
  const label = /אישור/.test(question.question) ? "האישור" : "הפריט";
  if (kind === "file") {
    return he.studio.setup.ackFile.replace("{label}", label);
  }
  if (kind === "confirmation") {
    return he.studio.setup.ackConfirmation.replace("{label}", label);
  }
  if (kind === "text") {
    return he.studio.setup.ackText.replace("{label}", label);
  }
  return null;
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
}: {
  requirements: SetupRequirement[];
  previousQuestion?: SetupQuestion | null;
  previousStatus?: SetupStatus;
  nextQuestion: SetupQuestion | null;
  nextStatus?: SetupStatus;
  userMessage?: string;
  firstTurn: boolean;
  changeTarget?: SetupChangePatch["target"] | null;
}) {
  if (nextStatus === "review" && previousStatus === "review") {
    return reviewChangeAck(changeTarget ?? null);
  }
  if (nextStatus === "review" && previousQuestion?.key === "change") {
    return reviewChangeAck(changeTarget ?? null);
  }
  if (nextStatus === "review" || nextQuestion?.key === "review") {
    return he.studio.setup.reviewPrompt;
  }

  const next = nextQuestion?.question ?? "";
  if (firstTurn && requirements.length > 0 && next) {
    const understood = he.studio.setup.understoodItems.replace(
      "{items}",
      joinHebrewItems(requirements.map((item) => item.label)),
    );
    return `${understood} ${next}`.trim();
  }

  if (previousQuestion?.step === "field_types" && userMessage) {
    const ack = fieldTypeAck(previousQuestion, userMessage);
    if (ack && next) {
      return `${ack} ${next}`.trim();
    }
  }

  if ((previousQuestion?.answerType === "time" || previousQuestion?.key.endsWith("_time")) && userMessage) {
    const time = extractTime(userMessage, { allowBareHour: true });
    if (time && next) {
      return `${he.studio.setup.ackSetTime.replace("{time}", time)} ${next}`.trim();
    }
  }

  return next || he.studio.setup.reviewPrompt;
}

export function assistantMentionsAllItems(message: string, requirements: SetupRequirement[]) {
  return requirements.every((item) => {
    const token = item.label.split(/\s+/)[0] ?? item.label;
    return message.includes(token);
  });
}
