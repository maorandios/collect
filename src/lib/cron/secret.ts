import { createHash, timingSafeEqual } from "node:crypto";
import "server-only";

function digest(value: string) {
  return createHash("sha256").update(value).digest();
}

export function authorizationMatchesCronSecret(authorization: string | null, secret: string | undefined) {
  if (!authorization || !secret) {
    return false;
  }

  const expected = `Bearer ${secret}`;
  return timingSafeEqual(digest(authorization), digest(expected));
}
