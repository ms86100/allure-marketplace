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

    // Bug 2 fix: Expanded cleanup — delete personal data, anonymize financial records
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
      // Bug 2: Previously missing tables
      { table: 'chat_messages', column: 'sender_id' },
      // Note: receiver_id messages are NOT deleted — they belong to other users.
      // Sender info is anonymized by the profile deletion (cascade/nullify).
      { table: 'delivery_addresses', column: 'user_id' },
      { table: 'delivery_locations', column: 'partner_id' },
      { table: 'user_notifications', column: 'user_id' },
      { table: 'collective_buy_participants', column: 'user_id' },
      { table: 'authorized_persons', column: 'resident_id' },
      { table: 'call_feedback', column: 'buyer_id' },
      { table: 'seller_conversation_messages', column: 'sender_id' },
    ];

    // Continue-on-error: track failures but never abort — auth user MUST be deleted
    const failures: string[] = [];

    for (const { table, column } of cleanupTables) {
      const { error } = await supabaseAdmin.from(table).delete().eq(column, userId);
      if (error) {
        console.error(`[delete-account] Failed to clean ${table}.${column}:`, error.message);
        failures.push(`${table}.${column}`);
      }
    }

    // Anonymize orders (financial records must be retained) — nullify buyer personal data
    const { error: orderErr } = await supabaseAdmin.from('orders').update({ delivery_address: null, notes: null }).eq('buyer_id', userId);
    if (orderErr) { console.error('[delete-account] Failed to anonymize orders:', orderErr.message); failures.push('orders.anonymize'); }

    // Delete service bookings
    const { error: bookErr } = await supabaseAdmin.from('service_bookings').delete().eq('buyer_id', userId);
    if (bookErr) { console.error('[delete-account] Failed to delete service_bookings:', bookErr.message); failures.push('service_bookings'); }

    // Clean up seller data if exists
    const { data: sellerProfile } = await supabaseAdmin
      .from('seller_profiles')
      .select('id')
      .eq('user_id', userId)
      .maybeSingle();

    if (sellerProfile) {
      for (const t of ['products', 'reviews', 'favorites'] as const) {
        const col = t === 'products' ? 'seller_id' : t === 'reviews' ? 'seller_id' : 'seller_id';
        const { error } = await supabaseAdmin.from(t).delete().eq(col, sellerProfile.id);
        if (error) { console.error(`[delete-account] Failed to clean seller ${t}:`, error.message); failures.push(`seller.${t}`); }
      }
      const { error: spErr } = await supabaseAdmin.from('seller_profiles').delete().eq('id', sellerProfile.id);
      if (spErr) { console.error('[delete-account] Failed to delete seller_profiles:', spErr.message); failures.push('seller_profiles'); }
    }

    const { error: rolesErr } = await supabaseAdmin.from('user_roles').delete().eq('user_id', userId);
    if (rolesErr) { console.error('[delete-account] Failed to delete user_roles:', rolesErr.message); failures.push('user_roles'); }

    const { error: profErr } = await supabaseAdmin.from('profiles').delete().eq('id', userId);
    if (profErr) { console.error('[delete-account] Failed to delete profiles:', profErr.message); failures.push('profiles'); }

    if (failures.length > 0) {
      console.warn(`[delete-account] ${failures.length} cleanup failures for user ${userId}:`, failures.join(', '));
    }

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
