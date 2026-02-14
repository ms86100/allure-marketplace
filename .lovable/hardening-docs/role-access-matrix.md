# Role Access Matrix — All Critical Tables

> Verified against live pg_policy queries on 2026-02-14.

## Legend
- ✅ = Allowed
- ❌ = Denied by RLS
- 🔒 = Denied (no policy exists for this operation)
- 📍 = Scoped to own society only

---

## products

| Operation | Buyer (same society) | Buyer (other society) | Seller (owner) | Society Admin | Platform Admin |
|---|---|---|---|---|---|
| SELECT | ✅📍 | ❌ | ✅ (own) | ✅📍 | ✅ (all) |
| INSERT | ❌ | ❌ | ✅ | ❌ | ✅ |
| UPDATE | ❌ | ❌ | ✅ (own) | ❌ | ✅ |
| DELETE | ❌ | ❌ | ✅ (own) | ❌ | ✅ |

## orders

| Operation | Buyer (own) | Buyer (other) | Seller (on order) | Society Admin | Platform Admin |
|---|---|---|---|---|---|
| SELECT | ✅ | ❌ | ✅ | ❌ | ✅ |
| INSERT | ✅ | ❌ | ❌ | ❌ | ❌ |
| UPDATE | ✅ | ❌ | ✅ | ❌ | ✅ |
| DELETE | 🔒 | 🔒 | 🔒 | 🔒 | 🔒 |

## seller_profiles

| Operation | Buyer | Seller (own) | Society Admin (same) | Society Admin (other) | Platform Admin |
|---|---|---|---|---|---|
| SELECT | ✅ (approved only) | ✅ | ✅ | ✅ (approved only) | ✅ |
| INSERT | ✅ (apply) | — | — | — | — |
| UPDATE | ❌ | ✅ | ✅📍 | ❌ | ✅ |
| DELETE | 🔒 | 🔒 | 🔒 | 🔒 | 🔒 |

## society_expenses

| Operation | Buyer (same society) | Buyer (other society) | Society Admin (same) | Society Admin (other) | Platform Admin |
|---|---|---|---|---|---|
| SELECT | ✅📍 | ❌ | ✅📍 | ❌ | ✅ |
| INSERT | ❌ | ❌ | ✅📍 | ❌ | ✅ |
| UPDATE | ❌ | ❌ | ✅📍 | ❌ | ✅ |
| DELETE | ❌ | ❌ | ✅📍 | ❌ | ✅ |

## society_income

| Operation | Buyer (same society) | Buyer (other society) | Society Admin (same) | Society Admin (other) | Platform Admin |
|---|---|---|---|---|---|
| SELECT | ✅📍 | ❌ | ✅📍 | ❌ | ✅ |
| INSERT | ❌ | ❌ | ✅📍 | ❌ | ✅ |
| UPDATE | ❌ | ❌ | ✅📍 | ❌ | ✅ |
| DELETE | ❌ | ❌ | ✅📍 | ❌ | ✅ |

## snag_tickets

| Operation | Reporter | Buyer (other) | Society Admin (same) | Society Admin (other) | Platform Admin |
|---|---|---|---|---|---|
| SELECT | ✅ (own) | ❌ | ✅📍 | ❌ | ✅ |
| INSERT | ✅📍 | ✅📍 | ✅📍 | ❌ | ✅ |
| UPDATE | ✅ (own) | ❌ | ✅📍 | ❌ | ✅ |
| DELETE | 🔒 | 🔒 | 🔒 | 🔒 | 🔒 |

## reviews

| Operation | Buyer (own review) | Buyer (same society) | Buyer (other society) | Platform Admin |
|---|---|---|---|---|
| SELECT | ✅ | ✅ (unhidden, same society sellers) | ❌ | ✅ |
| INSERT | ✅ (completed orders only) | — | — | — |
| UPDATE | 🔒 | 🔒 | 🔒 | 🔒 |
| DELETE | 🔒 | 🔒 | 🔒 | 🔒 |

## society_admins

| Operation | Buyer | Society Admin (same) | Deactivated Admin | Platform Admin |
|---|---|---|---|---|
| SELECT | ❌ | ✅📍 | ❌ (deactivated_at check) | ✅ |
| INSERT | ❌ | ✅📍 (within limit) | ❌ | ✅ |
| UPDATE | ❌ | ✅📍 (last admin protected) | ❌ | ✅ (can override) |
| DELETE | 🔒 | 🔒 | 🔒 | 🔒 |

## warnings

| Operation | User (target) | Society Admin | Platform Admin |
|---|---|---|---|
| SELECT | ✅ (own) | ✅ (via admin) | ✅ |
| INSERT | ❌ | ✅ (same society users) | ✅ |
| UPDATE | ✅ (acknowledge) | ✅ | ✅ |
| DELETE | 🔒 | 🔒 | 🔒 |

## audit_log

| Operation | Buyer | Society Admin | Platform Admin |
|---|---|---|---|
| SELECT | ❌ | ✅📍 | ✅ |
| INSERT | ✅ (actor_id = self) | ✅ | ✅ |
| UPDATE | 🔒 | 🔒 | 🔒 |
| DELETE | 🔒 | 🔒 | 🔒 |
