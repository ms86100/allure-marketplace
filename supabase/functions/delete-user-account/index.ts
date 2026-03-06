import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { checkRateLimit, rateLimitResponse } from "../_shared/rate-limiter.ts";
import { withAuth } from "../_shared/auth.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version',
};

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    // Phase 5: Centralized auth
    const authResult = await withAuth(req, corsHeaders);
    if (authResult instanceof Response) return authResult;
    const { userId } = authResult;

    // Phase 2: Rate limit — 3 per hour
    const { allowed } = await checkRateLimit(`delete-account:${userId}`, 3, 3600);
    if (!allowed) return rateLimitResponse(corsHeaders);

    // Use service role to delete the auth user
    const supabaseAdmin = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    );

    // Delete app data first
    const cleanupTables = [
      { table: 'cart_items', column: 'user_id' },
      { table: 'device_tokens', column: 'user_id' },
      { table: 'favorites', column: 'user_id' },
      { table: 'reviews', column: 'buyer_id' },
      { table: 'warnings', column: 'user_id' },
      { table: 'reports', column: 'reporter_id' },
      { table: 'bulletin_votes', column: 'user_id' },
      { table: 'bulletin_rsvps', column: 'user_id' },
      { table: 'bulletin_comments', column: 'author_id' },
      { table: 'bulletin_posts', column: 'author_id' },
      { table: 'help_responses', column: 'responder_id' },
      { table: 'help_requests', column: 'author_id' },
      { table: 'notification_queue', column: 'user_id' },
      { table: 'dispute_comments', column: 'author_id' },
      { table: 'expense_views', column: 'user_id' },
      { table: 'expense_flags', column: 'flagged_by' },
      { table: 'skill_endorsements', column: 'endorser_id' },
      { table: 'skill_listings', column: 'user_id' },
      { table: 'society_admins', column: 'user_id' },
      { table: 'security_staff', column: 'user_id' },
    ];

    for (const { table, column } of cleanupTables) {
      await supabaseAdmin.from(table).delete().eq(column, userId);
    }

    // Clean up seller data if exists
    const { data: sellerProfile } = await supabaseAdmin
      .from('seller_profiles')
      .select('id')
      .eq('user_id', userId)
      .maybeSingle();

    if (sellerProfile) {
      await supabaseAdmin.from('products').delete().eq('seller_id', sellerProfile.id);
      await supabaseAdmin.from('reviews').delete().eq('seller_id', sellerProfile.id);
      await supabaseAdmin.from('favorites').delete().eq('seller_id', sellerProfile.id);
      await supabaseAdmin.from('seller_profiles').delete().eq('id', sellerProfile.id);
    }

    await supabaseAdmin.from('user_roles').delete().eq('user_id', userId);
    await supabaseAdmin.from('profiles').delete().eq('id', userId);

    const { error: deleteError } = await supabaseAdmin.auth.admin.deleteUser(userId);
    if (deleteError) {
      console.error('Failed to delete auth user:', deleteError);
      return new Response(JSON.stringify({ error: 'Failed to delete account' }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    return new Response(JSON.stringify({ success: true }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (error) {
    console.error('Delete account error:', error);
    return new Response(JSON.stringify({ error: 'Internal server error' }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
