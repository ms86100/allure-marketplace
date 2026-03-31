
# Seller Bugs Round 4 (Operations & Data Gaps) — IMPLEMENTED

| # | Bug | Status |
|---|-----|--------|
| 1 | Submit All sends imageless products to review | ✅ Fixed — filters by `image_url`, shows skip count |
| 2 | `daily_order_limit` never enforced at checkout | ✅ Fixed — added to cart select + pre-checkout count query |
| 3 | Bulk upload allows empty category | ✅ Fixed — explicit empty-category check |
| 4 | Per-product Submit allows imageless product | ✅ Fixed — image guard before submit |
| 5 | Empty `operating_days` saves without blocking | ✅ Fixed — changed to `toast.error` + `return` |

# Seller Bugs Round 5 (Dashboard & Cart Parity) — IMPLEMENTED

| # | Bug | Status |
|---|-----|--------|
| 1 | `payment_pending` orders visible in seller dashboard | ✅ Fixed — `.neq('status', 'payment_pending')` added to infinite query |
| 2 | Cart retry query missing `daily_order_limit` | ✅ Fixed — retry select string now matches primary |

# Buyer Bugs Round 1 (RPC Integrity) — IMPLEMENTED

| # | Bug | Status |
|---|-----|--------|
| 1 | RPC cart clear fails for NULL `society_id` | ✅ Fixed — `IS NOT DISTINCT FROM` in DELETE |
| 2 | Server-side store check ignores `operating_days` | ✅ Fixed — CASE block with manual_override + day-aware overload, catches `closed_today` and `paused` |
