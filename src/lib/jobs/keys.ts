export function sendEmailIdempotencyKey(requestId: string) {
  return `send_email:${requestId}`;
}

export function sendReminderIdempotencyKey(requestId: string, reminderDueAt: string) {
  return `send_reminder:${requestId}:${reminderDueAt}`;
}
