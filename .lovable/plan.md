

## Round 2 Audit — All 11 Issues: Implementation Evidence

Every item from the Round 2 plan is already live in the codebase. Here is file-level proof for each:

---

### Issue 1: SmartSuggestionBanner Store Availability Check — DONE
**File:** `src/components/home/SmartSuggestionBanner.tsx` L22-38
**Evidence:** `handleReorder` fetches seller availability fields (`availability_start`, `availability_end`, `operating_days`, `is_available`) and calls `computeStoreStatus`. If store is not open, shows `toast.error` and returns early before invoking `quick-reorder`.

### Issue 2: Toast System Migrated to Sonner — DONE
**File:** `src/components/home/SmartSuggestionBanner.tsx` L7
**Evidence:** `import { toast } from 'sonner';` — no `useToast` import exists. All toast calls use `toast.error(...)` and `toast.success(...)`.

### Issue 3: N+1 Query Batched — DONE
**File:** `src/hooks/useOrderSuggestions.ts` L46-65
**Evidence:** Collects all `productIds` and `sellerIds` into Sets, then uses `Promise.all` with `.in('id', productIds)` and `.in('id', sellerIds)` batch queries. Maps results into suggestion objects.

### Issue 4: updateOrderStatus Checks Affected Rows — DONE
**File:** `src/hooks/useOrderDetail.ts` L146-156
**Evidence:** Query uses `.select()` after `.update()`. L151-155 checks `if (!updatedRows || updatedRows.length === 0)` — if no rows affected, calls `fetchOrder()` to refetch real state and shows `toast.error('Order status has changed. Refreshing...')`.

### Issue 5: COD Duplicate Guard Removed — DONE
**File:** `src/hooks/useCartPage.ts` L294-306
**Evidence:** The COD flow at L294-306 goes directly to `createOrdersForAllSellers('pending')` without any duplicate-order pre-check query. The overly broad guard has been removed.

### Issue 6: Time Comparison Uses Numeric Minutes — DONE
**File:** `src/components/home/UpcomingAppointmentBanner.tsx` L59-63
**Evidence:** Uses `timeToMinutes(b.start_time || '00:00') < nowMinutes` where `nowMinutes = now.getHours() * 60 + now.getMinutes()`. No string comparison. Handles non-zero-padded DB values correctly.

### Issue 7: Notification Dismiss Persisted — DONE
**File:** `src/components/notifications/HomeNotificationBanner.tsx` L22-25
**Evidence:** `handleDismiss` calls both `setDismissed(notification.id)` for immediate UI and `markRead.mutate(notification.id)` to persist via the `useMarkNotificationRead` hook. Banner won't reappear after navigation.

### Issue 8: Geolocation Permission Check — DONE
**File:** `src/hooks/useArrivalDetection.ts` L74-86
**Evidence:** On web, calls `navigator.permissions.query({ name: 'geolocation' })` first. Only starts `watchPosition` if `result.state === 'granted'`. Comment on L84: "If 'prompt' or 'denied', don't trigger the popup".

### Issue 9: Admin Product Approval Scoped by created_at — DONE
**File:** `src/hooks/useSellerApplicationReview.ts` L186-191
**Evidence:** `approvalCutoff = new Date().toISOString()`. Query uses `.lte('created_at', approvalCutoff)` to only approve products that existed before the approval moment. Logs count: `Auto-approved ${productCount} products`.

### Issue 10: togglePauseShop Mutex — DONE
**File:** `src/hooks/useSellerSettings.ts` L104-117
**Evidence:** `togglePauseRef = useRef(false)`. L106: `if (togglePauseRef.current) return;` blocks concurrent calls. Set to `true` on entry, reset to `false` in `finally` block.

### Issue 11: Cart Delete After Item Confirmation — DONE
**File:** `src/components/home/ReorderLastOrder.tsx` L127-148
**Evidence:** L127-131 checks `if (!available?.length)` and returns early with toast. L136-143 builds `inserts` array and checks `if (inserts.length === 0)` before any deletion. L147: cart delete only runs after confirming insertable items exist. Comment on L146: "Only delete cart AFTER confirming we have items to insert".

---

**Conclusion:** All 11 Round 2 audit items are fully implemented. No outstanding gaps remain.

