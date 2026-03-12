

# Audit: Auto-Persist Product Form Data

## 6. UX & Behavioral Gaps

### What feels incomplete
- **SellerProductsPage (post-approval) has ZERO auto-persist.** The fix only covers `DraftProductManager` (onboarding). When an approved seller opens the "Add Product" dialog, fills in details, closes the dialog (or navigates away), everything is lost. This is the more frequently used flow.
- **sessionStorage dies with the tab.** If a seller closes the browser tab and comes back later, their draft is gone. The user request says "comes back later" which implies cross-session persistence — `localStorage` would be more appropriate.

### What would confuse users
- Inconsistent behavior: onboarding auto-saves, but the post-approval product page does not.
- If a seller is editing an existing product (`editingIndex` restored), but the product list changed between sessions, the restored `editingIndex` could point to the wrong product or be out of bounds.

### Edge cases not handled
1. **Stale editingIndex**: restored `editingIndex` is `2` but products list now has only 2 items → index out of bounds, silent corruption
2. **Category mismatch**: seller's allowed categories change (admin removes a category) → restored form has an invalid category
3. **Image URL expiry**: persisted `image_url` is a signed URL that may expire (not an issue if using public bucket paths, but worth noting)
4. **Multiple tabs**: two tabs open same seller → both write to same sessionStorage key → race condition, last-write-wins

### What happens if user abandons mid-flow
- **Onboarding**: Draft persists in sessionStorage until tab closes or explicit cancel. Acceptable.
- **Post-approval**: All data lost immediately on dialog close. **Not acceptable.**

## 7. Remaining Implementation Checklist

### Critical (must fix before production)
- [ ] **Add auto-persist to `useSellerProducts` hook** — the post-approval "Add/Edit Product" dialog in `SellerProductsPage` has no draft persistence at all. This is the primary flow sellers use daily.

### High Priority
- [ ] **Switch from `sessionStorage` to `localStorage`** in `DraftProductManager` — user expects "comes back later" to work across sessions, not just within the same tab.
- [ ] **Guard restored `editingIndex`** — validate that the index is within bounds of the current products array; if not, reset to "new product" mode instead of editing a phantom index.

### Medium Priority
- [ ] **Validate restored category** — on restore, check that `newProduct.category` is still in the allowed `categories` list; if not, reset to `categories[0]`.
- [ ] **Add "Unsaved draft" indicator** — when a draft is restored, show a subtle banner: "You have an unsaved draft" with a "Discard" option so the user knows data was recovered.

### Nice to Have
- [ ] **Debounce persistence writes** — currently writes to storage on every keystroke via useEffect. A 500ms debounce would reduce writes.
- [ ] **Conflict detection for edit mode** — if restoring an edit draft, verify the product still exists in DB before allowing continued editing.

## 8. Regression Risk

| Risk | Assessment |
|---|---|
| Breaks existing functionality? | **No** — sessionStorage persistence is additive, read-only on mount |
| Requires migration for old data? | **No** — no DB changes |
| Requires cache invalidation? | **No** |
| Affects audit logging? | **No** |
| Affects governance health checks? | **No** |
| Side effects | If switching to localStorage, old sessionStorage drafts will be orphaned (harmless). Multiple seller profiles could accumulate stale drafts in localStorage — needs cleanup on successful save. |

## 9. Final Confidence Rating

| Dimension | Score | Reasoning |
|---|---|---|
| Architectural correctness | **5/10** | Only one of two product form flows has persistence. The more-used flow (SellerProductsPage) is completely unprotected. |
| Multi-tenant integrity | **8/10** | Draft key includes `sellerId`, so no cross-seller leakage. |
| Scalability readiness | **7/10** | sessionStorage/localStorage is client-only, no server load. But no debounce means excessive writes. |
| Security isolation | **9/10** | No sensitive data exposed. Form data in client storage is standard practice. |
| UX completeness | **4/10** | Core user request ("comes back later") partially met — only works in onboarding, only within same tab, no visual indicator of restored draft. |

## Implementation Truth Summary

The auto-persist feature is **partially implemented**. The `DraftProductManager` (onboarding flow) correctly saves and restores in-progress product form data to `sessionStorage`, including all fields, attribute blocks, and service configuration. However, the **primary daily-use flow** — the `SellerProductsPage` product dialog powered by `useSellerProducts` — has **zero persistence** and will lose all data on dialog close or navigation. Additionally, `sessionStorage` does not survive tab/browser closure, so the "comes back later" scenario from the user's request is **not fully addressed**. The restored `editingIndex` is not bounds-checked, creating a silent corruption risk. To be production-ready, the same persistence pattern must be applied to `useSellerProducts`, storage should move to `localStorage`, and a draft-recovery indicator should be added.

