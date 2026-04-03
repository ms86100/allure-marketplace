

# Push Notification Sound & Icon — Production-Hardened Plan

## Current State (from code audit)

- **Both `sendApnsDirect` and `sendFcmDirect`** hardcode `gate_bell.mp3` / `gate_bell` sound and `orders_alert` channel for ALL notifications (lines 66, 131, 136)
- **Only one Android channel** exists: `orders_alert` (line 262)
- **Foreground handler** plays the same Web Audio beep for every notification regardless of priority (line 419-440)
- **No priority detection** anywhere in the pipeline
- **`item.payload`** already contains `target_role` and `status` — no schema change needed

## Changes

### 1. Edge Function: `process-notification-queue/index.ts`

**Add priority detection** before calling `deliverPushToUser` (~line 477):

```
HIGH_PRIORITY if:
  target_role === 'seller' AND status IN ['placed','enquired','requested','quoted']
  OR target_role === 'buyer' AND status IN ['payment_failed','refund_failed','otp']
DEFAULT: everything else
```

**Fail-safe**: if `payload` is null/undefined or `target_role` missing → default to STANDARD.

**Pass `isHighPriority` boolean** to `deliverPushToUser`.

**Update `deliverPushToUser` signature** to accept `isHighPriority: boolean` (default `false`).

**Update `sendApnsDirect`**: Accept `highPriority` param. Set `aps.sound = highPriority ? "gate_bell.mp3" : "default"`.

**Update `sendFcmDirect`**: Accept `highPriority` param. Set `notification.sound = highPriority ? "gate_bell" : "default"` and `channel_id = highPriority ? "orders_alert" : "general"`.

**Add decision logging** in `deliverPushToUser`:
```
console.log(JSON.stringify({ event: "push_priority", notification_id, user_id, target_role, status, isHighPriority, sound }));
```

### 2. Edge Function: `send-push-notification/index.ts`

Same priority logic. Accept optional `isHighPriority` in the request payload. Apply same conditional sound/channel to both APNs and FCM delivery functions.

### 3. Client: `src/hooks/usePushNotifications.ts`

**Add `general` Android channel** (after `orders_alert` creation, ~line 276):
```
Channel: id='general', name='General', importance=3, sound='default', vibration=true
```

**Note on channel immutability**: Since `orders_alert` already exists with `gate_bell` sound, it will persist correctly. The new `general` channel is additive — no conflict.

**Update foreground handler** (~line 350): Read `notification.data.target_role` and `notification.data.status`. Apply same priority logic client-side. For high-priority: play the existing Web Audio beep. For standard: skip sound entirely (OS already played `default` sound via the push payload).

### 4. iOS Icon — Build Pipeline Assets

Create `ios-config/AppIcon.appiconset/Contents.json` with the full iOS icon manifest referencing all required sizes. This is a **build pipeline concern** — the assets must be copied into the Xcode target's asset catalog during the Codemagic build.

**`gate_bell.mp3` bundling note**: This file must exist in `ios/App/App/` AND be added to "Copy Bundle Resources" in Xcode. If missing, iOS silently uses default sound. This is a build configuration step, not a code change.

### Files Modified

| File | Change |
|---|---|
| `supabase/functions/process-notification-queue/index.ts` | Priority detection, conditional sound/channel in both delivery functions, decision logging |
| `supabase/functions/send-push-notification/index.ts` | Same priority logic + conditional sound/channel |
| `src/hooks/usePushNotifications.ts` | Add `general` Android channel, priority-aware foreground sound |
| `ios-config/AppIcon.appiconset/Contents.json` | Create iOS icon manifest (build pipeline reference) |

### No database changes needed.

