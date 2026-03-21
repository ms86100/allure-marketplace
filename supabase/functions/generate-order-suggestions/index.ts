import { createClient } from "https://esm.sh/@supabase/supabase-js@2.93.3";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    const now = new Date();
    // Bug fix: Use IST for time-of-day pattern matching (Deno runs in UTC)
    const IST_OFFSET_MS = 5.5 * 60 * 60_000;
    const nowIST = new Date(now.getTime() + IST_OFFSET_MS);
    const currentDay = nowIST.getUTCDay(); // 0=Sun..6=Sat in IST
    const currentHour = nowIST.getUTCHours(); // Hour in IST
    const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000).toISOString();

    // Get all users who have completed orders in the last 30 days
    const { data: activeUsers, error: usersError } = await supabase
      .from('orders')
      .select('buyer_id')
      .eq('status', 'completed')
      .gte('created_at', thirtyDaysAgo);

    if (usersError) {
      console.error('Error fetching active users:', usersError);
      return new Response(JSON.stringify({ error: usersError.message }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const uniqueUserIds = [...new Set((activeUsers || []).map(o => o.buyer_id))];
    let suggestionsCreated = 0;
    let notificationsSent = 0;

    for (const userId of uniqueUserIds) {
      // Get completed orders for this user in last 30 days
      const { data: orders } = await supabase
        .from('orders')
        .select('id, buyer_id, seller_id, created_at')
        .eq('buyer_id', userId)
        .eq('status', 'completed')
        .gte('created_at', thirtyDaysAgo);

      if (!orders || orders.length < 2) continue;

      // Get order items to find product patterns
      const orderIds = orders.map(o => o.id);
      const { data: orderItems } = await supabase
        .from('order_items')
        .select('order_id, product_id')
        .in('order_id', orderIds);

      if (!orderItems || orderItems.length === 0) continue;

      // Build frequency map: (product_id, seller_id, day_of_week, hour) → count
      const patternMap = new Map<string, { productId: string; sellerId: string; day: number; hour: number; count: number }>();

      for (const item of orderItems) {
        const order = orders.find(o => o.id === item.order_id);
        if (!order) continue;

        const orderDate = new Date(order.created_at);
        const day = orderDate.getDay();
        const hour = orderDate.getHours();
        const key = `${item.product_id}:${order.seller_id}:${day}:${hour}`;

        const existing = patternMap.get(key);
        if (existing) {
          existing.count++;
        } else {
          patternMap.set(key, {
            productId: item.product_id,
            sellerId: order.seller_id,
            day,
            hour,
            count: 1,
          });
        }
      }

      // Insert suggestions for patterns with ≥2 occurrences matching today's day
      for (const [, pattern] of patternMap) {
        if (pattern.count < 2 || pattern.day !== currentDay) continue;

        // Check if suggestion already exists for today
        const todayStart = new Date(now);
        todayStart.setHours(0, 0, 0, 0);

        const { count: existingCount } = await supabase
          .from('order_suggestions')
          .select('id', { count: 'exact', head: true })
          .eq('user_id', userId)
          .eq('product_id', pattern.productId)
          .eq('seller_id', pattern.sellerId)
          .gte('created_at', todayStart.toISOString());

        if (existingCount && existingCount > 0) continue;

        const confidence = Math.min(0.99, 0.3 + (pattern.count * 0.15));

        // Insert suggestion and capture ID
        const { data: insertedSuggestion } = await supabase.from('order_suggestions').insert({
          user_id: userId,
          product_id: pattern.productId,
          seller_id: pattern.sellerId,
          trigger_type: 'time_pattern',
          day_of_week: pattern.day,
          time_bucket: pattern.hour,
          confidence_score: confidence,
          suggested_at: now.toISOString(),
        }).select('id').single();

        suggestionsCreated++;
        const suggestionId = insertedSuggestion?.id;

        // Send push notification if within ±1 hour of predicted time
        if (Math.abs(currentHour - pattern.hour) <= 1) {
          // Get product name for notification
          const { data: product } = await supabase
            .from('products')
            .select('name')
            .eq('id', pattern.productId)
            .single();

          const { data: seller } = await supabase
            .from('seller_profiles')
            .select('business_name')
            .eq('id', pattern.sellerId)
            .single();

          const reorderPath = suggestionId
            ? `/marketplace?reorder=${suggestionId}`
            : '/marketplace';

          await supabase.from('notification_queue').insert({
            user_id: userId,
            title: '🛒 Order again?',
            body: `You usually order ${product?.name || 'this item'} from ${seller?.business_name || 'this seller'} around this time.`,
            type: 'order_suggestion',
            reference_path: reorderPath,
            payload: {
              type: 'order_suggestion',
              entity_type: 'suggestion',
              entity_id: suggestionId ?? pattern.productId,
              workflow_status: 'suggested',
              action: 'Reorder',
              product_id: pattern.productId,
              seller_id: pattern.sellerId,
              suggestion_id: suggestionId,
            },
          });

          notificationsSent++;
        }
      }
    }

    return new Response(JSON.stringify({
      suggestions_created: suggestionsCreated,
      notifications_sent: notificationsSent,
      users_analyzed: uniqueUserIds.length,
    }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    console.error("Error in generate-order-suggestions:", err);
    return new Response(JSON.stringify({ error: String(err) }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
