

## System Stabilization Plan

### Problem Summary
The database is overloaded (544 connection timeouts). This causes **every** auth method to fail — OTP verify can't mint tokens, Google sign-in can't check consent, and the `handle_new_user` trigger blocks account creation. Meanwhile, polling loops and retry logic keep hammering the DB, preventing recovery.

### Phase 1: Stop the bleeding — reduce DB load

**File: `src/contexts/auth/useAuthState.ts`**
- Change session health check interval from 5 minutes to 15 minutes
- Add early return if user is on `/auth` route (no session to check)
- Disable background profile retry when circuit breaker is open

**File: `src/hooks/useUnreadNotificationCount.ts`**
- Increase refetchInterval from 30s to 60s

**File: `src/components/home/ActiveOrderStrip.tsx`**  
- Increase refetchInterval from 30s to 60s

**File: `src/hooks/queries/useNotifications.ts`**
- Increase both refetchIntervals from 30s to 60s

**File: `src/components/admin/AdminAIReviewLog.tsx`**
- Increase refetchInterval from 30s to 60s

### Phase 2: Harden the `handle_new_user` trigger

**Database migration** (apply when DB recovers):
```sql
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE _meta jsonb; _society_id uuid; _raw_society text;
BEGIN
  PERFORM set_config('lock_timeout', '500ms', true);
  PERFORM set_config('statement_timeout', '2000ms', true);
  _meta := COALESCE(NEW.raw_user_meta_data, '{}'::jsonb);
  _raw_society := _meta->>'society_id';
  IF _raw_society IS NOT NULL AND _raw_society != 'pending'
     AND _raw_society ~ '^[0-9a-f]{8}-...$' THEN
    _society_id := _raw_society::uuid;
  END IF;
  BEGIN
    INSERT INTO public.profiles (...) VALUES (...);
  EXCEPTION WHEN OTHERS THEN
    RAISE LOG 'profile sync failed for %: %', NEW.id, SQLERRM;
  END;
  BEGIN
    INSERT INTO public.user_roles (user_id, role) VALUES (NEW.id, 'buyer');
  EXCEPTION WHEN OTHERS THEN
    RAISE LOG 'role sync failed for %: %', NEW.id, SQLERRM;
  END;
  RETURN NEW;
END;
$$;
```
This ensures auth never blocks on slow profile/role writes.

### Phase 3: Fix Google Sign-In

The error `"failed to check consent required"` originates inside `@lovable.dev/cloud-auth-js` which internally calls the backend. When the DB is down, this call fails.

**Action**: Google sign-in will work once DB load drops (Phase 1). No code change needed — the `lovable/index.ts` file is auto-generated and must not be edited.

**File: `src/pages/AuthPage.tsx`**
- Add a retry with 2s delay on Google sign-in failure (the consent check is idempotent)
- Show "Server is busy, please try again in a moment" instead of raw error

### Phase 4: Add global "backend down" guard

**File: `src/lib/circuitBreaker.ts`**
- Add a `isBackendDown()` helper that returns true if 2+ domains have open circuits
- Export for use in UI components

**File: `src/components/ui/BackendDownBanner.tsx`** (new)
- A thin banner: "Our servers are experiencing high load. Some features may be slow."
- Shown when `isBackendDown()` returns true
- Auto-dismisses when circuits close

### Execution Order
1. Phase 1 first (immediate load reduction)
2. Phase 4 (user-facing status)  
3. Phase 3 (Google retry UX)
4. Phase 2 (trigger migration — retry until DB accepts it)

