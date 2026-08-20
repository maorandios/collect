"use client";

import { he } from "@/lib/i18n/he";
import { cn } from "@/lib/utils";
import type { WizardCompletion, WizardStepId } from "@/lib/workflow/wizard-completion";

const STEPS: Array<{ id: WizardStepId; label: string }> = [
  { id: "items", label: he.wizard.stepItems },
  { id: "recipient", label: he.wizard.stepRecipient },
  { id: "schedule", label: he.wizard.stepSchedule },
  { id: "preview", label: he.wizard.stepPreview },
  { id: "activation", label: he.wizard.stepActivation },
];

export function WizardStepper({
  current,
  completion,
  onSelect,
}: {
  current: WizardStepId;
  completion: WizardCompletion;
  onSelect: (step: WizardStepId) => void;
}) {
  return (
    <ol className="flex flex-wrap gap-2 border-b border-border bg-surface px-6 py-3">
      {STEPS.map((step, index) => {
        const state = completion.steps[step.id];
        const active = current === step.id;
        return (
          <li key={step.id}>
            <button
              type="button"
              onClick={() => onSelect(step.id)}
              className={cn(
                "rounded-lg px-3 py-1.5 text-sm",
                active ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:bg-hover",
              )}
            >
              {index + 1}. {step.label}
              {!state.complete ? (
                <span className="ms-2 rounded-full bg-[#f4d3c4] px-2 py-0.5 text-[11px] text-[#8a3b1d]">
                  {he.studio.missingTag}
                </span>
              ) : null}
            </button>
          </li>
        );
      })}
    </ol>
  );
}
