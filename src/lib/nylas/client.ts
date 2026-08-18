import "server-only";

import { getNylasConfig } from "@/lib/nylas/config";

const GOOGLE_SEND_SCOPES = [
  "https://www.googleapis.com/auth/gmail.send",
  "https://www.googleapis.com/auth/userinfo.email",
].join(" ");

type NylasError = {
  status: number;
  type: string;
  message: string;
  idempotentResponse: boolean;
};

function nylasError(status: number, body: unknown, idempotentResponse: boolean): NylasError {
  const record = body && typeof body === "object" ? (body as Record<string, unknown>) : {};
  const error = record.error && typeof record.error === "object"
    ? (record.error as Record<string, unknown>)
    : {};
  return {
    status,
    type: typeof error.type === "string" ? error.type : "unknown",
    message: typeof error.message === "string" ? error.message : "nylas_error",
    idempotentResponse,
  };
}

async function nylasFetch(path: string, init: RequestInit) {
  const { apiKey, apiUri, isConfigured } = getNylasConfig();
  if (!isConfigured || !apiKey || !apiUri) {
    throw new Error("missing_nylas_config");
  }

  const response = await fetch(`${apiUri}${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${apiKey}`,
      Accept: "application/json",
      ...init.headers,
    },
  });

  const idempotentResponse = response.headers.get("Idempotent-Response") === "true";
  const text = await response.text();
  let body: unknown = null;
  try {
    body = text ? JSON.parse(text) : null;
  } catch {
    body = null;
  }

  return { response, body, idempotentResponse };
}

export function buildGoogleOAuthUrl(state: string) {
  const { clientId, apiUri, callbackUri, isConfigured } = getNylasConfig();
  if (!isConfigured || !clientId || !apiUri || !callbackUri) {
    throw new Error("missing_nylas_config");
  }

  const url = new URL(`${apiUri}/v3/connect/auth`);
  url.searchParams.set("client_id", clientId);
  url.searchParams.set("redirect_uri", callbackUri);
  url.searchParams.set("response_type", "code");
  url.searchParams.set("access_type", "online");
  url.searchParams.set("provider", "google");
  url.searchParams.set("state", state);
  url.searchParams.set("scope", GOOGLE_SEND_SCOPES);
  return url.toString();
}

export async function exchangeOAuthCode(code: string) {
  const { clientId, apiKey, callbackUri, isConfigured } = getNylasConfig();
  if (!isConfigured || !clientId || !apiKey || !callbackUri) {
    throw new Error("missing_nylas_config");
  }

  const { response, body } = await nylasFetch("/v3/connect/token", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      client_id: clientId,
      client_secret: apiKey,
      grant_type: "authorization_code",
      code,
      redirect_uri: callbackUri,
      code_verifier: "nylas",
    }),
  });

  if (!response.ok) {
    throw nylasError(response.status, body, false);
  }

  const record = body && typeof body === "object" ? (body as Record<string, unknown>) : {};
  const grantId = typeof record.grant_id === "string" ? record.grant_id : null;
  const email = typeof record.email === "string" ? record.email : null;
  const provider = typeof record.provider === "string" ? record.provider : "google";

  return { grantId, email, provider };
}

export async function getGrant(grantId: string) {
  const { response, body } = await nylasFetch(`/v3/grants/${encodeURIComponent(grantId)}`, {
    method: "GET",
  });
  if (!response.ok) {
    throw nylasError(response.status, body, false);
  }
  const record = body && typeof body === "object" ? (body as Record<string, unknown>) : {};
  const data = record.data && typeof record.data === "object"
    ? (record.data as Record<string, unknown>)
    : record;
  return {
    email: typeof data.email === "string" ? data.email : null,
    provider: typeof data.provider === "string" ? data.provider : "google",
  };
}

export async function deleteGrant(grantId: string) {
  const { response, body } = await nylasFetch(`/v3/grants/${encodeURIComponent(grantId)}`, {
    method: "DELETE",
  });
  if (!response.ok && response.status !== 404) {
    throw nylasError(response.status, body, false);
  }
}

export async function sendGrantMessage({
  grantId,
  idempotencyKey,
  subject,
  body,
  toEmail,
  toName,
}: {
  grantId: string;
  idempotencyKey: string;
  subject: string;
  body: string;
  toEmail: string;
  toName: string | null;
}) {
  const { response, body: payload, idempotentResponse } = await nylasFetch(
    `/v3/grants/${encodeURIComponent(grantId)}/messages/send`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Idempotency-Key": idempotencyKey,
      },
      body: JSON.stringify({
        subject,
        body,
        to: [{ email: toEmail, name: toName || undefined }],
      }),
    },
  );

  if (!response.ok) {
    throw nylasError(response.status, payload, idempotentResponse);
  }

  const record = payload && typeof payload === "object" ? (payload as Record<string, unknown>) : {};
  const data = record.data && typeof record.data === "object"
    ? (record.data as Record<string, unknown>)
    : record;
  const messageId = typeof data.id === "string" ? data.id : null;

  return { messageId, idempotentResponse };
}

export function isNylasError(error: unknown): error is NylasError {
  return Boolean(
    error &&
      typeof error === "object" &&
      "status" in error &&
      "type" in error,
  );
}
