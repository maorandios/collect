import { he } from "@/lib/i18n/he";
import { unconfiguredFields, unconfiguredFieldsMessage } from "@/lib/workflow/draft-fields";
import { getDraftRecipient } from "@/lib/workflow/draft-canonical";
import type { WorkflowDraftDefinition } from "@/lib/workflow/draft-schema";
import { getSchedulePublishIssues } from "@/lib/workflow/publish";
import { validateEmail } from "@/lib/workflow/setup-parse";

export type WizardStepId = "items" | "recipient" | "schedule" | "preview" | "activation";

const WIZARD_STEPS: WizardStepId[] = ["items", "recipient", "schedule", "preview", "activation"];

export function parseWizardStep(value: string | string[] | undefined): WizardStepId {
  const step = Array.isArray(value) ? value[0] : value;
  return WIZARD_STEPS.includes(step as WizardStepId) ? (step as WizardStepId) : "items";
}

export type WizardStepCompletion = {
  complete: boolean;
  issues: string[];
};

export type WizardCompletion = {
  steps: Record<WizardStepId, WizardStepCompletion>;
  readyToPublish: boolean;
};

function step(issues: string[]): WizardStepCompletion {
  return { complete: issues.length === 0, issues };
}

export function getWizardCompletion(draft: WorkflowDraftDefinition): WizardCompletion {
  const itemsIssues: string[] = [];
  if (draft.fields.length === 0) {
    itemsIssues.push(he.workflows.missingFields);
  }
  const unconfigured = unconfiguredFieldsMessage(draft.fields);
  if (unconfigured) {
    itemsIssues.push(unconfigured);
  }

  const recipient = getDraftRecipient(draft);
  const recipientIssues: string[] = [];
  if (draft.recipientMode === "at_launch") {
    if (draft.schedule && draft.schedule.type !== "manual") {
      recipientIssues.push(he.workflows.atLaunchNeedsManual);
    }
  } else if (!recipient.email?.trim()) {
    recipientIssues.push(he.workflows.missingRecipients);
  } else {
    const checked = validateEmail(recipient.email);
    if (!checked.valid) {
      recipientIssues.push(he.studio.setup.emailInvalidStructure);
    }
  }

  const scheduleIssues = getSchedulePublishIssues(draft.schedule);

  const previewIssues: string[] = [];
  if (!draft.email.subject.trim() || !draft.email.body.trim()) {
    previewIssues.push(he.workflows.missingEmail);
  }

  const activationIssues: string[] = [];
  if (!draft.name.trim()) {
    activationIssues.push(he.workflows.missingName);
  }
  activationIssues.push(...itemsIssues, ...recipientIssues, ...scheduleIssues, ...previewIssues);

  const steps: WizardCompletion["steps"] = {
    items: step(itemsIssues),
    recipient: step(recipientIssues),
    schedule: step(scheduleIssues),
    preview: step(previewIssues),
    activation: step(activationIssues),
  };

  return {
    steps,
    readyToPublish: steps.activation.complete && unconfiguredFields(draft.fields).length === 0,
  };
}
