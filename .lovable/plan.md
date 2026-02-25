

## Audit: Package-to-Feature Access Mismatches

### Root Cause of the Reported Issue

The `domestic_help` feature IS enabled in the Basic package (`is_enabled: true, source: package`). However, clicking "Try this feature" navigates to `/domestic-help`, which in `App.tsx` (line 287) **redirects** to `/workforce`:

```
<Route path="/domestic-help" element={<Navigate to="/workforce" replace />} />
```

The `/workforce` page (`WorkforceManagementPage`) is gated by `<FeatureGate feature="workforce_management">` — a **different** feature key that is NOT included in the Basic package. So the user is blocked despite `domestic_help` being enabled.

### Full Mismatch Audit

I cross-referenced every `platform_features.route` with the actual `FeatureGate` on the destination page:

| Feature Key (in package) | Route | Redirects To | Page Gate | Match? |
|---|---|---|---|---|
| `domestic_help` | `/domestic-help` | `/workforce` | `workforce_management` | **MISMATCH** |
| `help_requests` | `/community` | — | `bulletin` | **MISMATCH** |
| `authorized_persons` | N/A (no route) | — | `visitor_management` | OK (different gate, expected) |
| `visitor_management` | `/gate-entry` | — | `gate_entry` | **MISMATCH** |

All other features have matching routes and gates (e.g., `disputes` → `/disputes` → `FeatureGate feature="disputes"`).

### Three Mismatches Found

1. **`domestic_help` → `/domestic-help` → redirects to `/workforce` → gated by `workforce_management`**
   The redirect collapses two distinct features into one page. Since the package only includes `domestic_help` (not `workforce_management`), the gate blocks access.

2. **`help_requests` → `/community` → gated by `bulletin`**
   If a package includes `help_requests` but not `bulletin`, clicking "Try this feature" would be blocked by the `bulletin` gate.

3. **`visitor_management` → `/gate-entry` → gated by `gate_entry`**
   If a package includes `visitor_management` but not `gate_entry`, the page would be blocked.

### Proposed Fix

The cleanest fix that preserves the existing entitlement model is to update the `FeatureGate` on affected pages to accept **multiple feature keys** (OR logic — if ANY of the listed features is enabled, grant access):

**1. Create a multi-feature gate pattern** — Update `FeatureGate` to accept `feature: FeatureKey | FeatureKey[]` and check if ANY key is enabled.

**2. Apply to affected pages:**
- `WorkforceManagementPage.tsx`: `<FeatureGate feature={["workforce_management", "domestic_help"]}>`
- `BulletinPage.tsx`: `<FeatureGate feature={["bulletin", "help_requests"]}>`
- `GateEntryPage.tsx`: `<FeatureGate feature={["gate_entry", "visitor_management"]}>`

**3. Update `visitor_management` route** in the database from `/gate-entry` to `/gate-entry` (already correct, just needs the gate fix).

### Files to Change

- **`src/components/ui/FeatureGate.tsx`** — Update `feature` prop type to `FeatureKey | FeatureKey[]`. In the access check, if array, return true if ANY feature in the array is enabled.
- **`src/pages/WorkforceManagementPage.tsx`** (line 112) — Change gate to `feature={["workforce_management", "domestic_help"]}`.
- **`src/pages/MyWorkersPage.tsx`** (line 39) — Same change as above since it's the same module.
- **`src/pages/BulletinPage.tsx`** (line 178) — Change gate to `feature={["bulletin", "help_requests"]}`.
- **`src/pages/GateEntryPage.tsx`** (line 83) — Change gate to `feature={["gate_entry", "visitor_management"]}`.
- **`src/pages/AuthorizedPersonsPage.tsx`** (line 97) — Change gate to `feature={["visitor_management", "authorized_persons"]}`.

### Why Not Change the Routes Instead?

Changing the `route` values in the database would fix "Try this feature" but wouldn't fix the underlying gate mismatch — the pages would still block access for users who have the feature enabled via a different key. The multi-key gate approach is more robust and handles all entry paths (direct navigation, deep links, bookmarks).

