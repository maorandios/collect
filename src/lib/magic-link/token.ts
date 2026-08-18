import { createHmac, timingSafeEqual } from "node:crypto";

type MagicLinkPayload = {
  requestId: string;
  tokenVersion: number;
  expiresAt: string;
};

function getSecret() {
  const secret = process.env.MAGIC_LINK_SECRET;
  if (!secret) {
    throw new Error("missing_magic_link_secret");
  }
  return secret;
}

function toBase64Url(value: string | Buffer) {
  return Buffer.from(value)
    .toString("base64")
    .replaceAll("+", "-")
    .replaceAll("/", "_")
    .replaceAll("=", "");
}

function fromBase64Url(value: string) {
  const padded = value.replaceAll("-", "+").replaceAll("_", "/");
  const pad = padded.length % 4 === 0 ? "" : "=".repeat(4 - (padded.length % 4));
  return Buffer.from(`${padded}${pad}`, "base64").toString("utf8");
}

function sign(body: string) {
  return toBase64Url(createHmac("sha256", getSecret()).update(body).digest());
}

export function createMagicLinkToken(payload: MagicLinkPayload) {
  const body = toBase64Url(JSON.stringify(payload));
  return `${body}.${sign(body)}`;
}

export function verifyMagicLinkToken(token: string): MagicLinkPayload | null {
  const [body, signature] = token.split(".");
  if (!body || !signature) {
    return null;
  }

  const expected = sign(body);
  const left = Buffer.from(signature);
  const right = Buffer.from(expected);
  if (left.length !== right.length || !timingSafeEqual(left, right)) {
    return null;
  }

  try {
    const parsed = JSON.parse(fromBase64Url(body)) as MagicLinkPayload;
    if (!parsed.requestId || !parsed.tokenVersion || !parsed.expiresAt) {
      return null;
    }
    return parsed;
  } catch {
    return null;
  }
}

export function buildMagicLinkUrl(token: string) {
  const appUrl = process.env.APP_URL?.replace(/\/$/, "");
  if (!appUrl) {
    throw new Error("missing_app_url");
  }
  return `${appUrl}/r/${encodeURIComponent(token)}`;
}
