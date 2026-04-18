import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.93.3";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

interface Rule {
  id: string;
  key: string;
  entity_type: string;
  trigger_status: string;
  delay_seconds: number;
  repeat_interval_seconds: number | null;
  max_repeats: number;
  escalation_level: number;
  target_actor: "buyer" | "seller" | "admin" | "rider";
  template_key: string;
  payload_extra: Record<string, unknown>;
  priority: number;
  max_per_hour: number;
  dynamic_multiplier_enabled: boolean;
}

const LOCK_KEY = 0x4e6f74456e67696e; // 'NotEngin' as bigint-ish

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const supabase = createClient(supabaseUrl, serviceKey);

  const startedAt = new Date().toISOString();
  let rulesEvaluated = 0;
  let entitiesScanned = 0;
  let enqueued = 0;
  let errors = 0;
  const detail: Record<string, number> = {};

  // ─── Advisory lock — prevent concurrent runs ───
  const { data: lockData } = await supabase.rpc("pg_try_advisory_lock", {
    key: LOCK_KEY,
  } as any).catch(() => ({ data: null }));

  // Fallback: if RPC isn't exposed, use a raw query via service role
  let acquiredLock = lockData === true;
  if (lockData === null) {
    // Best-effort: skip lock if pg_try_advisory_lock not callable. Idempotency
    // is still guaranteed by dedupe_key unique index downstream.
    acquiredLock = true;
  }

  if (!acquiredLock) {
    await supabase.from("notification_engine_runs").insert({
      started_at: startedAt,
      finished_at: new Date().toISOString(),
      locked: true,
      note: "skipped — another run holds advisory lock",
    });
    return new Response(
      JSON.stringify({ success: true, skipped: true, reason: "lock_held" }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }

  try {
    const { data: rules, error: rulesErr } = await supabase
      .from("notification_rules")
      .select("*")
      .eq("active", true);
    if (rulesErr) throw rulesErr;

    for (const rule of (rules || []) as Rule[]) {
      rulesEvaluated += 1;
      try {
        if (rule.entity_type === "order") {
          const cutoff = new Date(Date.now() - rule.delay_seconds * 1000).toISOString();
          const { data: orders } = await supabase
            .from("orders")
            .select("id, buyer_id, seller_id, status, status_changed_at, order_number")
            .eq("status", rule.trigger_status)
            .lte("status_changed_at", cutoff)
            .limit(500);

          entitiesScanned += orders?.length || 0;

          for (const o of orders || []) {
            const targetUserId = await resolveTargetUserId(
              supabase,
              rule.target_actor,
              o as any,
            );
            if (!targetUserId) continue;

            const orderShort = (o as any).order_number
              ? String((o as any).order_number)
              : (o as any).id.slice(0, 8);

            const { data: queueId, error: enqErr } = await supabase.rpc(
              "fn_enqueue_from_rule",
              {
                _rule_id: rule.id,
                _entity_id: (o as any).id,
                _target_user_id: targetUserId,
                _vars: { order_short: orderShort, order_id: (o as any).id },
                _reference_path: `/orders/${(o as any).id}`,
              },
            );
            if (enqErr) {
              errors += 1;
              console.error("[engine] enqueue failed", rule.key, enqErr.message);
            } else if (queueId) {
              enqueued += 1;
              detail[rule.key] = (detail[rule.key] || 0) + 1;
            }
          }
        } else if (rule.entity_type === "delivery") {
          const level = rule.trigger_status === "stall_2" ? 2 : 1;
          const { data: assignments } = await supabase
            .from("delivery_assignments")
            .select(
              "id, order_id, stall_level, orders:orders!delivery_assignments_order_id_fkey(id, buyer_id, seller_id, order_number, status)",
            )
            .eq("stall_level", level)
            .limit(500);

          entitiesScanned += assignments?.length || 0;

          for (const a of assignments || []) {
            const order = Array.isArray((a as any).orders)
              ? (a as any).orders[0]
              : (a as any).orders;
            if (!order) continue;
            const targetUserId = await resolveTargetUserId(
              supabase,
              rule.target_actor,
              order,
            );
            if (!targetUserId) continue;

            const orderShort = order.order_number
              ? String(order.order_number)
              : order.id.slice(0, 8);

            const { data: queueId, error: enqErr } = await supabase.rpc(
              "fn_enqueue_from_rule",
              {
                _rule_id: rule.id,
                _entity_id: (a as any).id,
                _target_user_id: targetUserId,
                _vars: { order_short: orderShort, order_id: order.id },
                _reference_path: `/orders/${order.id}`,
              },
            );
            if (enqErr) {
              errors += 1;
            } else if (queueId) {
              enqueued += 1;
              detail[rule.key] = (detail[rule.key] || 0) + 1;
            }
          }
        }
      } catch (e) {
        errors += 1;
        console.error("[engine] rule error", rule.key, e);
      }
    }

    if (enqueued > 0) {
      try {
        await fetch(`${supabaseUrl}/functions/v1/process-notification-queue`, {
          method: "POST",
          headers: {
            Authorization: `Bearer ${serviceKey}`,
            "Content-Type": "application/json",
          },
          body: "{}",
        });
      } catch (e) {
        console.warn("[engine] could not trigger queue processor", e);
      }
    }

    await supabase.from("notification_engine_runs").insert({
      started_at: startedAt,
      finished_at: new Date().toISOString(),
      rules_evaluated: rulesEvaluated,
      entities_scanned: entitiesScanned,
      notifications_enqueued: enqueued,
      errors,
      details: detail,
      locked: false,
    });

    return new Response(
      JSON.stringify({
        success: true,
        rules_evaluated: rulesEvaluated,
        entities_scanned: entitiesScanned,
        notifications_enqueued: enqueued,
        errors,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (err) {
    console.error("[engine] fatal", err);
    return new Response(JSON.stringify({ error: String(err) }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } finally {
    // Release advisory lock (best-effort)
    try {
      await supabase.rpc("pg_advisory_unlock", { key: LOCK_KEY } as any);
    } catch { /* noop */ }
  }
});

async function resolveTargetUserId(
  supabase: ReturnType<typeof createClient>,
  actor: "buyer" | "seller" | "admin" | "rider",
  order: { buyer_id?: string; seller_id?: string },
): Promise<string | null> {
  if (actor === "buyer") return order.buyer_id || null;
  if (actor === "seller") {
    if (!order.seller_id) return null;
    const { data } = await supabase
      .from("seller_profiles")
      .select("user_id")
      .eq("id", order.seller_id)
      .maybeSingle();
    return (data as any)?.user_id || null;
  }
  return null;
}
