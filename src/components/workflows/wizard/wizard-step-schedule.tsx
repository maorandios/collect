"use client";

import { Input } from "@/components/ui/input";
import { he } from "@/lib/i18n/he";
import { formatReminderDelayHe } from "@/lib/schedule/labels";
import { getDraftReminder, withDraftReminder } from "@/lib/workflow/draft-canonical";
import type { DraftReminder, DraftSchedule, WorkflowDraftDefinition } from "@/lib/workflow/draft-schema";
import { TIMEZONE } from "@/lib/workflow/schema";
import { monthlyEditorDayValue } from "@/lib/workflow/studio-display";

const SELECT_CLASS =
  "h-10 w-full rounded-lg border border-input bg-background px-2.5 text-sm outline-none focus-visible:border-ring";

function scheduleFromType(type: string, current: DraftSchedule | undefined): DraftSchedule | undefined {
  const time = current && "time" in current ? current.time : null;
  if (type === "weekly") {
    return {
      type: "weekly",
      weekday: current && current.type === "weekly" ? current.weekday : null,
      time,
      timezone: TIMEZONE,
    };
  }
  if (type === "monthly") {
    return {
      type: "monthly",
      day: current && current.type === "monthly" ? current.day : null,
      time,
      timezone: TIMEZONE,
      monthlyDayMode: current && current.type === "monthly" ? current.monthlyDayMode : undefined,
    };
  }
  if (type === "once") {
    return {
      type: "once",
      date: current && current.type === "once" ? current.date : null,
      time,
      timezone: TIMEZONE,
    };
  }
  if (type === "manual") {
    return { type: "manual" };
  }
  if (type === "send_now") {
    return { type: "send_now" };
  }
  return undefined;
}

function reminderSelectValue(reminder: DraftReminder) {
  if (reminder.state === "unset") {
    return "unset";
  }
  if (reminder.state === "disabled") {
    return "none";
  }
  if (reminder.afterHours === 24 || reminder.afterHours === 48 || reminder.afterHours === 168) {
    return String(reminder.afterHours);
  }
  return "custom";
}

export function WizardStepSchedule({
  draft,
  readOnly,
  onChange,
}: {
  draft: WorkflowDraftDefinition;
  readOnly: boolean;
  onChange: (draft: WorkflowDraftDefinition) => void;
}) {
  const reminder = getDraftReminder(draft);
  const reminderValue = reminderSelectValue(reminder);

  return (
    <div className="space-y-5">
      <h2 className="text-lg font-medium">{he.wizard.scheduleTitle}</h2>
      <select
        className={SELECT_CLASS}
        disabled={readOnly}
        value={draft.schedule?.type ?? ""}
        onChange={(event) => onChange({ ...draft, schedule: scheduleFromType(event.target.value, draft.schedule) })}
      >
        <option value="">{he.studio.notSet}</option>
        <option value="send_now">{he.wizard.sendNow}</option>
        <option value="once">{he.wizard.once}</option>
        <option value="weekly">{he.wizard.weekly}</option>
        <option value="monthly">{he.wizard.monthly}</option>
        <option value="manual">{he.wizard.manual}</option>
      </select>

      {draft.schedule?.type === "weekly" ? (
        <select
          className={SELECT_CLASS}
          disabled={readOnly}
          value={draft.schedule.weekday ?? ""}
          onChange={(event) =>
            onChange({
              ...draft,
              schedule: {
                ...draft.schedule,
                type: "weekly",
                weekday: event.target.value === "" ? null : Number(event.target.value),
                timezone: TIMEZONE,
              },
            })
          }
        >
          <option value="">{he.studio.weekdayNotSet}</option>
          <option value="0">{he.workflow.sunday}</option>
          <option value="1">{he.workflow.monday}</option>
          <option value="2">{he.workflow.tuesday}</option>
          <option value="3">{he.workflow.wednesday}</option>
          <option value="4">{he.workflow.thursday}</option>
          <option value="5">{he.workflow.friday}</option>
          <option value="6">{he.workflow.saturday}</option>
        </select>
      ) : null}

      {draft.schedule?.type === "monthly" ? (
        <select
          className={SELECT_CLASS}
          disabled={readOnly}
          value={monthlyEditorDayValue(draft.schedule)}
          onChange={(event) => {
            if (event.target.value === "end_of_month") {
              onChange({
                ...draft,
                schedule: { ...draft.schedule, type: "monthly", day: 31, monthlyDayMode: "end_of_month", timezone: TIMEZONE },
              });
              return;
            }
            const day = Number(event.target.value);
            onChange({
              ...draft,
              schedule: {
                ...draft.schedule,
                type: "monthly",
                day: Number.isFinite(day) && day >= 1 && day <= 31 ? day : null,
                monthlyDayMode: "specific_day",
                timezone: TIMEZONE,
              },
            });
          }}
        >
          <option value="">{he.studio.monthDayNotSet}</option>
          <option value="end_of_month">{he.studio.setup.monthDayEnd}</option>
          {Array.from({ length: 31 }, (_, index) => index + 1).map((day) => (
            <option key={day} value={String(day)}>
              {day}
            </option>
          ))}
        </select>
      ) : null}

      {draft.schedule?.type === "once" ? (
        <Input
          className="h-10"
          type="date"
          disabled={readOnly}
          value={draft.schedule.date ?? ""}
          onChange={(event) =>
            onChange({
              ...draft,
              schedule: { ...draft.schedule, type: "once", date: event.target.value || null, timezone: TIMEZONE },
            })
          }
        />
      ) : null}

      {draft.schedule && draft.schedule.type !== "manual" && draft.schedule.type !== "send_now" ? (
        <Input
          className="h-10"
          type="time"
          disabled={readOnly}
          value={"time" in draft.schedule ? (draft.schedule.time ?? "") : ""}
          onChange={(event) =>
            onChange({
              ...draft,
              schedule:
                draft.schedule && draft.schedule.type !== "manual" && draft.schedule.type !== "send_now"
                  ? { ...draft.schedule, time: event.target.value || null, timezone: TIMEZONE }
                  : draft.schedule,
            })
          }
        />
      ) : null}

      <div className="space-y-2">
        <p className="text-xs text-muted-foreground">{he.workflow.reminder}</p>
        <select
          className={SELECT_CLASS}
          disabled={readOnly}
          value={reminderValue}
          onChange={(event) => {
            const value = event.target.value;
            if (value === "unset") {
              onChange(withDraftReminder(draft, { state: "unset" }));
              return;
            }
            if (value === "none") {
              onChange(withDraftReminder(draft, { state: "disabled" }));
              return;
            }
            if (value === "custom") {
              onChange(withDraftReminder(draft, { state: "enabled", afterHours: 72 }));
              return;
            }
            onChange(withDraftReminder(draft, { state: "enabled", afterHours: Number(value) }));
          }}
        >
          <option value="unset">{he.wizard.reminderUnset}</option>
          <option value="none">{he.workflow.reminderOff}</option>
          <option value="24">{he.studio.reminderAfterDay}</option>
          <option value="48">{he.studio.reminderAfterTwoDays}</option>
          <option value="168">{he.studio.reminderAfterWeek}</option>
          <option value="custom">{he.wizard.reminderCustom}</option>
        </select>
        {reminder.state === "enabled" && reminderValue === "custom" ? (
          <div className="flex items-center gap-2">
            <Input
              className="h-10 w-24"
              type="number"
              min={1}
              disabled={readOnly}
              value={reminder.afterHours}
              onChange={(event) => {
                const hours = Number(event.target.value);
                if (Number.isFinite(hours) && hours > 0) {
                  onChange(withDraftReminder(draft, { state: "enabled", afterHours: hours }));
                }
              }}
            />
            <span className="text-sm text-muted-foreground">
              {he.wizard.reminderCustomHours} · {formatReminderDelayHe(reminder.afterHours)}
            </span>
          </div>
        ) : reminder.state === "enabled" ? (
          <p className="text-sm text-muted-foreground">{formatReminderDelayHe(reminder.afterHours)}</p>
        ) : null}
      </div>
    </div>
  );
}
