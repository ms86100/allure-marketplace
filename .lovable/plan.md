

# Fix: Image Upload Causes Step Reset in Seller Onboarding

## Root Cause

When uploading images on native iOS/Android, the camera or gallery picker opens as a native overlay. On iOS especially, the system can reclaim WebView memory while the picker is open. When the user returns, the entire React app reloads from scratch.

The `useSellerApplication` hook has this logic on reload (line 90-96):
```typescript
const draft = data.find(s => s.verification_status === 'draft');
if (draft) {
  // ...
  setStep(3);  // ← ALWAYS resets to step 3
}
```

So regardless of whether the user was on step 4 (store images) or step 5 (product images), they get sent back to step 3 every time the app reloads after a native picker interaction.

The draft data (business name, location, etc.) IS persisted to the database, but the **current step number is not**. This is why it looks like "redirecting back to the same page."

## Fix

**1. Persist onboarding step to localStorage** in `useSellerApplication.ts`:
- Whenever `step` changes (or `setStep` is called), write it to `localStorage` with key like `seller_onboarding_step`.
- When restoring a draft on mount, read the persisted step instead of hardcoding `3`. Clamp it to be at least `3` (since steps 1-2 are category selection, already encoded in the draft).
- Clear the persisted step on submission complete or save-and-exit.

**2. Auto-save formData before native picker opens** in `CroppableImageUpload` / `ImageUpload`:
- The `saveDraft()` in `handleProceedToSettings` already saves before entering step 4, so step 4 data is in the DB. But if the user changes images without explicitly saving, that state lives only in React.
- Add an auto-save of the current draft when step 4 is active and the user taps an image upload button. This ensures the draft in the DB reflects the latest form state before the WebView potentially dies.

**3. Restore formData from draft on reload** — this already works (line 121-142 `loadSellerDataIntoForm`), so uploaded images that were saved to the DB will be restored correctly.

## Files Changed

- **`src/hooks/useSellerApplication.ts`**: Persist `step` to localStorage on change; restore persisted step instead of hardcoding `3`; clear on submit/exit.
- **`src/pages/BecomeSellerPage.tsx`**: Before opening native image picker on step 4/5, trigger a draft save so formData is persisted to DB. This can be done by passing a `beforePick` callback to `CroppableImageUpload` or by saving draft whenever formData changes on step 4+ with a debounce.

