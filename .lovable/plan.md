

## Issues to Fix

### 1. Codemagic YAML Parse Error (P0 - Build Blocker)

**Root cause:** The shell heredoc content (Swift code) inside the `script: |` YAML block scalar is indented at 4 spaces, which is *less* than the parent block's indentation level (~12 spaces). YAML interprets this as exiting the block scalar, then encounters `deviceToken: Data` which it tries to parse as a YAML mapping — hence the error. This affects both the `ios-release` workflow (lines 47-63) and the `release-all` workflow (lines 233-249).

**Fix:** Re-indent all heredoc content (the Swift lines and the `SWIFT` terminator) to match the parent script block's indentation level. Every line of Swift code and the `SWIFT` delimiter must be indented at least to the same level as the other script lines (12 spaces).

**Files:** `codemagic.yaml` — two locations (lines 47-63 and lines 233-249).

### 2. Cart shows unavailable products (P2)

**Root cause:** `useCart.tsx` line 44 queries `cart_items` joined to `products` without filtering `is_available`. Unavailable products appear in the cart UI.

**Fix:** Add `.eq('product.is_available', true)` to the cart query, or filter client-side after fetch. The minimal approach is a client-side filter on the returned data since the join filter syntax can be tricky with nested selects.

**Files:** `src/hooks/useCart.tsx` — line 44-47.

### Implementation Steps

1. **Fix codemagic.yaml heredoc indentation** — Re-indent the Swift heredoc content in both `ios-release` and `release-all` workflows so all lines sit within the YAML block scalar's indentation.
2. **Filter unavailable products from cart** — Add a client-side filter after the cart query to exclude items where `product.is_available === false`.

