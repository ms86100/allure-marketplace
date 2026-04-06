
Root cause found: this is not one missing SQL query anymore. It is a split approval-flow + stale state problem.

1. Primary root cause: the real admin approval screen is using a different hook than the one previously patched
- `src/pages/AdminPage.tsx:120` renders `<SellerApplicationReview />`
- `src/components/admin/SellerApplicationReview.tsx:29-30` uses `useSellerApplicationReview()`
- `src/hooks/useSellerApplicationReview.ts:171-196` approves seller, role, products, licenses
- But this hook does not set `seller_profiles.is_available = true`
- Result: seller becomes `verification_status='approved'` but still “closed”, so marketplace discovery can still exclude them

2. Second root cause: society-admin approval path is also incomplete
- `src/pages/SocietyAdminPage.tsx:166` calls `sa.updateSellerStatus(...)`
- `src/hooks/useSocietyAdmin.ts:79-87` updates only `verification_status` and role
- It does not:
  - set `is_available = true`
  - approve pending/draft products
- Result: if approval happened from society admin, seller stays invisible and products never go live

3. Third root cause: seller UI visibility depends on auth state that may stay stale after approval
- `src/contexts/auth/AuthProvider.tsx:30-32`
  - `isSeller = roles.includes('seller') && approved sellerProfiles`
  - `hasSellerProfile = roles.includes('seller') && sellerProfiles.length > 0`
- `src/App.tsx:313-317` seller route is gated by `hasSellerProfile`
- `src/pages/ProfilePage.tsx:104,112,233` “My Store”/“Seller Dashboard”/hiding “Start Selling” all depend on `isSeller`
- `src/contexts/auth/useAuthState.ts:295-300` realtime refresh listens to `user_roles`, `security_staff`, `society_admins`, `builder_members` only
- It does not listen to `seller_profiles`
- Result: if `seller_profiles.verification_status` changes to approved but the role insert is duplicate/no-op or its realtime event is missed, the user remains in stale “pending/non-seller” UI and still sees “Start Selling”

4. Fourth root cause: marketplace visibility is cached too aggressively for approval events
- `src/hooks/queries/useMarketplaceSellers.ts` stale time: 10 min
- `src/hooks/queries/useMarketplaceProducts.ts` stale time: 10 min
- `src/contexts/auth/AuthProvider.tsx:84-105` prefetches marketplace sellers into cache
- No approval-specific invalidation/realtime refresh exists for marketplace discovery
- Result: even after DB state is correct, home page can remain stale for existing sessions

What I would implement
1. Unify seller approval into one shared helper used by:
- `useSellerApplicationReview`
- `useSocietyAdmin`
- optionally `useAdminData` for consistency
Shared approval behavior on approve:
- set `verification_status='approved'`
- set `rejection_note=null`
- set `is_available=true`
- ensure seller role exists
- approve eligible pending/draft products
- approve pending licenses when applicable

2. Fix seller auth/UI derivation
- change seller UI gating to derive from `sellerProfiles`, not only `user_roles`
- recommended:
  - `hasSellerProfile = sellerProfiles.length > 0`
  - `isSeller = sellerProfiles.some(s => s.verification_status === 'approved')`
- keep roles for true privileged features, but don’t let a missing/stale role block the seller from seeing their own dashboard

3. Add realtime refresh for seller profile state
- subscribe to `seller_profiles` changes for the current user in `useAuthState`
- refetch auth context when seller profile status / availability changes
- this makes the seller dashboard and Profile page update immediately after approval

4. Add marketplace cache invalidation/realtime refresh
- on relevant `seller_profiles` changes (`verification_status`, `is_available`)
- on relevant `products` changes (`approval_status`, `is_available`)
- invalidate/refetch marketplace queries so approved sellers/products appear without waiting for cache expiry

5. Keep the existing onboarding flow, but verify end-to-end
- seller submits → pending
- admin approves from Seller review
- society admin approves from Society admin
- seller session updates without manual reload
- Profile page shows seller entry points
- `/seller` route opens
- home marketplace shows seller/products when approval + availability are valid

Technical details
```text
Current broken paths
AdminPage -> SellerApplicationReview -> useSellerApplicationReview
SocietyAdminPage -> useSocietyAdmin
Profile / SellerRoute / menu visibility -> useAuth(AuthProvider derived flags)
Home visibility -> marketplace RPC data + 10m cache
```

Expected outcome after fix
- approved seller immediately sees seller dashboard entry points
- “Start Selling” disappears once seller is approved
- approved seller becomes discoverable as soon as approval completes
- products appear on home page without waiting for manual refresh or long cache expiry

Important note from the audit
- I compared the relevant approval/auth files with the referenced project
- the main issue is not a missing merge from that project
- the core problem is that there are multiple approval implementations, and the actual approval UIs are not consistently applying activation + sync logic
