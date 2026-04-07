import { createClient } from "https://esm.sh/@supabase/supabase-js@2.93.3";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

function jsonResp(body: Record<string, unknown>, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    // --- Auth ---
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) return jsonResp({ error: "Unauthorized" }, 401);

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseKey = Deno.env.get("SUPABASE_ANON_KEY")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

    const userClient = createClient(supabaseUrl, supabaseKey, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: { user }, error: authErr } = await userClient.auth.getUser();
    if (authErr || !user) return jsonResp({ error: "Unauthorized" }, 401);

    // Use service role for DB ops (bypass RLS for slot management)
    const admin = createClient(supabaseUrl, serviceKey);

    // --- Input ---
    const { seller_id, product_id } = await req.json();
    if (!seller_id) return jsonResp({ error: "seller_id required" }, 400);

    // Verify caller owns this seller profile
    const { data: sellerProfile } = await admin
      .from("seller_profiles")
      .select("id, user_id")
      .eq("id", seller_id)
      .single();

    if (!sellerProfile || sellerProfile.user_id !== user.id) {
      return jsonResp({ error: "Forbidden" }, 403);
    }

    // --- 1. Fetch store-level schedules ---
    const { data: schedules } = await admin
      .from("service_availability_schedules")
      .select("day_of_week, start_time, end_time, is_active")
      .eq("seller_id", seller_id)
      .is("product_id", null)
      .order("day_of_week");

    if (!schedules || schedules.length === 0) {
      return jsonResp({
        generated: 0,
        deleted: 0,
        message: "No store hours configured. Set your Store Hours first.",
      });
    }

    const activeSchedules = schedules.filter((s: any) => s.is_active);
    if (activeSchedules.length === 0) {
      return jsonResp({
        generated: 0,
        deleted: 0,
        message: "All days are turned off in Store Hours.",
      });
    }

    // --- 2. Fetch service listings ---
    let listingsQuery = admin
      .from("service_listings")
      .select("product_id, duration_minutes, buffer_minutes, max_bookings_per_slot");

    if (product_id) {
      listingsQuery = listingsQuery.eq("product_id", product_id);
    }

    // We need to filter by seller's products
    const { data: sellerProducts } = await admin
      .from("products")
      .select("id")
      .eq("seller_id", seller_id)
      .eq("approval_status", "approved");

    if (!sellerProducts || sellerProducts.length === 0) {
      return jsonResp({
        generated: 0,
        deleted: 0,
        message: "No approved products found.",
      });
    }

    const approvedIds = sellerProducts.map((p: any) => p.id);

    if (product_id && !approvedIds.includes(product_id)) {
      return jsonResp({
        generated: 0,
        deleted: 0,
        message: "Product is not approved yet. Slots generate after approval.",
      });
    }

    const targetProductIds = product_id ? [product_id] : approvedIds;

    const { data: listings } = await admin
      .from("service_listings")
      .select("product_id, duration_minutes, buffer_minutes, max_bookings_per_slot")
      .in("product_id", targetProductIds);

    if (!listings || listings.length === 0) {
      return jsonResp({
        generated: 0,
        deleted: 0,
        message: "No service configuration found on products.",
      });
    }

    // --- 3. Generate slots (day_of_week based, template slots) ---
    const slotsToUpsert: any[] = [];

    for (const sched of activeSchedules) {
      const [startH, startM] = sched.start_time.split(":").map(Number);
      const [endH, endM] = sched.end_time.split(":").map(Number);
      const startMin = startH * 60 + startM;
      const endMin = endH * 60 + endM;
      if (endMin <= startMin) continue;

      for (const listing of listings) {
        const duration = listing.duration_minutes || 60;
        const buffer = listing.buffer_minutes || 0;
        const maxCap = listing.max_bookings_per_slot || 1;
        let cur = startMin;

        while (cur + duration <= endMin) {
          const startTime = `${String(Math.floor(cur / 60)).padStart(2, "0")}:${String(cur % 60).padStart(2, "0")}`;
          const slotEndMin = cur + duration;
          const endTime = `${String(Math.floor(slotEndMin / 60)).padStart(2, "0")}:${String(slotEndMin % 60).padStart(2, "0")}`;

          slotsToUpsert.push({
            seller_id,
            product_id: listing.product_id,
            day_of_week: sched.day_of_week,
            start_time: startTime,
            end_time: endTime,
            max_capacity: maxCap,
            booked_count: 0,
            is_blocked: false,
          });

          cur += duration + buffer;
        }
      }
    }

    // --- 4. Safe delete: only unbooked slots for target products ---
    const targetIds = listings.map((l: any) => l.product_id);

    // Find slots referenced by active bookings
    const { data: activeBookingSlots } = await admin
      .from("service_bookings")
      .select("slot_id")
      .in("product_id", targetIds)
      .not("status", "in", "(cancelled,completed,no_show)");

    const safeSlotIds = new Set(
      (activeBookingSlots || []).map((r: any) => r.slot_id).filter(Boolean)
    );

    // Get candidate slots to delete
    const { data: candidateSlots } = await admin
      .from("service_slots")
      .select("id")
      .eq("seller_id", seller_id)
      .in("product_id", targetIds)
      .eq("booked_count", 0);

    const idsToDelete = (candidateSlots || [])
      .filter((s: any) => !safeSlotIds.has(s.id))
      .map((s: any) => s.id);

    let deletedCount = 0;
    if (idsToDelete.length > 0) {
      const batchSize = 200;
      for (let i = 0; i < idsToDelete.length; i += batchSize) {
        const { count } = await admin
          .from("service_slots")
          .delete()
          .in("id", idsToDelete.slice(i, i + batchSize));
        deletedCount += count || 0;
      }
    }

    // --- 5. Upsert new slots ---
    let generatedCount = 0;
    if (slotsToUpsert.length > 0) {
      const batchSize = 500;
      for (let i = 0; i < slotsToUpsert.length; i += batchSize) {
        const batch = slotsToUpsert.slice(i, i + batchSize);
        const { data: upserted, error: upsertErr } = await admin
          .from("service_slots")
          .upsert(batch, {
            onConflict: "seller_id,product_id,day_of_week,start_time",
            ignoreDuplicates: false,
          })
          .select("id");

        if (upsertErr) {
          console.error("Slot upsert error:", upsertErr.message);
        } else {
          generatedCount += upserted?.length || 0;
        }
      }
    }

    return jsonResp({
      generated: generatedCount,
      deleted: deletedCount,
      products: listings.length,
      message: generatedCount > 0
        ? `${generatedCount} slots generated for ${listings.length} product(s)`
        : "No slots could be generated. Check store hours and service config.",
    });
  } catch (err: any) {
    console.error("generate-service-slots error:", err);
    return jsonResp({ error: err.message || "Internal error" }, 500);
  }
});
