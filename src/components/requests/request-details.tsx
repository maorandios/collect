"use client";

import type { ReactNode } from "react";
import { toast } from "sonner";
import {
  Activity,
  Blend,
  CalendarFold,
  CircleCheckBig,
  ClipboardList,
  Copy,
  Hash,
  Link2,
  LoaderCircle,
  Mail,
  MessageSquareText,
  Paperclip,
  PenLine,
  SquareDashedText,
  Timer,
  type LucideIcon,
} from "lucide-react";

import { RequestActionsMenu } from "@/components/requests/request-actions-menu";
import { formatIsraelDateTime } from "@/lib/dates";
import { he } from "@/lib/i18n/he";
import {
  computeProgress,
  fileCountLabel,
  isRequestFieldReceived,
  lastActivityAt,
  recipientLabel,
  requestErrorMessage,
  requestTimelineSteps,
  requestUiStatusLabel,
  type RequestListItem,
  type TimelineStepKey,
} from "@/lib/requests/display";
import type { WorkflowField } from "@/lib/workflow/schema";
import { cn } from "@/lib/utils";

const timelineIcons: Record<TimelineStepKey, LucideIcon> = {
  emailSent: Mail,
  linkOpened: Link2,
  fillingStarted: PenLine,
  responseReceived: CircleCheckBig,
};

export function RequestDetails({
  item,
  trailing,
  titleAs = "h1",
}: {
  item: RequestListItem;
  trailing?: ReactNode;
  titleAs?: "h1" | "h2";
}) {
  const Title = titleAs;
  const recipient = recipientLabel(item.recipientName, item.recipientEmail);
  const progress = computeProgress(item.fields, item.answers, item.files);
  const errorMessage = requestErrorMessage(item.lastError);
  const showOverflowMenu = titleAs === "h1";

  async function copyEmail() {
    await navigator.clipboard.writeText(recipient.email);
    toast.success(he.requests.copyEmailSuccess);
  }

  return (
    <div className="space-y-4">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <Title className="text-[1.125rem] font-semibold tracking-tight text-foreground">
            {item.processName}
          </Title>
          <div className="mt-2 flex min-w-0 items-center gap-2 text-sm text-muted-foreground">
            <span className="truncate font-medium text-foreground">{recipient.name ?? "—"}</span>
            <span aria-hidden="true">·</span>
            <span className="min-w-0 truncate" dir="ltr">
              {recipient.email}
            </span>
            <button
              type="button"
              className="inline-flex size-7 shrink-0 cursor-pointer items-center justify-center rounded-[8px] text-muted-foreground hover:bg-hover hover:text-foreground"
              aria-label={he.requests.copyEmail}
              title={he.requests.copyEmail}
              onClick={() => void copyEmail()}
            >
              <Copy className="size-3.5" />
            </button>
          </div>
        </div>
        <div className="flex shrink-0 items-center gap-1">
          {trailing}
          {showOverflowMenu ? (
            <RequestActionsMenu
              requestId={item.id}
              workflowId={item.workflowId}
              includeFullPage={false}
            />
          ) : null}
        </div>
      </div>

      <section className="rounded-[16px] bg-primary p-4">
        <SectionTitle icon={ClipboardList} tone="dark">
          {he.requests.details}
        </SectionTitle>
        <div className="mt-3 grid grid-cols-1 gap-2 sm:grid-cols-2">
          <SummaryTile
            tone="dark"
            icon={CalendarFold}
            label={he.requests.columns.createdAt}
            value={formatIsraelDateTime(item.createdAt ?? item.scheduledFor)}
          />
          <SummaryTile
            tone="dark"
            icon={Blend}
            label={he.requests.columns.status}
            value={requestUiStatusLabel(item.status)}
          />
          <SummaryTile
            tone="dark"
            icon={LoaderCircle}
            label={he.requests.columns.progress}
            value={progress.label}
          />
          <SummaryTile
            tone="dark"
            icon={Paperclip}
            label={he.requests.columns.attachments}
            value={fileCountLabel(item.files.length)}
          />
          <SummaryTile
            tone="dark"
            icon={Activity}
            label={he.requests.columns.lastActivity}
            value={formatIsraelDateTime(lastActivityAt(item))}
          />
          <SummaryTile
            tone="dark"
            icon={Timer}
            label={he.requests.columns.endAt}
            value={formatIsraelDateTime(item.completedAt)}
          />
        </div>
        {errorMessage ? (
          <p className="mt-3 text-sm text-destructive">
            {he.requests.lastError}: {errorMessage}
          </p>
        ) : null}
      </section>

      <section className="rounded-[16px] border border-border bg-card p-4">
        <SectionTitle icon={MessageSquareText} boxed={false}>
          {he.requests.topics}
        </SectionTitle>
        {item.fields.length ? (
          <ul className="mt-3 space-y-2.5">
            {item.fields.map((field) => {
              const received = isRequestFieldReceived(field, item.answers, item.files);
              const Icon = requirementIcon(field);
              return (
                <li key={field.id} className="flex items-center gap-2 text-sm text-foreground">
                  <Icon
                    className="size-3.5 shrink-0"
                    strokeWidth={1.75}
                    style={{ color: received ? "#38C095" : "#FF4400" }}
                  />
                  <span>{field.label}</span>
                </li>
              );
            })}
          </ul>
        ) : (
          <p className="mt-3 text-sm text-muted-foreground">{he.requests.noTopics}</p>
        )}
      </section>

      <section className="rounded-[16px] border border-border bg-card p-4">
        <SectionTitle icon={Activity} boxed={false}>
          {he.requests.events}
        </SectionTitle>
        <ol className="mt-3">
          {requestTimelineSteps(item).map((step, index, steps) => {
            const Icon = timelineIcons[step.key];
            const last = index === steps.length - 1;
            return (
              <li key={step.key} className="flex gap-3">
                <div className="flex w-8 shrink-0 flex-col items-center">
                  <span className="flex size-8 items-center justify-center rounded-full border border-border text-muted-foreground">
                    <Icon className="size-3.5" strokeWidth={1.75} />
                  </span>
                  {last ? null : <span className="my-1 w-px flex-1 bg-border" />}
                </div>
                <div className={cn("min-w-0 flex-1", last ? "pb-0" : "pb-5")}>
                  <p className="pt-1.5 text-sm font-medium text-foreground">{step.label}</p>
                  <p className="mt-0.5 text-xs text-muted-foreground">
                    {step.at ? formatIsraelDateTime(step.at) : he.requests.notDone}
                  </p>
                </div>
              </li>
            );
          })}
        </ol>
      </section>
    </div>
  );
}

function requirementIcon(field: WorkflowField): LucideIcon {
  if (field.type === "file") {
    return Paperclip;
  }
  if (field.type === "number") {
    return Hash;
  }
  if (field.type === "date") {
    return CalendarFold;
  }
  if (field.type === "confirmation") {
    return CircleCheckBig;
  }
  return SquareDashedText;
}

function SectionTitle({
  icon: Icon,
  children,
  tone = "default",
  boxed = true,
}: {
  icon: LucideIcon;
  children: ReactNode;
  tone?: "default" | "dark";
  boxed?: boolean;
}) {
  const dark = tone === "dark";
  return (
    <div>
      <h2
        className={cn(
          "flex items-center gap-2 text-sm font-semibold",
          dark ? "text-[#d0f0c0]" : "text-foreground",
        )}
      >
        {dark || !boxed ? (
          <Icon className={cn("size-3.5", dark ? "text-[#d0f0c0]" : "text-foreground")} />
        ) : (
          <span className="flex size-7 items-center justify-center rounded-[10px] bg-primary/10 text-primary">
            <Icon className="size-3.5" />
          </span>
        )}
        {children}
      </h2>
      <div className={cn("-mx-4 mt-3 h-px", dark ? "bg-[#d0f0c0]/30" : "bg-border")} />
    </div>
  );
}

function SummaryTile({
  icon: Icon,
  label,
  value,
  hint,
  tone = "default",
  children,
}: {
  icon: LucideIcon;
  label: string;
  value: string;
  hint?: string;
  tone?: "default" | "dark";
  children?: ReactNode;
}) {
  const dark = tone === "dark";
  return (
    <div className={cn("p-3", !dark && "rounded-[12px] bg-muted/70")}>
      <div className="min-w-0">
        <p
          className={cn(
            "flex items-center gap-1.5 text-xs",
            dark ? "text-[#d0f0c0]" : "text-muted-foreground",
          )}
        >
          <Icon className="size-3.5 shrink-0" strokeWidth={1.75} />
          {label}
        </p>
        <p className={cn("mt-0.5 text-sm font-medium", dark ? "text-white" : "text-foreground")}>{value}</p>
        {hint ? (
          <p className={cn("mt-0.5 text-xs", dark ? "text-white/80" : "text-muted-foreground")}>{hint}</p>
        ) : null}
        {children}
      </div>
    </div>
  );
}
