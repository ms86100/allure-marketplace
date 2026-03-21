import { Hono } from "https://deno.land/x/hono@v4.3.11/mod.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.93.3";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const app = new Hono();

// Handle CORS preflight
app.options("*", (c) => {
  return c.json({}, 200, corsHeaders);
});

// Auto-cancel expired urgent orders
app.post("/", async (c) => {
  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // Load admin-configured statuses from system_settings
    const { data: settingsRows } = await supabase
      .from("system_settings")
      .select("key, value")
      .in("key", ["cancellable_statuses", "auto_completable_statuses"]);

    const settings: Record<string, string> = {};
    for (const row of settingsRows || []) {
      if (row.key && row.value) settings[row.key] = row.value;
    }

    let cancellableStatuses: string[];
    try { cancellableStatuses = JSON.parse(settings["cancellable_statuses"] || '["placed"]'); }
    catch { cancellableStatuses = ["placed"]; }

    let autoCompletableStatuses: string[];
    try { autoCompletableStatuses = JSON.parse(settings["auto_completable_statuses"] || '["delivered"]'); }
    catch { autoCompletableStatuses = ["delivered"]; }

    // Find orders that have passed their auto_cancel_at time and are still in cancellable statuses
    const now = new Date().toISOString();
    const thirtyMinAgo = new Date(Date.now() - 30 * 60 * 1000).toISOString();

    // Query 1: Urgent orders past auto_cancel_at (skip if buyer already confirmed/paid)
    const { data: urgentExpired, error: urgentErr } = await supabase
      .from("orders")
      .select("id, buyer_id, seller_id, total_amount")
      .in("status", cancellableStatuses)
      .not("auto_cancel_at", "is", null)
      .lt("auto_cancel_at", now)
      .not("payment_status", "in", "(buyer_confirmed,paid)");

    // Query 2: Orphaned UPI/online orders — payment_status=pending, non-COD, older than 30 min
    const { data: orphanedUpi, error: orphanErr } = await supabase
      .from("orders")
      .select("id, buyer_id, seller_id, total_amount")
      .in("status", cancellableStatuses)
      .eq("payment_status", "pending")
      .neq("payment_type", "cod")
      .lt("created_at", thirtyMinAgo);

    const fetchError = urgentErr || orphanErr;

    // Tag each order with its cancel reason so we write the correct rejection_reason
    const urgentIds = new Set((urgentExpired || []).map(o => o.id));
    const orphanIds = new Set((orphanedUpi || []).map(o => o.id));

    const expiredOrders = [
      ...(urgentExpired || []),
      ...(orphanedUpi || []),
    ].filter((order, idx, arr) => arr.findIndex(o => o.id === order.id) === idx);

    if (fetchError) {
      console.error("Error fetching expired orders:", fetchError);
      return c.json({ error: fetchError.message }, 500, corsHeaders);
    }

    if (!expiredOrders || expiredOrders.length === 0) {
      console.log("No expired orders to cancel");
    } else {
      console.log(`Found ${expiredOrders.length} expired orders to cancel`);
    }

    // --- Auto-complete delivered orders past auto_complete_at ---
    const { data: deliveredExpired, error: deliveredErr } = await supabase
      .from("orders")
      .select("id, buyer_id, seller_id")
      .in("status", autoCompletableStatuses)
      .not("auto_complete_at", "is", null)
      .lt("auto_complete_at", now);

    if (deliveredErr) {
      console.error("Error fetching delivered orders for auto-complete:", deliveredErr);
    }

    const autoCompleteResults = await Promise.allSettled(
      (deliveredExpired || []).map(async (order) => {
        const { error: completeError } = await supabase
          .from("orders")
          .update({
            status: "completed",
            auto_complete_at: null,
            updated_at: now,
          })
          .eq("id", order.id)
          .eq("status", "delivered");

        if (completeError) {
          console.error(`Error auto-completing order ${order.id}:`, completeError);
          throw { id: order.id, error: completeError.message };
        }
        console.log(`Order ${order.id} auto-completed`);
        return { id: order.id, success: true };
      })
    );

    // --- Cancel expired orders ---
    // Bug 1 fix: Add status guard to prevent cancelling orders that were accepted between SELECT and UPDATE
    const cancelResults = await Promise.allSettled(
      (expiredOrders || []).map(async (order) => {
        // Dynamic rejection reason based on WHY the order is being cancelled
        const reason = urgentIds.has(order.id) && !orphanIds.has(order.id)
          ? "Order automatically cancelled — seller did not respond in time"
          : orphanIds.has(order.id) && !urgentIds.has(order.id)
          ? "Order automatically cancelled — payment was not completed within the allowed time"
          : "Order automatically cancelled — seller did not respond in time";

        const { error: updateError, data: updated } = await supabase
          .from("orders")
          .update({
            status: "cancelled",
            rejection_reason: reason,
            auto_cancel_at: null,
            updated_at: now,
          })
          .eq("id", order.id)
          .in("status", cancellableStatuses)
          .select("id");

        if (updateError) {
          console.error(`Error cancelling order ${order.id}:`, updateError);
          throw { id: order.id, error: updateError.message };
        }
        if (!updated || updated.length === 0) {
          console.log(`Order ${order.id} already transitioned — skipping cancel`);
          return { id: order.id, success: false, skipped: true };
        }
        console.log(`Order ${order.id} auto-cancelled: ${reason}`);
        return { id: order.id, success: true };
      })
    );

    const mapResult = (r: PromiseSettledResult<any>) =>
      r.status === 'fulfilled' ? r.value : { id: (r.reason as any)?.id, success: false, error: (r.reason as any)?.error };

    const cancelledCount = cancelResults.filter(r => r.status === 'fulfilled').length;
    const completedCount = autoCompleteResults.filter(r => r.status === 'fulfilled').length;

    return c.json(
      {
        message: `Cancelled ${cancelledCount}, auto-completed ${completedCount}`,
        cancelled: cancelledCount,
        auto_completed: completedCount,
        cancel_results: cancelResults.map(mapResult),
        complete_results: autoCompleteResults.map(mapResult),
      },
      200,
      corsHeaders
    );
  } catch (error) {
    console.error("Error in auto-cancel function:", error);
    return c.json({ error: String(error) }, 500, corsHeaders);
  }
});

Deno.serve(app.fetch);
