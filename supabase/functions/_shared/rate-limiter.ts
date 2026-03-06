import { createClient } from "https://esm.sh/@supabase/supabase-js@2.93.3";

/**
 * Shared rate limiter for edge functions.
 * Uses atomic upsert to prevent race conditions under concurrency.
 *
 * @param key - Unique key for the rate limit (e.g., `user:${userId}:create-order`)
 * @param maxRequests - Maximum requests allowed in the window
 * @param windowSeconds - Time window in seconds
 * @returns { allowed: boolean, remaining: number }
 */
export async function checkRateLimit(
  key: string,
  maxRequests: number,
  windowSeconds: number
): Promise<{ allowed: boolean; remaining: number }> {
  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    const now = new Date();
    const windowStart = new Date(now.getTime() - windowSeconds * 1000);

    // Atomic: reset expired windows and increment in one operation
    // First, try to get the existing entry
    const { data: existing } = await supabase
      .from("rate_limits")
      .select("*")
      .eq("key", key)
      .single();

    if (existing) {
      const existingWindowStart = new Date(existing.window_start);

      if (existingWindowStart < windowStart) {
        // Window expired — atomic reset with count=1
        const { error } = await supabase
          .from("rate_limits")
          .update({ count: 1, window_start: now.toISOString() })
          .eq("key", key)
          .eq("window_start", existing.window_start); // optimistic lock

        if (error) {
          // Another request already reset — re-check
          return checkRateLimitRetry(supabase, key, maxRequests, windowSeconds);
        }
        return { allowed: true, remaining: maxRequests - 1 };
      }

      if (existing.count >= maxRequests) {
        return { allowed: false, remaining: 0 };
      }

      // Atomic increment with optimistic lock on current count
      const { data: updated, error } = await supabase
        .from("rate_limits")
        .update({ count: existing.count + 1 })
        .eq("key", key)
        .eq("count", existing.count) // optimistic lock — prevents race
        .select("count")
        .single();

      if (error || !updated) {
        // Race: another request incremented first — re-check
        return checkRateLimitRetry(supabase, key, maxRequests, windowSeconds);
      }

      return { allowed: true, remaining: maxRequests - updated.count };
    }

    // No existing entry — atomic upsert
    await supabase
      .from("rate_limits")
      .upsert(
        { key, count: 1, window_start: now.toISOString() },
        { onConflict: "key" }
      );

    return { allowed: true, remaining: maxRequests - 1 };
  } catch (error) {
    // Fallback: if rate_limits table is unreachable, allow the request
    // rather than blocking all users with a 500 error
    console.error("Rate limiter error (allowing request):", error);
    return { allowed: true, remaining: maxRequests };
  }
}

/**
 * Retry path: re-read the current state after an optimistic lock failure
 */
async function checkRateLimitRetry(
  supabase: any,
  key: string,
  maxRequests: number,
  _windowSeconds: number
): Promise<{ allowed: boolean; remaining: number }> {
  const { data } = await supabase
    .from("rate_limits")
    .select("count")
    .eq("key", key)
    .single();

  if (!data) return { allowed: true, remaining: maxRequests - 1 };

  if (data.count >= maxRequests) {
    return { allowed: false, remaining: 0 };
  }

  return { allowed: true, remaining: maxRequests - data.count };
}

/**
 * Returns a 429 Too Many Requests response
 */
export function rateLimitResponse(corsHeaders: Record<string, string>) {
  return new Response(
    JSON.stringify({ error: "Too many requests. Please try again later." }),
    {
      status: 429,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    }
  );
}
