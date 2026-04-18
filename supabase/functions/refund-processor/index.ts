// Refund Processor Edge Function
// Single abstraction point for payment-gateway refund execution.
// Currently: simulates a successful gateway refund (manual mode).
// Future: replace callGateway() with Razorpay/Stripe refund API.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.93.3";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

interface ProcessRequest {
  refund_id: string;
}

// TODO: Replace with real PSP integration (Razorpay/Stripe)
async function callGateway(refundId: string, amount: number): Promise<{
  ok: boolean;
  reference: string;
  status: string;
  raw: any;
}> {
  // Synthetic gateway success — wire real provider here.
  return {
    ok: true,
    reference: `manual-${refundId.slice(0, 8)}-${Date.now()}`,
    status: 'processed',
    raw: { mode: 'manual', simulated: true },
  };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, serviceKey);

    // Auth: caller must be a logged-in user OR cron/service role
    const authHeader = req.headers.get("Authorization") || "";
    const isService = authHeader === `Bearer ${serviceKey}`;
    const isCron = req.headers.get("x-cron-secret") === Deno.env.get("CRON_SECRET");

    if (!isService && !isCron) {
      // Validate user JWT via anon client
      const userClient = createClient(supabaseUrl, Deno.env.get("SUPABASE_ANON_KEY")!, {
        global: { headers: { Authorization: authHeader } },
      });
      const { data: { user } } = await userClient.auth.getUser();
      if (!user) {
        return new Response(JSON.stringify({ error: "Unauthorized" }), {
          status: 401,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
    }

    const body = (await req.json().catch(() => ({}))) as ProcessRequest;
    if (!body.refund_id) {
      return new Response(JSON.stringify({ error: "refund_id required" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Fetch refund
    const { data: refund, error: fetchErr } = await supabase
      .from("refund_requests")
      .select("id, refund_state, amount, order_id, buyer_id")
      .eq("id", body.refund_id)
      .single();

    if (fetchErr || !refund) {
      return new Response(JSON.stringify({ error: "Refund not found" }), {
        status: 404,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (refund.refund_state !== 'approved') {
      return new Response(
        JSON.stringify({
          ok: true,
          skipped: true,
          state: refund.refund_state,
          message: `Refund already in state ${refund.refund_state}`,
        }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    // Step 1: initiate (idempotent via UNIQUE idempotency_key)
    const idempotencyKey = `refund-${refund.id}-attempt-1`;
    const { error: initErr } = await supabase.rpc("initiate_refund", {
      p_refund_id: refund.id,
      p_idempotency_key: idempotencyKey,
    });
    if (initErr) {
      console.error("[refund-processor] initiate failed", initErr);
      return new Response(JSON.stringify({ error: initErr.message }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Step 2: call gateway
    const gw = await callGateway(refund.id, Number(refund.amount));

    // Step 3: complete or fail
    if (gw.ok) {
      const { error: doneErr } = await supabase.rpc("complete_refund", {
        p_refund_id: refund.id,
        p_gateway_ref: gw.reference,
        p_gateway_status: gw.status,
      });
      if (doneErr) {
        console.error("[refund-processor] complete failed", doneErr);
        return new Response(JSON.stringify({ error: doneErr.message }), {
          status: 500,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      console.log(`[refund-processor] completed refund ${refund.id} ref=${gw.reference}`);
      return new Response(
        JSON.stringify({ ok: true, state: 'refund_completed', gateway_ref: gw.reference }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    } else {
      await supabase.rpc("fail_refund", {
        p_refund_id: refund.id,
        p_reason: 'Gateway error',
      });
      return new Response(
        JSON.stringify({ ok: false, state: 'refund_failed' }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }
  } catch (err: any) {
    console.error("[refund-processor] error", err);
    return new Response(JSON.stringify({ error: err.message || "Internal error" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
