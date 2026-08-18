import "server-only";

export function getSupabaseSecretKey() {
  const secretKey = process.env.SUPABASE_SECRET_KEY;
  if (!secretKey) {
    throw new Error("missing_supabase_secret_key");
  }
  return secretKey;
}
