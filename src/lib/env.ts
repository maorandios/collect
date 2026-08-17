export function getPublicSupabaseConfig() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  return {
    url,
    anonKey,
    isConfigured: Boolean(url && anonKey),
  };
}

export function getOpenAiModel() {
  return process.env.OPENAI_MODEL ?? "gpt-5.6";
}

export function getAppUrl() {
  return process.env.APP_URL?.replace(/\/$/, "") ?? null;
}
