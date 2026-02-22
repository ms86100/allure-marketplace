

## Fix: Empty Builder Dropdown in "Assign Package to Builder"

### Root Cause

The `FeatureManagement` component calls `fetchAll()` once on mount via `useEffect(() => { fetchAll(); }, [])`. If the authentication session hasn't fully initialized yet when this runs, the database query executes as an anonymous user. Since RLS requires admin role or builder membership, the query returns zero rows -- and never retries.

This is the same class of bug as the search toggle issue: component initializes before auth is ready.

### Fix

Add the `user` from `useAuth()` as a dependency to the `useEffect`, so `fetchAll()` re-runs once the user session is available.

### Changes

**File: `src/components/admin/FeatureManagement.tsx`**

1. Import `useAuth` from the auth context
2. Get `user` from `useAuth()`
3. Change the useEffect dependency from `[]` to `[user?.id]` so it re-fetches when the user session loads

```typescript
// Add import
import { useAuth } from '@/contexts/AuthContext';

// Inside the component, add:
const { user } = useAuth();

// Change:
useEffect(() => { fetchAll(); }, []);
// To:
useEffect(() => { fetchAll(); }, [user?.id]);
```

This ensures the data is fetched (or re-fetched) once the user is authenticated, so RLS returns the correct results.

