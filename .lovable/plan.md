

# Fix: "Invite a neighbor to sell" Button Does Nothing

## Problem
The button at line 256 uses `navigator.share()` but has **no fallback** when the Web Share API is unavailable (desktop browsers, some in-app browsers). When `navigator.share` is `undefined`, the `onClick` handler silently does nothing.

## Fix — `src/components/home/MarketplaceSection.tsx` (lines 256-265)

Add a fallback: when `navigator.share` is not available, copy the invite link to clipboard and show a toast notification.

```tsx
onClick={() => {
  const shareData = { title: 'Join our community marketplace', url: window.location.origin };
  if (navigator.share) {
    navigator.share(shareData).catch(() => {});
  } else {
    navigator.clipboard.writeText(shareData.url).then(() => {
      toast({ title: 'Link copied!', description: 'Share it with your neighbor' });
    });
  }
}}
```

- Import `useToast` (already used elsewhere in the project)
- One line change, zero risk

