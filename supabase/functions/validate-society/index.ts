import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { withAuth } from "../_shared/auth.ts";
import { checkRateLimit, rateLimitResponse } from "../_shared/rate-limiter.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    // Use shared auth middleware
    const authResult = await withAuth(req, corsHeaders);
    if (authResult instanceof Response) return authResult;
    const { userId } = authResult;

    const body = await req.json();
    const { society_id, new_society } = body;

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const adminClient = createClient(supabaseUrl, supabaseServiceKey);

    // Handle new society creation
    if (new_society && typeof new_society === "object") {
      // Rate limit: max 3 society creations per user per hour
      const rl = await checkRateLimit(`create-society:${userId}`, 3, 3600);
      if (!rl.allowed) return rateLimitResponse(corsHeaders);

      const { name, slug, address, city, state, pincode, latitude, longitude } = new_society;

      if (!name || !slug) {
        return new Response(
          JSON.stringify({ error: "new_society requires name and slug" }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      // Sanitize slug
      const sanitizedSlug = String(slug).toLowerCase().replace(/[^a-z0-9-]/g, '').slice(0, 100);
      const sanitizedName = String(name).trim().slice(0, 200);

      if (!sanitizedSlug || sanitizedSlug.length < 3) {
        return new Response(
          JSON.stringify({ error: "Slug must be at least 3 alphanumeric characters" }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      // Check for duplicate slug
      const { data: existingSlug } = await adminClient
        .from("societies")
        .select("id")
        .eq("slug", sanitizedSlug)
        .maybeSingle();

      if (existingSlug) {
        return new Response(
          JSON.stringify({ error: "A society with this slug already exists" }),
          { status: 409, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      const { data: created, error: createError } = await adminClient
        .from("societies")
        .insert({
          name: sanitizedName,
          slug: sanitizedSlug,
          address: address || null,
          city: city || null,
          state: state || null,
          pincode: pincode || null,
          latitude: latitude || null,
          longitude: longitude || null,
          is_verified: false,
          is_active: false, // Requires admin approval before activation
        })
        .select("id, name, is_active, is_verified")
        .single();

      if (createError) {
        console.error("Society creation error:", createError);
        return new Response(
          JSON.stringify({ error: "Failed to create society: " + createError.message }),
          { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      return new Response(
        JSON.stringify({
          valid: true,
          society: {
            id: created.id,
            name: created.name,
            is_active: created.is_active,
            is_verified: created.is_verified,
          },
        }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Handle existing society validation — also rate-limited
    const rlValidate = await checkRateLimit(`validate-society:${userId}`, 20, 60);
    if (!rlValidate.allowed) return rateLimitResponse(corsHeaders);

    if (!society_id || typeof society_id !== "string") {
      return new Response(
        JSON.stringify({ error: "society_id or new_society is required" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    if (!uuidRegex.test(society_id)) {
      return new Response(
        JSON.stringify({ error: "Invalid society_id format" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const { data: society, error: societyError } = await adminClient
      .from("societies")
      .select("id, name, is_active, is_verified")
      .eq("id", society_id)
      .single();

    if (societyError || !society) {
      return new Response(
        JSON.stringify({ error: "Society not found", valid: false }),
        { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    return new Response(
      JSON.stringify({
        valid: true,
        society: {
          id: society.id,
          name: society.name,
          is_active: society.is_active,
          is_verified: society.is_verified,
        },
      }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (err) {
    console.error("Unexpected error:", err);
    return new Response(
      JSON.stringify({ error: "Internal server error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
