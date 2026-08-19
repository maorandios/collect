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

export function getOpenAiSetupModel() {
  return process.env.OPENAI_SETUP_MODEL ?? "gpt-5.6-luna";
}

export function getOpenAiSetupFallbackModel() {
  return process.env.OPENAI_SETUP_FALLBACK_MODEL ?? "gpt-5.6-terra";
}

export function getOpenAiSetupReasoningEffort(): "none" | "low" {
  const value = process.env.OPENAI_SETUP_REASONING_EFFORT;
  return value === "low" ? "low" : "none";
}

export function getAppUrl() {
  return process.env.APP_URL?.replace(/\/$/, "") ?? null;
}

export function getDevSchedulesEnabled() {
  return process.env.ENABLE_DEV_SCHEDULES === "true" && process.env.NODE_ENV !== "production";
}
