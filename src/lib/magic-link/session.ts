import { createHmac, timingSafeEqual } from "node:crypto";

const COOKIE_NAME = "collect_recipient";

export type RecipientSession = {
  requestId: string;
  expiresAt: string;
};

function getSecret() {
  const secret = process.env.MAGIC_LINK_SECRET;
  if (!secret) {
    throw new Error("missing_magic_link_secret");
  }
  return secret;
}

function encode(session: RecipientSession) {
  const body = Buffer.from(JSON.stringify(session)).toString("base64url");
  const signature = createHmac("sha256", getSecret()).update(body).digest("base64url");
  return `${body}.${signature}`;
}

function decode(value: string): RecipientSession | null {
  const [body, signature] = value.split(".");
  if (!body || !signature) {
    return null;
  }
  const expected = createHmac("sha256", getSecret()).update(body).digest("base64url");
  const left = Buffer.from(signature);
  const right = Buffer.from(expected);
  if (left.length !== right.length || !timingSafeEqual(left, right)) {
    return null;
  }
  try {
    const parsed = JSON.parse(Buffer.from(body, "base64url").toString("utf8")) as RecipientSession;
    if (!parsed.requestId || !parsed.expiresAt) {
      return null;
    }
    if (new Date(parsed.expiresAt).getTime() <= Date.now()) {
      return null;
    }
    return parsed;
  } catch {
    return null;
  }
}

export function recipientCookieOptions(expiresAt: string) {
  const maxAge = Math.max(
    60,
    Math.floor((new Date(expiresAt).getTime() - Date.now()) / 1000),
  );
  return {
    httpOnly: true,
    sameSite: "lax" as const,
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge,
  };
}

export function createRecipientCookieValue(session: RecipientSession) {
  return encode(session);
}

export async function getRecipientSession() {
  const { cookies } = await import("next/headers");
  const store = await cookies();
  const value = store.get(COOKIE_NAME)?.value;
  if (!value) {
    return null;
  }
  return decode(value);
}

export const RECIPIENT_COOKIE_NAME = COOKIE_NAME;
