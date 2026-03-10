

## Fix: Update seller_profiles RLS to support cross-society visibility

### Root Cause
The `seller_profiles` SELECT RLS policy restricts visibility to sellers in the **same society** as the current user. With coordinate-based discovery, users can now discover sellers from any society, but direct table reads (cart availability checks, product detail pages) are blocked by this policy.

### Change

**Update the RLS SELECT policy** on `seller_profiles` to allow any authenticated user to view approved sellers, regardless of society membership. The `sell_beyond_community` flag and radius filtering are already handled by the discovery RPC — RLS should not double-gate on society matching.

**New policy:**
```sql
DROP POLICY "Anyone can view approved sellers" ON seller_profiles;
CREATE POLICY "Anyone can view approved sellers" ON seller_profiles
  FOR SELECT USING (
    verification_status = 'approved'
    OR user_id = auth.uid()
    OR is_admin(auth.uid())
  );
```

This removes the `society_id = get_user_society_id(auth.uid())` constraint while keeping the requirement that sellers must be approved (or you're viewing your own profile, or you're an admin).

### Files affected
- **Database migration only** — no code changes needed. The `useCart` hook's availability fetch will start returning data correctly once the policy is updated.

### Risk Assessment
- **Low risk**: Discovery already shows these sellers via the SECURITY DEFINER RPC. The only change is that direct reads (cart, product detail) can also see them.
- **No PII exposure**: `seller_profiles` contains business information (business name, categories, availability hours), not personal data.
- INSERT/UPDATE policies remain unchanged — sellers can only modify their own profiles.

