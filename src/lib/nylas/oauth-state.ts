import { createHash, randomBytes } from "node:crypto";

export function createOAuthState() {
  const raw = randomBytes(32).toString("base64url");
  return { raw, hash: hashOAuthState(raw) };
}

export function hashOAuthState(raw: string) {
  return createHash("sha256").update(raw).digest("hex");
}
