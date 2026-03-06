import { toast } from 'sonner';

/**
 * Escapes special characters in user input before using in ILIKE queries.
 * Prevents pattern injection via % and _ characters.
 */
export function escapeIlike(input: string): string {
  return input.replace(/%/g, '\\%').replace(/_/g, '\\_');
}

/**
 * Centralized API error handler.
 * Extracts a human-readable message from various error shapes
 * (Supabase PostgrestError, Error, string, unknown) and shows a toast.
 * 
 * @param error - The caught error
 * @param fallbackMessage - Message to show if error cannot be parsed
 * @returns The extracted error message string
 */
export function handleApiError(
  error: unknown,
  fallbackMessage = 'Something went wrong'
): string {
  let message = fallbackMessage;

  if (error instanceof Error) {
    message = error.message;
  } else if (typeof error === 'object' && error !== null) {
    // Supabase PostgrestError shape: { message, details, hint, code }
    const pgError = error as { message?: string; details?: string };
    message = pgError.message || pgError.details || fallbackMessage;
  } else if (typeof error === 'string') {
    message = error;
  }

  toast.error(message);
  return message;
}

/**
 * Adds ±20% jitter to a staleTime value to prevent cache stampedes.
 * When thousands of clients share the same TTL, they all refetch simultaneously
 * on expiry. Jitter spreads refetches across a time window.
 *
 * @param baseMs - The base staleTime in milliseconds (e.g., 60_000)
 * @returns A jittered staleTime value within ±20% of the base
 *
 * @example
 * useQuery({
 *   queryKey: ['sellers'],
 *   queryFn: fetchSellers,
 *   staleTime: jitteredStaleTime(60_000), // 48_000–72_000ms
 * });
 */
export function jitteredStaleTime(baseMs: number): number {
  const jitter = 0.2; // ±20%
  const min = baseMs * (1 - jitter);
  const max = baseMs * (1 + jitter);
  return Math.round(min + Math.random() * (max - min));
}
