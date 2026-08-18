import "server-only";

export function getNylasConfig() {
  const apiKey = process.env.NYLAS_API_KEY;
  const clientId = process.env.NYLAS_CLIENT_ID;
  const apiUri = process.env.NYLAS_API_URI?.replace(/\/$/, "");
  const callbackUri = process.env.NYLAS_CALLBACK_URI?.replace(/\/$/, "");

  return {
    apiKey,
    clientId,
    apiUri,
    callbackUri,
    isConfigured: Boolean(apiKey && clientId && apiUri && callbackUri),
  };
}
