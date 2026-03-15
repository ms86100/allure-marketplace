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
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

    // Verify user
    const authClient = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: { user }, error: authError } = await authClient.auth.getUser();
    if (authError || !user) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { order_id } = await req.json();
    if (!order_id) {
      return new Response(JSON.stringify({ error: "Missing order_id" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabase = createClient(supabaseUrl, serviceKey);

    // Get original order — verify ownership
    const { data: originalOrder, error: orderErr } = await supabase
      .from("orders")
      .select("id, buyer_id, seller_id, society_id, fulfillment_type, order_type, delivery_fee, discount_amount")
      .eq("id", order_id)
      .single();

    if (orderErr || !originalOrder) {
      return new Response(JSON.stringify({ error: "Order not found" }), {
        status: 404,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (originalOrder.buyer_id !== user.id) {
      return new Response(JSON.stringify({ error: "Forbidden" }), {
        status: 403,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Get order items
    const { data: items, error: itemsErr } = await supabase
      .from("order_items")
      .select("product_id, quantity, unit_price")
      .eq("order_id", order_id);

    if (itemsErr || !items || items.length === 0) {
      return new Response(JSON.stringify({ error: "No items found in original order" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Verify all products are still available and approved
    const productIds = items.map(i => i.product_id);
    const { data: products } = await supabase
      .from("products")
      .select("id, price, status, is_available")
      .in("id", productIds);

    const availableProducts = (products || []).filter(p => p.is_available && p.status === 'approved');
    if (availableProducts.length === 0) {
      return new Response(JSON.stringify({ error: "No items are currently available for reorder" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Build cart items for the reorder
    const cartItems = items
      .filter(i => availableProducts.some(p => p.id === i.product_id))
      .map(i => {
        const currentProduct = availableProducts.find(p => p.id === i.product_id)!;
        return {
          product_id: i.product_id,
          quantity: i.quantity,
          unit_price: currentProduct.price, // Use current price
        };
      });

    const totalAmount = cartItems.reduce((sum, i) => sum + (i.unit_price * i.quantity), 0);

    // Create new order using the RPC
    const { data: newOrders, error: createErr } = await supabase
      .rpc("create_multi_vendor_orders", {
        p_buyer_id: user.id,
        p_society_id: originalOrder.society_id,
        p_items: cartItems.map(i => ({
          product_id: i.product_id,
          quantity: i.quantity,
          unit_price: i.unit_price,
        })),
        p_fulfillment_type: originalOrder.fulfillment_type || 'self_pickup',
        p_delivery_fee: 0,
        p_discount_amount: 0,
      });

    if (createErr) {
      console.error("Error creating reorder:", createErr);
      return new Response(JSON.stringify({ error: createErr.message }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    return new Response(JSON.stringify({
      success: true,
      orders: newOrders,
      items_reordered: cartItems.length,
      total_amount: totalAmount,
    }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    console.error("Error in quick-reorder:", err);
    return new Response(JSON.stringify({ error: String(err) }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
