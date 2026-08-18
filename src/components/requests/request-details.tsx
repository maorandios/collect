"use client";

import Link from "next/link";
import type { ComponentType, ReactNode } from "react";
import {
  Activity,
  Bell,
  CheckCircle2,
  ClipboardList,
  Clock,
  Download,
  ExternalLink,
  Eye,
  File,
  FilePlus2,
  FileSpreadsheet,
  FileText,
  Image as ImageIcon,
  Mail,
  MailWarning,
  MessageSquareText,
  Paperclip,
  Send,
  User,
  Video,
  Workflow,
} from "lucide-react";

import { RequestActionsMenu } from "@/components/requests/request-actions-menu";
import { StatusBadge } from "@/components/status/status-badge";
import { buttonVariants } from "@/components/ui/button";
import { formatIsraelDateTime } from "@/lib/dates";
import { eventLabel } from "@/lib/i18n/events";
import { he } from "@/lib/i18n/he";
import {
  OPEN_STATUSES,
  computeProgress,
  fileKind,
  formatAnswer,
  formatFileSize,
  lastActivityDisplay,
  missingRequiredFields,
  recipientLabel,
  reminderSummary,
  requestErrorMessage,
  requestFileHref,
  sendTypeLabel,
  type RequestListItem,
} from "@/lib/requests/display";
import { cn } from "@/lib/utils";

const fileIcons = {
  image: ImageIcon,
  pdf: FileText,
  sheet: FileSpreadsheet,
  video: Video,
  file: File,
};

const eventVisual: Record<
  string,
  { icon: ComponentType<{ className?: string }>; tone: string }
> = {
  request_created: { icon: FilePlus2, tone: "bg-[#eef1f4] text-[#475569]" },
  email_sent: { icon: Mail, tone: "bg-[#e7f4f0] text-[#0f766e]" },
  send_failed: { icon: MailWarning, tone: "bg-[#fde8e8] text-[#b42318]" },
  reminder_sent: { icon: Bell, tone: "bg-[#fef3e2] text-[#b45309]" },
  form_opened: { icon: Eye, tone: "bg-[#e8eef3] text-[#475569]" },
  submitted: { icon: CheckCircle2, tone: "bg-[#e7f4f0] text-[#0f766e]" },
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
  const activity = lastActivityDisplay(item);
  const errorMessage = requestErrorMessage(item.lastError);
  const reminder = reminderSummary(item);
  const missing = OPEN_STATUSES.has(item.status)
    ? missingRequiredFields(item.fields, item.answers, item.files)
    : [];
  const answerFields = item.fields.filter((field) => field.type !== "file");
  const fileFields = item.fields.filter((field) => field.type === "file");
  const knownIds = new Set(fileFields.map((field) => field.id));
  const otherFiles = item.files.filter((file) => !knownIds.has(file.fieldId));
  const contactName = recipient.name ?? recipient.email;
  const initial = contactName.trim().charAt(0);

  return (
    <div className="space-y-4">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <Title className="text-xl font-semibold text-foreground">{item.processName}</Title>
            <StatusBadge status={item.status} />
          </div>
          <div className="mt-3 flex items-center gap-3">
            <span className="flex size-10 shrink-0 items-center justify-center rounded-full bg-primary/10 text-sm font-medium text-primary">
              {initial}
            </span>
            <div className="min-w-0">
              <p className="flex items-center gap-1.5 text-sm font-medium text-foreground">
                <User className="size-3.5 text-muted-foreground" />
                {contactName}
              </p>
              {recipient.name ? (
                <p className="mt-0.5 truncate text-sm text-muted-foreground">{recipient.email}</p>
              ) : null}
            </div>
          </div>
        </div>
        <div className="flex shrink-0 items-center gap-1">
          {trailing}
          <RequestActionsMenu
            requestId={item.id}
            workflowId={item.workflowId}
            includeFullPage={titleAs !== "h1"}
          />
        </div>
      </div>

      <section className="rounded-[16px] border border-border bg-card p-4">
        <SectionTitle icon={ClipboardList}>{he.requests.details}</SectionTitle>
        <div className="mt-4 grid grid-cols-1 gap-2 sm:grid-cols-2">
          <SummaryTile
            icon={Send}
            label={he.requests.runLabel}
            value={sendTypeLabel(item.schedule)}
            hint={formatIsraelDateTime(item.scheduledFor)}
          />
          <SummaryTile icon={Clock} label={he.requests.sentAt} value={formatIsraelDateTime(item.sentAt)} />
          <SummaryTile icon={Bell} label={reminder.label} value={reminder.value} />
          <SummaryTile
            icon={Activity}
            label={he.requests.columns.lastActivity}
            value={activity.label}
            hint={formatIsraelDateTime(activity.at)}
          />
          <div className="rounded-[12px] bg-muted/70 p-3 sm:col-span-2">
            <div className="flex items-start gap-3">
              <span className="flex size-9 shrink-0 items-center justify-center rounded-[10px] bg-card text-primary">
                <CheckCircle2 className="size-4" />
              </span>
              <div className="min-w-0 flex-1">
                <p className="text-xs text-muted-foreground">{he.requests.progress}</p>
                <p className="mt-0.5 text-sm font-medium text-foreground">{progress.label}</p>
                {progress.total > 0 ? (
                  <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-card">
                    <div
                      className="h-full rounded-full bg-primary"
                      style={{ width: `${Math.round((progress.done / progress.total) * 100)}%` }}
                    />
                  </div>
                ) : null}
              </div>
            </div>
          </div>
        </div>
        {missing.length ? (
          <div className="mt-4 rounded-[12px] border border-amber-200 bg-amber-50 px-3 py-2">
            <p className="text-sm font-medium text-amber-800">{he.requests.stillMissing}</p>
            <ul className="mt-1 list-disc pe-5 text-sm text-amber-900">
              {missing.map((field) => (
                <li key={field.id}>{field.label}</li>
              ))}
            </ul>
          </div>
        ) : null}
        {errorMessage ? (
          <p className="mt-3 text-sm text-destructive">
            {he.requests.lastError}: {errorMessage}
          </p>
        ) : null}
      </section>

      <section className="rounded-[16px] border border-border bg-card p-4">
        <SectionTitle icon={MessageSquareText}>{he.requests.answers}</SectionTitle>
        {answerFields.length ? (
          <div className="mt-4 space-y-2">
            {answerFields.map((field) => (
              <div key={field.id} className="rounded-[12px] bg-muted/70 px-3 py-2.5">
                <p className="text-xs text-muted-foreground">{field.label}</p>
                <p className="mt-1 whitespace-pre-wrap text-sm text-foreground">
                  {formatAnswer(field, item.answers[field.id])}
                </p>
              </div>
            ))}
          </div>
        ) : (
          <p className="mt-4 text-sm text-muted-foreground">{he.requests.noAnswers}</p>
        )}
      </section>

      <section className="rounded-[16px] border border-border bg-card p-4">
        <SectionTitle icon={Paperclip}>{he.requests.files}</SectionTitle>
        {!item.files.length ? (
          <p className="mt-4 text-sm text-muted-foreground">{he.requests.noFiles}</p>
        ) : (
          <div className="mt-4 space-y-4">
            {fileFields.map((field) => {
              const files = item.files.filter((file) => file.fieldId === field.id);
              return (
                <div key={field.id}>
                  <p className="mb-2 text-xs font-medium text-muted-foreground">{field.label}</p>
                  {files.length ? (
                    <ul className="space-y-2">
                      {files.map((file) => (
                        <FileRow key={file.id} requestId={item.id} file={file} />
                      ))}
                    </ul>
                  ) : (
                    <p className="text-sm text-muted-foreground">—</p>
                  )}
                </div>
              );
            })}
            {otherFiles.length ? (
              <ul className="space-y-2">
                {otherFiles.map((file) => (
                  <FileRow key={file.id} requestId={item.id} file={file} />
                ))}
              </ul>
            ) : null}
          </div>
        )}
      </section>

      <section className="rounded-[16px] border border-border bg-card p-4">
        <SectionTitle icon={Activity}>{he.requests.events}</SectionTitle>
        {!item.events.length ? (
          <p className="mt-4 text-sm text-muted-foreground">{he.requests.noEvents}</p>
        ) : (
          <ol className="mt-4">
            {item.events.map((event, index) => {
              const visual = eventVisual[event.type] ?? {
                icon: Clock,
                tone: "bg-[#eef1f4] text-[#475569]",
              };
              const Icon = visual.icon;
              const last = index === item.events.length - 1;
              return (
                <li key={event.id} className="flex gap-3">
                  <div className="flex w-8 shrink-0 flex-col items-center">
                    <span
                      className={cn(
                        "flex size-8 items-center justify-center rounded-full",
                        visual.tone,
                      )}
                    >
                      <Icon className="size-3.5" />
                    </span>
                    {last ? null : <span className="my-1 w-px flex-1 bg-border" />}
                  </div>
                  <div className={cn("min-w-0 flex-1", last ? "pb-0" : "pb-5")}>
                    <p className="pt-1.5 text-sm font-medium text-foreground">{eventLabel(event.type)}</p>
                    <p className="mt-0.5 text-xs text-muted-foreground">
                      {formatIsraelDateTime(event.createdAt)}
                    </p>
                  </div>
                </li>
              );
            })}
          </ol>
        )}
      </section>

      <Link
        href={`/workflows/${item.workflowId}`}
        className={cn(
          buttonVariants({ variant: "outline" }),
          "h-11 w-full rounded-[12px] gap-2",
        )}
      >
        <Workflow className="size-4" />
        {he.actions.goToProcess}
      </Link>
    </div>
  );
}

function SectionTitle({
  icon: Icon,
  children,
}: {
  icon: ComponentType<{ className?: string }>;
  children: ReactNode;
}) {
  return (
    <h2 className="flex items-center gap-2 text-sm font-semibold text-foreground">
      <span className="flex size-7 items-center justify-center rounded-[10px] bg-primary/10 text-primary">
        <Icon className="size-3.5" />
      </span>
      {children}
    </h2>
  );
}

function SummaryTile({
  icon: Icon,
  label,
  value,
  hint,
}: {
  icon: ComponentType<{ className?: string }>;
  label: string;
  value: string;
  hint?: string;
}) {
  return (
    <div className="flex items-start gap-3 rounded-[12px] bg-muted/70 p-3">
      <span className="flex size-9 shrink-0 items-center justify-center rounded-[10px] bg-card text-primary">
        <Icon className="size-4" />
      </span>
      <div className="min-w-0">
        <p className="text-xs text-muted-foreground">{label}</p>
        <p className="mt-0.5 text-sm font-medium text-foreground">{value}</p>
        {hint ? <p className="mt-0.5 text-xs text-muted-foreground">{hint}</p> : null}
      </div>
    </div>
  );
}

function FileRow({
  requestId,
  file,
}: {
  requestId: string;
  file: RequestListItem["files"][number];
}) {
  const kind = fileKind(file.mimeType, file.originalName);
  const Icon = fileIcons[kind] as ComponentType<{ className?: string }>;
  const downloadHref = requestFileHref(requestId, file.id);
  const inlineHref = requestFileHref(requestId, file.id, true);
  const sizeLabel = formatFileSize(file.sizeBytes);

  return (
    <li className="space-y-2">
      <div className="flex items-center gap-3 rounded-[12px] border border-border bg-muted/40 p-2.5">
        <span className="flex size-10 shrink-0 items-center justify-center rounded-[10px] bg-card text-primary">
          <Icon className="size-4" />
        </span>
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-medium">{file.originalName}</p>
          {sizeLabel !== "—" ? (
            <p className="text-xs text-muted-foreground">{sizeLabel}</p>
          ) : null}
        </div>
        <span className="flex shrink-0 items-center gap-1">
          {kind === "pdf" ? (
            <a
              href={inlineHref}
              target="_blank"
              rel="noreferrer"
              className={cn(buttonVariants({ variant: "ghost", size: "icon" }), "size-8 rounded-[10px]")}
              aria-label={he.actions.openFile}
              title={he.actions.openFile}
            >
              <ExternalLink className="size-4" />
            </a>
          ) : null}
          <Link
            href={downloadHref}
            className={cn(buttonVariants({ variant: "ghost", size: "icon" }), "size-8 rounded-[10px]")}
            aria-label={he.actions.download}
            title={he.actions.download}
          >
            <Download className="size-4" />
          </Link>
        </span>
      </div>
      {kind === "image" ? (
        <a href={inlineHref} target="_blank" rel="noreferrer" className="block">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={inlineHref}
            alt={file.originalName}
            className="max-h-40 rounded-[12px] border border-border object-contain"
          />
        </a>
      ) : null}
    </li>
  );
}
