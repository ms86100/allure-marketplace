

## Notification Health Check — User-Friendly UI

### What We'll Build

A simple "Check Notifications" button accessible from the **Profile page** (replacing the current "Push Debug" developer link) and from the **Notifications page**. When tapped, it runs the existing diagnostic engine in the background and presents results as plain, friendly status messages — no technical jargon.

### UI Design

**Trigger:** A card/button labeled "Check Notifications" with a bell icon, placed in Profile menu items (replacing "Push Debug" for non-admin users; admins keep the debug link).

**Result view:** A bottom sheet (using `vaul` Drawer) with 4 user-facing status rows:

| Internal Check | User Sees (if OK) | User Sees (if NOT OK) |
|---|---|---|
| Permission check | "Notification permission is enabled" | "Notifications are turned off" + "Open Settings" button |
| Plugin + registration | "Your device is set up for notifications" | "Setup incomplete — tap to retry" + retry button |
| Token in DB | "Your device is registered" | "Registration pending — tap to retry" |
| Test notification queue | "Everything is working correctly" | "Could not send test — please try again later" |

Each row shows a green checkmark or red X icon with the message. No step numbers, no token strings, no technical terms.

**Loading state:** A simple spinner with "Checking..." while the diagnostic runs (typically 2-3 seconds).

**All-pass state:** A green banner at the top: "Notifications are working correctly" with a checkmark.

### Implementation

**1. New component: `src/components/notifications/NotificationHealthCheck.tsx`**
- Renders the trigger button and the bottom sheet
- Calls `runPushDiagnostics(userId)` from `src/lib/pushDiagnostics.ts` (reuses existing engine)
- Maps technical `DiagnosticResult[]` into 4 user-friendly status items
- Provides actionable buttons for failures (Open Settings, Retry Registration)

**2. New helper: `src/lib/pushDiagnosticsSummary.ts`**
- Pure function: takes `DiagnosticResult[]` → returns `UserFriendlyStatus[]`
- Consolidates the 7+ technical steps into 4 simple categories
- Each category has: `label`, `ok`, `actionType` (none | openSettings | retry)

**3. Update `src/pages/ProfilePage.tsx`**
- Replace `{ icon: Bug, label: 'Push Debug', to: '/push-debug' }` with an inline button that opens the health check sheet (for all users)
- Keep Push Debug link visible only for admins

**4. Optionally add to `src/pages/NotificationsPage.tsx`**
- Add a small "Check notification status" link at the top

### No backend changes needed
The existing `runPushDiagnostics` function and `device_tokens` table are sufficient. No new tables, migrations, or edge functions required.

