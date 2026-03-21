

# Remaining Gaps to Fix

## Bug 1: Double "Cancelled by buyer:" Prefix (Critical — Visible in Production)

**Evidence from network logs:** The `rejection_reason` stored in DB is:
`"Cancelled by buyer: Cancelled by buyer: Taking too long to accept"`

**Root cause:** Two layers both prepend the same prefix:
- **Client** (`OrderCancellation.tsx` line 79): sends `_reason: "Cancelled by buyer: Taking too long to accept"`
- **DB function** (`buyer_cancel_order` RPC): concatenates `'Cancelled by buyer: ' || _clean_reason`

**Fix:** Remove the prefix from the client. The DB function already adds it, so the client should send just the raw reason (e.g., `"Taking too long to accept"`).

**File:** `src/components/order/OrderCancellation.tsx` — change line 79 from:
```
_reason: `Cancelled by buyer: ${finalReason}`,
```
to:
```
_reason: finalReason,
```

## Bug 2: UI Shows Raw Prefix in Cancellation Banner

**Current:** The cancellation banner on OrderDetailPage displays the full `rejection_reason` string like `"Cancelled by buyer: Changed my mind"` below a header that already says "Order Cancelled". This is redundant and exposes internal prefixes to users.

**Fix:** Strip the `"Cancelled by buyer: "` / `"Order automatically cancelled — "` prefixes before displaying, showing only the human-readable reason.

**File:** `src/pages/OrderDetailPage.tsx` — add a small helper to clean the displayed reason text, stripping known prefixes so the UI shows e.g. "Changed my mind" or "Seller did not respond in time" instead of the raw DB string.

## Summary

| # | Issue | Severity | File |
|---|-------|----------|------|
| 1 | Double "Cancelled by buyer:" prefix | Critical | `OrderCancellation.tsx` |
| 2 | Raw internal prefix shown to users | Minor/UX | `OrderDetailPage.tsx` |

Two small, surgical edits. No database migration needed.

