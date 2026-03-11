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

    // Find bookings starting within the next 55-65 minutes (run every 10 min, catch 1hr window)
    const now = new Date();
    const from55min = new Date(now.getTime() + 55 * 60_000);
    const to65min = new Date(now.getTime() + 65 * 60_000);
    const todayStr = now.toISOString().split("T")[0];

    const { data: bookings, error } = await supabase
      .from("service_bookings")
      .select("id, buyer_id, seller_id, product_id, booking_date, start_time, end_time")
      .eq("booking_date", todayStr)
      .in("status", ["confirmed", "scheduled", "rescheduled", "requested"])
      .gte("start_time", from55min.toTimeString().slice(0, 8))
      .lte("start_time", to65min.toTimeString().slice(0, 8));

    if (error) {
      console.error("Error fetching bookings:", error);
      return new Response(JSON.stringify({ error: error.message }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (!bookings || bookings.length === 0) {
      return new Response(JSON.stringify({ reminded: 0 }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    let reminded = 0;

    for (const booking of bookings) {
      const timeStr = booking.start_time?.slice(0, 5) || "soon";

      // Get product name
      const { data: product } = await supabase
        .from("products")
        .select("name")
        .eq("id", booking.product_id)
        .single();

      const productName = product?.name || "your appointment";

      // Get seller user_id
      const { data: seller } = await supabase
        .from("seller_profiles")
        .select("user_id, business_name")
        .eq("id", booking.seller_id)
        .single();

      // Notify buyer
      await supabase.from("notification_queue").insert({
        user_id: booking.buyer_id,
        title: "⏰ Appointment in 1 hour",
        body: `Your appointment for ${productName} is at ${timeStr} today.`,
        type: "booking_reminder",
        reference_path: `/orders`,
        payload: { type: "booking_reminder", bookingId: booking.id },
      });

      // Notify seller
      if (seller?.user_id) {
        const { data: buyer } = await supabase
          .from("profiles")
          .select("name")
          .eq("id", booking.buyer_id)
          .single();

        await supabase.from("notification_queue").insert({
          user_id: seller.user_id,
          title: "⏰ Upcoming Appointment",
          body: `${buyer?.name || "A customer"} has an appointment for ${productName} at ${timeStr}.`,
          type: "booking_reminder",
          reference_path: `/orders`,
          payload: { type: "booking_reminder", bookingId: booking.id },
        });
      }

      reminded++;
    }

    return new Response(JSON.stringify({ reminded, total: bookings.length }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    console.error("Error in send-booking-reminders:", err);
    return new Response(JSON.stringify({ error: String(err) }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
