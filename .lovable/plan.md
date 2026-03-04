

## Fix: Replace Dynamic Imports with Static Imports in Gesture Handlers

The QA reviewer correctly identified that `await import('@capacitor/push-notifications')` inside click handlers adds an async frame that can break iOS user-gesture context. The project's architectural standard of dynamic imports is appropriate for lifecycle hooks (useEffect, etc.) but counterproductive inside tap handlers where gesture-chain preservation is critical.

The `@capacitor/push-notifications` package is safe to import statically — Capacitor plugins are designed to be importable on all platforms (they no-op on web). Both components already guard against web execution early (`if (!Capacitor.isNativePlatform()) return null` / platform checks).

### Changes

**1. `EnableNotificationsBanner.tsx`** — Add static import, remove dynamic import from `handleTurnOn`:
```typescript
import { PushNotifications } from '@capacitor/push-notifications';
```
Remove `const { PushNotifications } = await import(...)` from line 70.

**2. `NotificationsPage.tsx`** — Add static import, remove dynamic import from the click handler (line 191). Keep dynamic imports in `useEffect` (non-gesture context — those are fine).

**3. Verify `usePushNotifications.ts`** — Confirm `apnsTokenRef.current = rawToken` is present in the main listener (line 650-651). Already confirmed from the file read — this fix is in place.

No other changes needed. The `claim_device_token` RPC and all backend logic remain correct.

