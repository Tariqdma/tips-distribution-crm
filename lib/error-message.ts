/**
 * Supabase returns PostgrestError objects that are not `instanceof Error`, so
 * the usual `error instanceof Error ? error.message : fallback` hides the real
 * cause. This reads `message` from any error-shaped value.
 */
export function describeError(error: unknown, fallback: string): string {
  if (error instanceof Error && error.message) return error.message;
  if (error && typeof error === "object" && "message" in error && typeof (error as { message: unknown }).message === "string") {
    return (error as { message: string }).message || fallback;
  }
  return fallback;
}
