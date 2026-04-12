import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
      { auth: { autoRefreshToken: false, persistSession: false }, db: { schema: 'public' }, global: { headers: { Authorization: `Bearer ${Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!}` } } }
    );

    const rows = [
      // Sweets & Mithai
      { section_id: "d2000000-0000-0000-0000-000000000001", product_id: "88fd2de0-6a32-4861-b51f-77ac4b1fb398", display_order: 1 },
      { section_id: "d2000000-0000-0000-0000-000000000001", product_id: "dba42783-6bcf-4888-92f9-9030dc572395", display_order: 2 },
      { section_id: "d2000000-0000-0000-0000-000000000001", product_id: "886025e4-9022-4743-b449-bacd593525ce", display_order: 3 },
      { section_id: "d2000000-0000-0000-0000-000000000001", product_id: "6c225e15-7fab-4672-8afc-9faaf05bdfa8", display_order: 4 },
      { section_id: "d2000000-0000-0000-0000-000000000001", product_id: "e446d25a-1375-4e90-b4ef-9d5eb3122891", display_order: 5 },
      // Festive Fashion
      { section_id: "d2000000-0000-0000-0000-000000000002", product_id: "386b07fe-379f-4bc7-a90d-fe55d85bceed", display_order: 1 },
      { section_id: "d2000000-0000-0000-0000-000000000002", product_id: "4ed4d6a8-fd4d-417b-a7b2-3fbc437927fe", display_order: 2 },
      { section_id: "d2000000-0000-0000-0000-000000000002", product_id: "ef34749a-1b32-4daf-bd83-010b0b80459d", display_order: 3 },
      { section_id: "d2000000-0000-0000-0000-000000000002", product_id: "d0d2011a-8214-495a-97d1-b824eaa8a6b7", display_order: 4 },
      { section_id: "d2000000-0000-0000-0000-000000000002", product_id: "6b153a82-ad36-42b4-b103-4d1651c5d8ac", display_order: 5 },
      // Mehendi & Beauty
      { section_id: "d2000000-0000-0000-0000-000000000003", product_id: "21f5e2ec-a4b3-4f3d-b68f-ec6d7029b6b6", display_order: 1 },
      { section_id: "d2000000-0000-0000-0000-000000000003", product_id: "91fee132-6b0c-4e45-aeb8-125d8c9c4e13", display_order: 2 },
      { section_id: "d2000000-0000-0000-0000-000000000003", product_id: "c2ec1b2a-bcd6-418b-8985-b7857cd3fb1e", display_order: 3 },
      { section_id: "d2000000-0000-0000-0000-000000000003", product_id: "1a60493d-9656-46be-8466-848e7312ede4", display_order: 4 },
      { section_id: "d2000000-0000-0000-0000-000000000003", product_id: "bc7b780e-e2d4-4b96-ae35-53f395629106", display_order: 5 },
      // Home Services
      { section_id: "d2000000-0000-0000-0000-000000000004", product_id: "d734b565-54dd-49e0-a56a-58cd91488538", display_order: 1 },
      { section_id: "d2000000-0000-0000-0000-000000000004", product_id: "0a1bd8bd-0fc6-4ffd-af20-8c17eca5ebb9", display_order: 2 },
      { section_id: "d2000000-0000-0000-0000-000000000004", product_id: "a5eea9e0-6c34-4428-90f1-e2851c77392e", display_order: 3 },
      { section_id: "d2000000-0000-0000-0000-000000000004", product_id: "3a0e2fc9-c2a5-4dc8-956d-558bb3514a61", display_order: 4 },
      { section_id: "d2000000-0000-0000-0000-000000000004", product_id: "181e0004-b5f8-4d9a-b85e-8c47521ecd9d", display_order: 5 },
    ];

    // Clear existing
    const sectionIds = [...new Set(rows.map(r => r.section_id))];
    for (const sid of sectionIds) {
      await supabase.from("banner_section_products").delete().eq("section_id", sid);
    }

    const { data, error } = await supabase.from("banner_section_products").insert(rows).select("id");
    if (error) throw error;

    // Also add coupons for Ayurveda & GreenLeaf if missing
    const couponSeeds = [
      { code: "AYUR25", discount_type: "percentage", discount_value: 25, seller_id: "b9914568-df7b-4223-aeea-9828a078039e", is_active: true, show_to_buyers: true, per_user_limit: 2, description: "25% off all Ayurveda services", society_id: "a0000000-0000-0000-0000-000000000001" },
      { code: "FIXHOME", discount_type: "flat", discount_value: 50, seller_id: "c1000000-0000-0000-0000-000000000002", is_active: true, show_to_buyers: true, per_user_limit: 1, description: "₹50 off home services", society_id: "a0000000-0000-0000-0000-000000000001" },
    ];
    for (const c of couponSeeds) {
      await supabase.from("coupons").upsert(c, { onConflict: "code" }).select();
    }

    return new Response(JSON.stringify({ success: true, inserted: data?.length }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
