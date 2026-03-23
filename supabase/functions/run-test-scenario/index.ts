import { createClient } from "https://esm.sh/@supabase/supabase-js@2.93.3";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

// Test user credentials (must match seed-integration-test-users)
const TEST_ACTORS: Record<string, { email: string; password: string }> = {
  buyer: { email: "integration-buyer@test.sociva.com", password: "TestBuyer2026!" },
  seller: { email: "integration-seller@test.sociva.com", password: "TestSeller2026!" },
  admin: { email: "integration-admin@test.sociva.com", password: "TestAdmin2026!" },
  guard: { email: "integration-guard@test.sociva.com", password: "TestGuard2026!" },
};

interface TestStep {
  step_id: string;
  label: string;
  action: "insert" | "update" | "select" | "delete" | "rpc" | "assert";
  table?: string;
  actor: string;
  params?: Record<string, any>;
  expect?: {
    status?: "success" | "error";
    row_count?: number;
    field_checks?: Record<string, any>;
  };
  on_fail?: "abort" | "continue" | "skip_remaining";
  cleanup?: boolean;
}

interface StepResult {
  step_id: string;
  label: string;
  outcome: "passed" | "failed" | "skipped";
  duration_ms: number;
  error_message?: string;
  response_data?: any;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
  const adminClient = createClient(supabaseUrl, serviceKey);

  // Auth check — only admins
  const authHeader = req.headers.get("Authorization");
  if (authHeader?.startsWith("Bearer ")) {
    const userClient = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: { user }, error } = await userClient.auth.getUser();
    if (error || !user) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    // Check admin role
    const { data: roleData } = await adminClient
      .from("user_roles")
      .select("role")
      .eq("user_id", user.id)
      .eq("role", "admin")
      .maybeSingle();
    if (!roleData) {
      return new Response(JSON.stringify({ error: "Admin only" }), {
        status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
  }

  try {
    const { scenario_id } = await req.json();
    if (!scenario_id) {
      return new Response(JSON.stringify({ error: "scenario_id required" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Fetch scenario
    const { data: scenario, error: fetchErr } = await adminClient
      .from("test_scenarios")
      .select("*")
      .eq("id", scenario_id)
      .single();

    if (fetchErr || !scenario) {
      return new Response(JSON.stringify({ error: "Scenario not found" }), {
        status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const steps: TestStep[] = Array.isArray(scenario.steps) ? scenario.steps : [];
    const runId = crypto.randomUUID();
    const results: StepResult[] = [];
    const cleanupIds: { table: string; ids: string[] }[] = [];

    // Auth clients cache
    const actorClients: Record<string, any> = {};
    async function getActorClient(actor: string) {
      if (actorClients[actor]) return actorClients[actor];
      const creds = TEST_ACTORS[actor];
      if (!creds) throw new Error(`Unknown actor: ${actor}`);
      const client = createClient(supabaseUrl, anonKey, {
        auth: { autoRefreshToken: false, persistSession: false, detectSessionInUrl: false },
      });
      const { error } = await client.auth.signInWithPassword(creds);
      if (error) throw new Error(`Auth failed for ${actor}: ${error.message}`);
      actorClients[actor] = client;
      return client;
    }

    // Mark as running
    await adminClient
      .from("test_scenarios")
      .update({ last_result: "running", last_run_at: new Date().toISOString(), last_run_id: runId })
      .eq("id", scenario_id);

    let skipRemaining = false;

    for (const step of steps) {
      if (skipRemaining) {
        results.push({ step_id: step.step_id, label: step.label, outcome: "skipped", duration_ms: 0 });
        continue;
      }

      const start = performance.now();
      try {
        const client = await getActorClient(step.actor);
        let data: any = null;
        let error: any = null;

        switch (step.action) {
          case "select": {
            let q = client.from(step.table).select(step.params?.columns || "*");
            if (step.params?.filters) {
              for (const [col, val] of Object.entries(step.params.filters)) {
                q = q.eq(col, val);
              }
            }
            if (step.params?.limit) q = q.limit(step.params.limit);
            const res = await q;
            data = res.data; error = res.error;
            break;
          }
          case "insert": {
            const res = await client.from(step.table).insert(step.params?.row || step.params).select().single();
            data = res.data; error = res.error;
            if (data?.id && step.cleanup !== false) {
              const existing = cleanupIds.find(c => c.table === step.table);
              if (existing) existing.ids.push(data.id);
              else cleanupIds.push({ table: step.table!, ids: [data.id] });
            }
            break;
          }
          case "update": {
            let q = client.from(step.table).update(step.params?.set || {});
            if (step.params?.match) {
              for (const [col, val] of Object.entries(step.params.match)) {
                q = q.eq(col, val);
              }
            }
            const res = await q.select();
            data = res.data; error = res.error;
            break;
          }
          case "delete": {
            let q = client.from(step.table).delete();
            if (step.params?.match) {
              for (const [col, val] of Object.entries(step.params.match)) {
                q = q.eq(col, val);
              }
            }
            const res = await q.select();
            data = res.data; error = res.error;
            break;
          }
          case "rpc": {
            const res = await client.rpc(step.params?.function_name, step.params?.args || {});
            data = res.data; error = res.error;
            break;
          }
          case "assert": {
            // Assert uses previous step results
            const prevResult = results[results.length - 1];
            if (step.expect?.status === "error" && prevResult?.outcome === "failed") {
              data = { assertion: "expected_error_confirmed" };
            } else if (step.expect?.status === "success" && prevResult?.outcome === "passed") {
              data = { assertion: "expected_success_confirmed" };
            } else {
              error = { message: `Assertion failed: expected ${step.expect?.status}, got ${prevResult?.outcome}` };
            }
            break;
          }
        }

        // Validate expectations
        const expectStatus = step.expect?.status || "success";
        if (expectStatus === "success" && error) {
          throw new Error(error.message || JSON.stringify(error));
        }
        if (expectStatus === "error" && !error) {
          throw new Error("Expected error but operation succeeded");
        }
        if (step.expect?.row_count !== undefined && Array.isArray(data) && data.length !== step.expect.row_count) {
          throw new Error(`Expected ${step.expect.row_count} rows, got ${data.length}`);
        }
        if (step.expect?.field_checks && data) {
          const target = Array.isArray(data) ? data[0] : data;
          for (const [field, expected] of Object.entries(step.expect.field_checks)) {
            if (target?.[field] !== expected) {
              throw new Error(`Field ${field}: expected ${expected}, got ${target?.[field]}`);
            }
          }
        }

        results.push({
          step_id: step.step_id, label: step.label, outcome: "passed",
          duration_ms: Math.round(performance.now() - start),
          response_data: data,
        });
      } catch (err) {
        results.push({
          step_id: step.step_id, label: step.label, outcome: "failed",
          duration_ms: Math.round(performance.now() - start),
          error_message: err.message,
        });
        if (step.on_fail === "abort") break;
        if (step.on_fail === "skip_remaining") skipRemaining = true;
      }
    }

    // Cleanup test data (reverse order)
    for (const { table, ids } of cleanupIds.reverse()) {
      await adminClient.from(table).delete().in("id", ids);
    }

    // Save results to test_results
    const testResultRows = results.map(r => ({
      run_id: runId,
      module_name: scenario.module,
      test_name: `${scenario.name} > ${r.label}`,
      outcome: r.outcome,
      duration_ms: r.duration_ms,
      error_message: r.error_message || null,
      response_payload: r.response_data ? JSON.stringify(r.response_data).slice(0, 5000) : null,
      executed_at: new Date().toISOString(),
    }));

    if (testResultRows.length > 0) {
      await adminClient.from("test_results").insert(testResultRows);
    }

    // Update scenario with final result
    const allPassed = results.every(r => r.outcome === "passed");
    const hasFailed = results.some(r => r.outcome === "failed");
    const finalResult = hasFailed ? "failed" : allPassed ? "passed" : "partial";

    await adminClient
      .from("test_scenarios")
      .update({ last_result: finalResult, last_run_at: new Date().toISOString(), last_run_id: runId })
      .eq("id", scenario_id);

    return new Response(
      JSON.stringify({ run_id: runId, result: finalResult, steps: results }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (err) {
    console.error("Run error:", err);
    return new Response(
      JSON.stringify({ error: err.message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
