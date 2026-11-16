/** Turn Supabase errors into messages that say how to fix them. */
export function supabaseError(action: string, error: { code?: string; message: string }): Error {
  if (error.code === "PGRST205" || error.code === "42P01") {
    return new Error(`${action}: the Supabase tables don't exist yet. Run supabase/setup.sql once in Supabase → SQL Editor, then retry.`);
  }
  return new Error(`${action}: ${error.message}`);
}
