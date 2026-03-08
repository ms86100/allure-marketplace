

## Fix Plan: Icon Rendering + Contact Seller Hub Restoration

### Issue 1: Category Icons Showing as Text

**Root Cause**: The `parent_groups` and `category_config` tables store Lucide icon names as strings (e.g., "UtensilsCrossed", "ChefHat", "GraduationCap"). Multiple components render these strings directly as text via `{cat.icon}` or `{tab.icon}` instead of resolving them to actual Lucide icon components.

**Fix**: Create a shared `DynamicIcon` component that maps icon name strings to Lucide React components, then use it in all affected locations.

**Files to create:**
- `src/components/ui/DynamicIcon.tsx` — A component that takes an icon name string and renders the corresponding Lucide icon. Uses `lucide-react`'s `icons` export for dynamic lookup. Falls back to a default icon or emoji if unrecognized.

**Files to edit (replace text icon rendering with DynamicIcon):**
- `src/components/home/ParentGroupTabs.tsx` — line 54: `{tab.icon}` → `<DynamicIcon name={tab.icon} />`
- `src/components/home/MarketplaceSection.tsx` — line 304: `{cat.icon}` → `<DynamicIcon name={cat.icon} />`
- `src/components/home/CategoryImageGrid.tsx` — line 66 & 136: fallbackIcon text → DynamicIcon
- `src/components/category/CategoryBrowseGrid.tsx` — line 62: `{cat.icon}` → `<DynamicIcon name={cat.icon} />`
- `src/components/category/CategoryGrid.tsx` — lines 56, 73: `{config.icon}` → `<DynamicIcon name={config.icon} />`

---

### Issue 2: Contact Seller Hub Missing Message + Feedback

**Root Cause**: The `ContactSellerModal.tsx` file has reverted to its original single-button "Call Now" version. The companion files (`CallFeedbackModal.tsx`, `SellerChatSheet.tsx`, `useSellerChat.ts`) that were created during the March 8 session are completely missing from the codebase — same situation as the docs hub.

**Fix**: Recreate all three missing files and rewrite ContactSellerModal as the multi-action hub.

**Files to create:**
- `src/hooks/useSellerChat.ts` — Hook with `getOrCreateConversation`, `useMessages` (query + realtime), `sendMessage` (insert + notification_queue)
- `src/components/product/CallFeedbackModal.tsx` — Post-call feedback dialog with 6 radio options, stores to `call_feedback` table
- `src/components/product/SellerChatSheet.tsx` — Bottom drawer with real-time chat, product context header, message list with realtime subscription

**Files to edit:**
- `src/components/product/ContactSellerModal.tsx` — Full rewrite: seller info card + Call Now button (always visible, disabled if no phone) + Message button + post-call feedback trigger after 5s delay
- `src/components/product/ProductDetailSheet.tsx` — Pass `productId`, `sellerId`, `buyerId` props to ContactSellerModal

**Database**: The tables (`seller_contact_interactions`, `call_feedback`, `seller_conversations`, `seller_conversation_messages`) were created in the March 8 session and should still exist. Will verify before attempting any migrations.

