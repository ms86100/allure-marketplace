## Problem
When a seller edits an approved product, the admin has no way to see what changed. They see the new version but can't compare it to the previous one.

## Solution: Snapshot-based diff

### Step 1: Database — `product_edit_snapshots` table
- Stores a JSON snapshot of the product BEFORE an edit resubmission
- Fields: `id`, `product_id` (FK), `snapshot` (jsonb — full previous product data), `created_at`
- RLS: admins can read, system can insert

### Step 2: Frontend — Save snapshot before edit
- In `useSellerProducts.ts`, when `contentChanged` and status transitions to `pending`:
  - Insert a row into `product_edit_snapshots` with the current (pre-edit) product data
  - Then proceed with the update as usual

### Step 3: Admin UI — Diff view in `AdminProductApprovals`
- When viewing a pending product, fetch the latest snapshot from `product_edit_snapshots`
- If a snapshot exists, show a "Changes" section with side-by-side comparison
- Highlight changed fields (name, price, description, category, image, specifications)
- Fields unchanged are dimmed/hidden

### Files changed
- New migration: `product_edit_snapshots` table
- `src/hooks/useSellerProducts.ts` — save snapshot on edit
- `src/components/admin/ProductEditDiff.tsx` — new diff display component
- `src/components/admin/AdminProductApprovals.tsx` — integrate diff component
