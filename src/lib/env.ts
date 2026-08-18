export function getPublicSupabaseConfig() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const publishableKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;

  return {
    url,
    publishableKey,
    isConfigured: Boolean(url && publishableKey),
  };
}

export function getOpenAiModel() {
  return process.env.OPENAI_MODEL ?? "gpt-5.6";
}

export function getAppUrl() {
  return process.env.APP_URL?.replace(/\/$/, "") ?? null;
}
