

# Design Thinking Integrity Audit -- Round 3 Gap Analysis

## Design Thinking Maturity Assessment

| Phase | Rating | Justification |
|-------|--------|---------------|
| Empathize | Medium-High | Previous rounds added verification reassurance, order status messages, signup field context, and search recovery. However, 85+ raw `error.message` toast calls remain across 14 files (worker, progress, admin, snags, image upload, drafts, bulk upload, seller onboarding). The friendlyError utility exists but was only adopted in 8 files. |
| Define | High | Empty states now have actionable guidance. Seller onboarding has step-by-step helper text. Dispute empty states explain purpose. Minor gap: seller dashboard "orders" empty state still lacks context when filtered (e.g., "No preparing orders" gives no guidance). |
| Ideate | Medium-High | Order cancellation now has undo. Cart is DB-backed. Seller drafts exist. Remaining gap: bulletin post deletion has no undo, and product deletion by sellers is immediate with no recovery. |
| Prototype | High | Order confirmation dialog, bulletin preview, seller draft flow all exist. Minor gap: product edit/delete in SellerProductsPage has no confirmation before destructive delete. |
| Test | Medium | Feedback sheet exists on Profile and contextually on OrderDetailPage. But feedback is never prompted after seller onboarding completion or after first bulletin post -- two high-emotion moments. |

---

## Key Gaps

### Gap 1 -- friendlyError Still Not Adopted in 14 Files (Empathize)

**Description:** 85+ instances of `toast.error(error.message)` or `toast.error(error.message || '...')` remain in 14 files. These files were not addressed in previous rounds because they were considered lower-traffic, but they still expose technical jargon to users.

**Files affected:**
- `src/pages/CreateJobRequestPage.tsx`
- `src/pages/WorkerJobsPage.tsx`
- `src/pages/WorkerMyJobsPage.tsx`
- `src/pages/BecomeSellerPage.tsx` (line 444 -- missed in previous round)
- `src/components/seller/DraftProductManager.tsx`
- `src/components/seller/BulkProductUpload.tsx`
- `src/components/worker/ResidentJobsList.tsx`
- `src/components/progress/AddMilestoneSheet.tsx`
- `src/components/progress/AddDocumentSheet.tsx`
- `src/components/progress/AskQuestionSheet.tsx`
- `src/components/snags/CreateSnagSheet.tsx`
- `src/components/ui/image-upload.tsx`
- `src/components/admin/CategoryManager.tsx`
- `src/components/admin/FeatureManagement.tsx`

**User impact:** Users in worker, progress, snag, and admin flows still see raw database errors.
**Violation:** System-centric error handling instead of human-centered communication.

**Guidance:** Import `friendlyError` from `@/lib/utils` and replace `toast.error(error.message || '...')` with `toast.error(friendlyError(error))` in all 14 files.
**Risk:** Low -- purely string mapping.
**Measure:** Zero raw technical strings in any user-facing toast.

---

### Gap 2 -- Product Deletion Has No Confirmation (Prototype)

**Description:** In `SellerProductsPage.tsx`, deleting a product is immediate with no confirmation dialog. A single tap on the delete icon permanently removes the product and its data. There is no undo.

**User impact:** Accidental deletion of products, loss of reviews and order history references, anxiety and regret.
**Violation:** Users are locked into an irreversible action without preview or confirmation.

**Guidance:** Add an `AlertDialog` confirmation before product deletion, showing the product name and a warning that this cannot be undone. Two buttons: "Keep Product" and "Delete".
**Files:** `src/pages/SellerProductsPage.tsx`
**Risk:** Low.
**Measure:** Reduction in re-created products (same seller, same name within 24 hours).

---

### Gap 3 -- Seller Dashboard Filtered Orders Empty State Lacks Context (Define)

**Description:** When a seller filters orders (e.g., "Preparing", "Ready") and no orders match, the empty state shows "No preparing orders" with no guidance. Sellers don't know if this is expected behavior or a problem.

**User impact:** Confusion about whether the filter is working or whether something is wrong.
**Violation:** Empty state exists for system reasons (filter result) without user-centered explanation.

**Guidance:** Add a brief contextual line below the empty state: "Orders in this status will appear here as buyers place them" or similar, depending on the filter.
**Files:** `src/pages/SellerDashboardPage.tsx` (lines 266-272)
**Risk:** Low -- copy-only change.
**Measure:** N/A (clarity improvement).

---

### Gap 4 -- No Feedback Prompt After Seller Onboarding Submission (Test)

**Description:** After a seller completes the 6-step onboarding and submits their application on `BecomeSellerPage`, there is no feedback prompt. This is a high-emotion moment (excitement, anxiety about approval) where a feedback signal would be valuable.

**User impact:** Product team misses a critical signal about the seller onboarding experience.
**Violation:** Missed opportunity to learn from users at a moment of high engagement.

**Guidance:** After successful submission (the "Application submitted!" toast), set a localStorage flag. On the next visit to ProfilePage or SellerDashboardPage, if the flag is set and no feedback has been given, show the existing `FeedbackSheet` contextually.
**Files:** `src/pages/BecomeSellerPage.tsx`, `src/pages/ProfilePage.tsx`
**Risk:** Low.
**Measure:** Feedback submission rate from new sellers.

---

### Gap 5 -- Waiting States in Worker and Progress Flows Lack Reassurance (Empathize)

**Description:** Several flows have waiting/processing states with no reassurance:
- `WorkerJobsPage`: After accepting a job, no message about what happens next (does the resident confirm? When does work start?)
- `AddMilestoneSheet` / `AddDocumentSheet`: After submission, only a generic success toast -- no guidance on who reviews or when it appears

**User impact:** Uncertainty about next steps after taking action.
**Violation:** System provides no visibility into what happens after the user's action.

**Guidance:**
- Worker job acceptance: Change success toast to include next step: "Job accepted! The resident will be notified."
- Milestone/document submission: Change toast to "Added! Your entry will appear in the timeline."
**Files:** `src/pages/WorkerJobsPage.tsx`, `src/components/progress/AddMilestoneSheet.tsx`, `src/components/progress/AddDocumentSheet.tsx`
**Risk:** Low -- copy-only.
**Measure:** N/A (reassurance improvement).

---

### Gap 6 -- Image Upload Failure Gives No Recovery Guidance (Empathize)

**Description:** When image upload fails in `image-upload.tsx`, the toast says "Failed to upload image" with no guidance. Users don't know if the file was too large, the format was wrong, or if it was a network issue.

**User impact:** Repeated failed attempts, frustration, abandonment of the flow.
**Violation:** Error handling is generic and system-centric.

**Guidance:** Use `friendlyError(error)` for the toast, and add a brief helper below the upload area: "Supported: JPG, PNG, WebP. Max 5 MB."
**Files:** `src/components/ui/image-upload.tsx`
**Risk:** Low.
**Measure:** Reduction in repeated upload attempts.

---

## Design Thinking KPIs

| Phase | Currently Measured | Should Measure | Missing Signal |
|-------|-------------------|----------------|----------------|
| Empathize | friendlyError in 8 files | friendlyError adoption rate (target: 100% of catch blocks) | Files still showing raw error.message |
| Define | Empty state guidance on 3 pages | Guidance coverage across all empty states | Filtered empty states in seller dashboard |
| Ideate | Undo on order cancellation | Undo/confirmation coverage on all destructive actions | Product deletion, bulletin post deletion |
| Prototype | Order confirmation dialog, bulletin preview | Confirmation before all irreversible actions | Product deletion without confirmation |
| Test | Feedback on Profile + OrderDetail | Feedback prompt after all high-emotion moments | Post-seller-onboarding, post-first-bulletin |

---

## Implementation Priority

| Priority | Gap | Effort | Impact |
|----------|-----|--------|--------|
| 1 | Gap 1 -- friendlyError in remaining 14 files | Small | High |
| 2 | Gap 2 -- Product delete confirmation | Small | Medium |
| 3 | Gap 5 -- Waiting state reassurance (worker/progress) | Small | Medium |
| 4 | Gap 6 -- Image upload guidance | Small | Medium |
| 5 | Gap 3 -- Filtered orders empty state | Small | Low |
| 6 | Gap 4 -- Post-onboarding feedback prompt | Small | Low |

---

## Technical Details

### Gap 1 -- friendlyError adoption (14 files)
In each file, add `import { friendlyError } from '@/lib/utils';` and replace:
```typescript
toast.error(error.message || 'Failed to X');
// becomes
toast.error(friendlyError(error));
```
For React Query `onError` callbacks:
```typescript
onError: (error: Error) => toast.error(error.message)
// becomes
onError: (error: Error) => toast.error(friendlyError(error))
```

### Gap 2 -- Product delete confirmation
Wrap the existing delete handler in an `AlertDialog`:
```tsx
<AlertDialog>
  <AlertDialogTrigger asChild>
    <button>...</button>
  </AlertDialogTrigger>
  <AlertDialogContent>
    <AlertDialogHeader>
      <AlertDialogTitle>Delete "{product.name}"?</AlertDialogTitle>
      <AlertDialogDescription>This cannot be undone.</AlertDialogDescription>
    </AlertDialogHeader>
    <AlertDialogFooter>
      <AlertDialogCancel>Keep</AlertDialogCancel>
      <AlertDialogAction onClick={handleDelete}>Delete</AlertDialogAction>
    </AlertDialogFooter>
  </AlertDialogContent>
</AlertDialog>
```

### Gaps 3, 5, 6 -- Copy-only changes
Pure text/JSX additions with no logic modifications.

