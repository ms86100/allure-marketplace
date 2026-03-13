

## Fix: Chat Keyboard Visibility on Mobile (Both Chats)

### Root Cause

The seller chat uses a **Vaul Drawer** (bottom sheet), which has its own internal keyboard repositioning logic. On Capacitor iOS with `Keyboard: { resize: 'body' }`, the body itself resizes when the keyboard opens, which tricks Vaul into thinking no keyboard is present. The drawer does not move upward, and the input field ends up hidden behind the keyboard.

The custom `visualViewport` listener added to `SellerChatSheet` conflicts with Vaul's internal handler, causing unpredictable behavior.

### Solution

**Replace the Vaul Drawer in `SellerChatSheet` with a full-screen fixed overlay** — the same proven pattern already used by `OrderChat`. This completely avoids the Vaul/keyboard conflict.

Then **apply the same robust keyboard-aware pattern to both chat components** so they behave identically:

### Changes

**1. `src/components/product/SellerChatSheet.tsx`** — Rewrite to use a full-screen fixed overlay instead of Vaul Drawer:
- Remove `Drawer`, `DrawerContent`, `DrawerHeader`, `DrawerTitle` imports
- Use a `fixed inset-x-0 top-0 z-[60]` container (same as `OrderChat`)
- Track `visualViewport.height` to set container height dynamically
- Keep auto-expanding `Textarea` and flex layout (header / messages / input)
- Add close button in the header
- Transition: slide-up animation for opening

**2. `src/components/chat/OrderChat.tsx`** — Apply same improvements:
- Replace single-line `Input` with auto-expanding `Textarea` (WhatsApp-like)
- Ensure `scrollToBottom` fires on focus with delay
- Keep existing `visualViewport` resize handling (already working pattern)

### Layout Structure (Both Chats)

```text
┌──────────────────────────┐
│  Header (shrink-0)       │  ← Fixed, shows name + close button
├──────────────────────────┤
│                          │
│  Messages (flex-1)       │  ← Scrollable, min-h-0, overflow-y-auto
│                          │
├──────────────────────────┤
│  Input bar (shrink-0)    │  ← Pinned above keyboard, auto-expanding textarea
└──────────────────────────┘
     ↑ keyboard starts here
```

Container height = `visualViewport.height` (shrinks when keyboard opens), positioned at `visualViewport.offsetTop`. This ensures the entire chat UI fits exactly in the visible area above the keyboard.

### Why This Works

- Full-screen fixed overlay is independent of Vaul's transform/position logic
- `visualViewport.height` correctly reports available space above keyboard regardless of Capacitor's resize mode
- Same pattern as `OrderChat` which is already proven to work
- No conflicting event listeners between library code and custom code

