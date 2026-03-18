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

    // Find orders that have passed their auto_cancel_at time and are still in 'placed' status
    const now = new Date().toISOString();
    const fifteenMinAgo = new Date(Date.now() - 15 * 60 * 1000).toISOString();

    // Query 1: Urgent orders past auto_cancel_at (skip if buyer already confirmed/paid)
    const { data: urgentExpired, error: urgentErr } = await supabase
      .from("orders")
      .select("id, buyer_id, seller_id, total_amount")
      .eq("status", "placed")
      .not("auto_cancel_at", "is", null)
      .lt("auto_cancel_at", now)
      .not("payment_status", "in", "(buyer_confirmed,paid)");

    // Query 2: Orphaned UPI/online orders — payment_status=pending, non-COD, older than 15 min
    const { data: orphanedUpi, error: orphanErr } = await supabase
      .from("orders")
      .select("id, buyer_id, seller_id, total_amount")
      .eq("status", "placed")
      .eq("payment_status", "pending")
      .neq("payment_type", "cod")
      .lt("created_at", fifteenMinAgo);

    const fetchError = urgentErr || orphanErr;
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
      .eq("status", "delivered")
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
    const cancelResults = await Promise.allSettled(
      (expiredOrders || []).map(async (order) => {
        const { error: updateError } = await supabase
          .from("orders")
          .update({
            status: "cancelled",
            rejection_reason: "Order automatically cancelled - seller did not respond within the time limit",
            auto_cancel_at: null,
            updated_at: now,
          })
          .eq("id", order.id);

        if (updateError) {
          console.error(`Error cancelling order ${order.id}:`, updateError);
          throw { id: order.id, error: updateError.message };
        }
        console.log(`Order ${order.id} auto-cancelled`);
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
