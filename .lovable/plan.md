

# Remaining Items from the 8-Feature Plan

## Status

| # | Feature | Status |
|---|---------|--------|
| 1 | Low Stock Alerts & Auto-Pause | ✅ Done — DB trigger + badge in SellerProductsPage |
| 2 | Store Share Card | ✅ Done — ShareMyStore component in QuickActions |
| 3 | Product Performance Ranking | ✅ Done — ProductPerformanceBadge in SellerProductsPage |
| 4 | **Settlement Ledger** | ❌ Not built |
| 5 | **Quick Reply Templates** | ❌ Not built |
| 6 | **Daily Sales Summary Push** | ❌ Not built |
| 7 | **Customer Directory** | ❌ Not built |
| 8 | **Order Auto-Accept** | ❌ Not built |

Sprint 1 (P0) is complete. All of Sprint 2 and Sprint 3 remain — 5 features total.

---

## Sprint 2 — Trust & Scale

### Feature 4: Settlement Ledger (Payout Transparency)

**DB:** The `seller_settlements` table already exists with columns for amount, status, seller_id, society_id, created_at, etc. No migration needed.

**Work:**
- New page `src/pages/SellerPayoutsPage.tsx` — queries `seller_settlements` filtered by current seller ID, displays a list with date, amount, status badge (pending/processing/settled), and running balance
- Add route `/seller/payouts` in `App.tsx`
- Add a "View Payouts" link from `SellerEarningsPage` and the payouts section in `SellerSettingsPage`

### Feature 5: Order Auto-Accept

**DB migration:**
- Add `auto_accept_enabled boolean DEFAULT false` to `seller_profiles`
- Create a trigger on `orders` INSERT that checks: seller has auto-accept ON, current time is within operating hours, stock is available, daily order count is under `daily_order_limit` — if all pass, update order status to `preparing`

**UI:**
- Add a toggle card in `SellerSettingsPage` with explanation of the rules (operating hours, stock check, daily limit)

### Feature 6: Daily Sales Summary Push

**Edge function:** `supabase/functions/daily-seller-summary/index.ts`
- Queries today's orders, revenue, and pending count per active seller
- Inserts a summary notification into `notification_queue` for each seller
- Returns count of notifications sent

**Cron:** Use `pg_cron` + `pg_net` to call the edge function daily at 9 PM IST (3:30 PM UTC) — `'30 15 * * *'`
- Cron job inserted via Supabase insert tool (not migration, since it contains project-specific URL/key)

---

## Sprint 3 — Retention & Engagement

### Feature 7: Customer Directory

**DB migration:**
- New RPC `get_seller_customer_directory(p_seller_id uuid)` that aggregates `orders` by `buyer_id`, joins `profiles` for name/avatar, returns: buyer_id, full_name, avatar_url, order_count, total_spent, last_order_date

**UI:**
- New component `src/components/seller/SellerCustomerDirectory.tsx` with tabs: All, Regulars (3+ orders), Recent (last 7 days), Lapsed (no order in 30+ days)
- Integrated into the Stats tab of `SellerDashboardPage`

### Feature 8: Quick Reply Templates

**DB migration:**
- New table `seller_quick_replies` (id uuid PK, seller_id uuid FK, label text, message_text text, sort_order int, created_at timestamptz)
- RLS: sellers can CRUD their own rows
- Trigger on `seller_profiles` insert to seed 5 default templates

**UI:**
- New component `src/components/seller/QuickReplyChips.tsx` — horizontal scrollable chip bar
- Integrate above the textarea in `SellerChatSheet.tsx` — tapping a chip fills the input with the template text
- Settings page: a "Quick Replies" section in seller settings to add/edit/delete templates

---

## Files Summary

| File | Change |
|------|--------|
| `src/pages/SellerPayoutsPage.tsx` | New — settlement ledger page |
| `src/App.tsx` | Add `/seller/payouts` route |
| `src/pages/SellerEarningsPage.tsx` | Add "View Payouts" link |
| `src/pages/SellerSettingsPage.tsx` | Add auto-accept toggle + quick replies section |
| `supabase/functions/daily-seller-summary/index.ts` | New — edge function for daily push |
| `src/components/seller/SellerCustomerDirectory.tsx` | New — customer directory component |
| `src/pages/SellerDashboardPage.tsx` | Integrate customer directory in Stats tab |
| `src/components/seller/QuickReplyChips.tsx` | New — quick reply chip bar |
| `src/components/product/SellerChatSheet.tsx` | Integrate quick reply chips |
| 3 migrations | auto_accept column+trigger, customer directory RPC, quick_replies table+seed trigger |
| 1 cron job (insert tool) | Schedule daily-seller-summary at 9 PM IST |

