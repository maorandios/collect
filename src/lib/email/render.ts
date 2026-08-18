import { escapeAttribute, escapeHtml } from "@/lib/email/escape";
import { formatIsraelDateTime } from "@/lib/dates";
import { he } from "@/lib/i18n/he";

export function buildRequestEmail({
  businessName,
  recipientName,
  subject,
  body,
  magicLinkUrl,
  dueAt,
  isTest,
  isReminder = false,
}: {
  businessName: string;
  recipientName: string | null;
  subject: string;
  body: string;
  magicLinkUrl: string;
  dueAt: string | null;
  isTest: boolean;
  isReminder?: boolean;
}) {
  const reminderSubject = isReminder
    ? he.email.reminderPrefix.replace("{subject}", subject)
    : subject;
  const safeSubject = isTest ? `${he.email.testPrefix} ${reminderSubject}` : reminderSubject;
  const greeting = recipientName
    ? he.email.helloNamed.replace("{name}", recipientName)
    : he.email.hello;
  const safeLink = escapeAttribute(magicLinkUrl);
  const bodyHtml = escapeHtml(body).replaceAll("\n", "<br />");
  const dueLine = dueAt
    ? `<p style="color:#6b6f76;font-size:14px;">${escapeHtml(he.email.dueDate)}: ${escapeHtml(formatIsraelDateTime(dueAt))}</p>`
    : "";

  const html = `<!DOCTYPE html>
<html lang="he" dir="rtl">
  <body style="margin:0;padding:24px;background:#f5f5f3;direction:rtl;text-align:right;font-family:Arial,Helvetica,sans-serif;color:#202124;">
    <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="max-width:560px;margin:0 auto;background:#ffffff;border:1px solid #e2e3e0;border-radius:12px;">
      <tr>
        <td style="padding:28px;">
          <p style="margin:0 0 8px;font-size:13px;color:#6b6f76;">${escapeHtml(businessName)}</p>
          <p style="margin:0 0 16px;font-size:16px;">${escapeHtml(greeting)}</p>
          <p style="margin:0 0 24px;font-size:15px;line-height:1.6;">${bodyHtml}</p>
          ${dueLine}
          <p style="margin:24px 0;">
            <a href="${safeLink}" style="display:inline-block;background:#252729;color:#ffffff;text-decoration:none;padding:12px 18px;border-radius:8px;font-size:15px;">
              ${escapeHtml(he.email.openRequest)}
            </a>
          </p>
          <p style="margin:0;font-size:13px;color:#6b6f76;line-height:1.5;">
            ${escapeHtml(he.email.linkFallback)}<br />
            ${escapeHtml(magicLinkUrl)}
          </p>
        </td>
      </tr>
    </table>
  </body>
</html>`;

  return { subject: safeSubject, html };
}
