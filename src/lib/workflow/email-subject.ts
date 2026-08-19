const RECIPIENT_SEPARATOR = /\s*[–—\-]\s*/;

export function stripRecipientFromSubject(subject: string, recipientNames: Array<string | null | undefined>) {
  let next = subject.trim();
  for (const rawName of recipientNames) {
    const name = rawName?.trim();
    if (!name) {
      continue;
    }
    const escaped = name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    next = next
      .replace(new RegExp(`\\s*[–—\\-]\\s*${escaped}\\s*$`, "u"), "")
      .replace(new RegExp(`\\s+ל${escaped}\\s*$`, "u"), "")
      .replace(new RegExp(`\\s+מ${escaped}\\s*$`, "u"), "")
      .replace(new RegExp(`^${escaped}\\s*[–—\\-]\\s*`, "u"), "");
  }
  return next.replace(RECIPIENT_SEPARATOR, " – ").replace(/\s{2,}/g, " ").trim();
}

export function userSpecifiedSubject(userMessage: string, subject: string) {
  const trimmed = subject.trim();
  if (!trimmed) {
    return false;
  }
  return userMessage.includes(trimmed) || /נושא(?:\s*המייל)?\s*[:־-]/.test(userMessage);
}

export function resolveEmailSubject({
  incoming,
  current,
  recipientNames,
  userMessage,
  locked,
}: {
  incoming: string | null | undefined;
  current: string;
  recipientNames: Array<string | null | undefined>;
  userMessage: string;
  locked: boolean;
}) {
  if (locked && !userSpecifiedSubject(userMessage, incoming?.trim() || current)) {
    return current;
  }
  const source = incoming?.trim() || current;
  if (userSpecifiedSubject(userMessage, source)) {
    return source;
  }
  return stripRecipientFromSubject(source, recipientNames);
}
