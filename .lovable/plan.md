

## Implementation Plan: 3 Fixes (Slots in Onboarding, Past Time Filtering, Push Deep Links)

### Fix 1: Service Availability in Onboarding + Slot Enforcement

**1A — Add `ServiceAvailabilityManager` to Step 4**

In `BecomeSellerPage.tsx`, after the Store Images section (line ~400), add the `ServiceAvailabilityManager` component gated by `selectedGroupInfo?.layoutType === 'service'` and `draftSellerId` existence. Same pattern used in `SellerSettingsPage.tsx` line 313.

**1B — Slot validation gate in `handleProceedToProducts`**

In `useSellerApplication.ts` `handleProceedToProducts` (line 263), after `saveDraft()` succeeds and before `setStep(5)`, add a DB query for service sellers:

```sql
SELECT count(*) FROM service_slots 
WHERE seller_id = :draftSellerId 
  AND slot_date >= CURRENT_DATE 
  AND is_blocked = false
```

If the selected group's `layoutType === 'service'` and count is 0, show a toast "Please generate availability slots before continuing" and block step progression. This uses DB as source of truth and only counts active, future slots.

Requires passing `parentGroupInfos` or `selectedGroupInfo` into the validation check — already available in the hook's scope.

**Files:** `src/pages/BecomeSellerPage.tsx`, `src/hooks/useSellerApplication.ts`

---

### Fix 2: Past Time Slot Filtering in `TimeSlotPicker`

In `TimeSlotPicker.tsx` lines 50-58, the `availableSlots` branch marks all slots `available: true`. Fix by adding time filtering for today:

```typescript
if (daySlots) {
  const now = new Date();
  const isToday = isSameDay(selectedDate, today);
  return daySlots.slots.map((time) => {
    const [h, m] = time.split(':').map(Number);
    const slotDate = setMinutes(setHours(selectedDate, h), m);
    return {
      time,
      label: format(slotDate, 'h:mm a'),
      available: !isToday || isAfter(slotDate, now),
    };
  });
}
```

Backend already validates via `book_service_slot` function — no server changes needed.

**Files:** `src/components/booking/TimeSlotPicker.tsx`

---

### Fix 3: Push Notification Deep Links

**3A — Structured payloads in `admin-notifications.ts`**

Update `notifySellerStatusChange`:
- `approved` → `reference_path: '/seller'`, payload adds `action: 'STORE_APPROVED'`
- `rejected` → `reference_path: '/become-seller'`, payload adds `action: 'STORE_REJECTED'`
- `suspended` → `reference_path: '/seller'`, payload adds `action: 'STORE_SUSPENDED'`

Update other notification functions similarly with contextual paths.

**3B — New route resolver: `src/lib/notification-routes.ts`**

Maps notification `type` → route. Used as fallback when `reference_path` is missing:
- `seller_approved` → `/seller`
- `order_created`/`order_status` → `/orders/:orderId` (from payload)
- `product_approved`/`product_rejected` → `/seller/products`
- `license_*` → `/seller/licenses`
- `moderation` → `/admin`
- default → `/notifications`

**3C — Deferred navigation on push tap**

In `usePushNotifications.ts` line 394, update tap handler:
1. Resolve route via `data.route` or `resolveNotificationRoute(data.type, data)`
2. Call `setPendingDeepLink(route)` before `navigate(route)` — ensures retry after auth hydration if app is cold-starting
3. Import `setPendingDeepLink` from `useDeepLinks.ts`

**3D — Add `become-seller` to KNOWN_ROUTES**

In `useDeepLinks.ts` line 11, add `'become-seller'` to the `KNOWN_ROUTES` set.

**3E — Notification inbox fallback**

In `NotificationInboxPage.tsx` line 20, add fallback: if `n.reference_path` is missing, use `resolveNotificationRoute(n.type, n.payload)`.

**Files:** `src/lib/admin-notifications.ts`, `src/lib/notification-routes.ts` (new), `src/hooks/usePushNotifications.ts`, `src/hooks/useDeepLinks.ts`, `src/pages/NotificationInboxPage.tsx`

---

### Summary

| Fix | Files | DB Change |
|-----|-------|-----------|
| Slots in onboarding + enforcement | BecomeSellerPage, useSellerApplication | None |
| Past time filtering | TimeSlotPicker | None |
| Push deep links | admin-notifications, notification-routes (new), usePushNotifications, useDeepLinks, NotificationInboxPage | None |

