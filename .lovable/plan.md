
# Seller CRUD Data Integrity Bugs — IMPLEMENTED

All 4 confirmed bugs have been fixed in `DraftProductManager.tsx`:

| # | Bug | Status |
|---|-----|--------|
| 1 | Payload missing `subcategory_id`, `lead_time_hours`, `accepts_preorders` | ✅ Fixed |
| 2 | `approval_status` unconditionally reset to `draft` on edit | ✅ Fixed — conditional logic matches SellerProductsPage |
| 3 | `rejection_note` not cleared on edit | ✅ Fixed — cleared when `isEditing` |
| 4 | Missing stock/lead_time/preorder UI in onboarding form | ✅ Fixed — added stock toggle, lead time, preorder checkbox |

`DraftProduct` interface extended with `subcategory_id`, `lead_time_hours`, `accepts_preorders`, `approval_status`.
