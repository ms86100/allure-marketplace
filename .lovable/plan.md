

# Society Identity Resolution — Smart Matching System

## Problem
When users select a society during signup via Google Places, inconsistent naming (e.g. "Shriram Greenfield Phase 1" vs "Shriram Greenfield") creates duplicate society records. Currently the match logic in `useAuthPage.ts` (line 235-239) does a naive `includes()` string comparison — no normalization, no fuzzy matching, no geo fallback.

## Current Flow (lines 228-256 of useAuthPage.ts)
1. User selects Google Place → `handleSelectGooglePlace`
2. Naive name match against loaded societies (`includes()`)
3. If no match → creates a pending new society immediately
4. `validate-society` edge function creates it in DB with no dedup check

## Solution: 3-Layer Resolution

### Layer 1: Database — `society_aliases` table + `resolve_society` RPC

**Migration 1**: Create alias table + normalized name column

```sql
-- Enable trigram index support (already available)
ALTER TABLE public.societies ADD COLUMN IF NOT EXISTS normalized_name text;

CREATE TABLE public.society_aliases (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  society_id uuid NOT NULL REFERENCES public.societies(id) ON DELETE CASCADE,
  alias_name text NOT NULL,
  normalized_alias text NOT NULL,
  google_place_id text,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(normalized_alias)
);
CREATE INDEX idx_aliases_trgm ON public.society_aliases USING gin (normalized_alias gin_trgm_ops);
CREATE INDEX idx_aliases_society ON public.society_aliases(society_id);
CREATE INDEX idx_societies_norm_trgm ON public.societies USING gin (normalized_name gin_trgm_ops);

ALTER TABLE public.society_aliases ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Anyone can read aliases" ON public.society_aliases FOR SELECT USING (true);

-- Backfill normalized_name for existing societies
UPDATE public.societies SET normalized_name = lower(regexp_replace(
  regexp_replace(name, '\s*(phase|ph|tower|block|wing|sec|sector)\s*[\d\-IiVvXx]*', '', 'gi'),
  '\s+', ' ', 'g'));
```

**Migration 2**: Create `resolve_society` RPC with confidence scoring + multi-match

```sql
CREATE OR REPLACE FUNCTION public.resolve_society(
  _input_name text,
  _lat double precision DEFAULT NULL,
  _lng double precision DEFAULT NULL,
  _google_place_id text DEFAULT NULL
) RETURNS TABLE(
  society_id uuid, society_name text, match_type text, confidence numeric
)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $$
DECLARE
  _normalized text;
BEGIN
  -- Normalize: lowercase, strip phase/tower/block keywords, collapse whitespace
  _normalized := lower(trim(_input_name));
  _normalized := regexp_replace(_normalized, '\s*(phase|ph|tower|block|wing|sec|sector)\s*[\d\-IiVvXx]*', '', 'gi');
  _normalized := regexp_replace(_normalized, '\s+', ' ', 'g');
  _normalized := trim(_normalized);

  -- 1. Exact google_place_id match (confidence 1.0)
  IF _google_place_id IS NOT NULL THEN
    RETURN QUERY
    SELECT sa.society_id, s.name, 'place_id'::text, 1.0::numeric
    FROM society_aliases sa JOIN societies s ON s.id = sa.society_id
    WHERE sa.google_place_id = _google_place_id AND s.is_active = true
    LIMIT 1;
    IF FOUND THEN RETURN; END IF;
  END IF;

  -- 2. Exact normalized match on societies (0.95)
  RETURN QUERY
  SELECT s.id, s.name, 'exact'::text, 0.95::numeric
  FROM societies s WHERE s.normalized_name = _normalized AND s.is_active = true
  LIMIT 1;
  IF FOUND THEN RETURN; END IF;

  -- 3. Exact alias match (0.9)
  RETURN QUERY
  SELECT sa.society_id, s.name, 'alias'::text, 0.9::numeric
  FROM society_aliases sa JOIN societies s ON s.id = sa.society_id
  WHERE sa.normalized_alias = _normalized AND s.is_active = true
  LIMIT 1;
  IF FOUND THEN RETURN; END IF;

  -- 4. Fuzzy trigram match — return top 3 (scored dynamically)
  RETURN QUERY
  SELECT s.id, s.name, 'fuzzy'::text,
    round(similarity(s.normalized_name, _normalized)::numeric, 2) as conf
  FROM societies s
  WHERE s.normalized_name IS NOT NULL AND s.is_active = true
    AND similarity(s.normalized_name, _normalized) > 0.35
  ORDER BY similarity(s.normalized_name, _normalized) DESC
  LIMIT 3;
  IF FOUND THEN RETURN; END IF;

  -- 5. Geo-radius match within 500m (0.4) — using haversine
  IF _lat IS NOT NULL AND _lng IS NOT NULL THEN
    RETURN QUERY
    SELECT s.id, s.name, 'geo'::text, 0.4::numeric
    FROM societies s
    WHERE s.latitude IS NOT NULL AND s.longitude IS NOT NULL AND s.is_active = true
      AND haversine_km(_lat, _lng, s.latitude::double precision, s.longitude::double precision) < 0.5
    ORDER BY haversine_km(_lat, _lng, s.latitude::double precision, s.longitude::double precision)
    LIMIT 3;
  END IF;

  RETURN;
END;
$$;
```

### Layer 2: Edge Function — Dedup check before creating society

**File**: `supabase/functions/validate-society/index.ts`

Before inserting a new society (line 69), call `resolve_society` to check for existing matches. If a high-confidence match exists (≥0.8), return the existing society instead of creating a duplicate.

```typescript
// Before insert — check for existing match
const { data: matches } = await adminClient.rpc('resolve_society', {
  _input_name: sanitizedName,
  _lat: latitude || null,
  _lng: longitude || null,
  _google_place_id: null,
});

if (matches?.length > 0 && matches[0].confidence >= 0.8) {
  // Auto-merge: return existing society, save alias
  await adminClient.from('society_aliases').upsert({
    society_id: matches[0].society_id,
    alias_name: sanitizedName,
    normalized_alias: sanitizedName.toLowerCase().replace(/\s*(phase|ph|tower|block|wing|sec|sector)\s*[\d\-]*/gi, '').replace(/\s+/g, ' ').trim(),
  }, { onConflict: 'normalized_alias' });
  
  return existingSocietyResponse(matches[0]);
}
// ... proceed with insert + auto-create alias for new society
```

Also: after every new society creation, auto-insert the original name as an alias.

### Layer 3: Frontend — Multi-match confirmation UI

**File**: `src/hooks/useAuthPage.ts` — `handleSelectGooglePlace`

Replace the naive `includes()` match (lines 235-256) with a call to `resolve_society` RPC:

```typescript
const { data: matches } = await supabase.rpc('resolve_society', {
  _input_name: details.name,
  _lat: details.latitude,
  _lng: details.longitude,
  _google_place_id: placeId,
});

if (matches?.length === 1 && matches[0].confidence >= 0.8) {
  // Auto-select with toast
  const existing = societies.find(s => s.id === matches[0].society_id);
  if (existing) { handleSelectDbSociety(existing); return; }
}

if (matches?.length > 0 && matches[0].confidence >= 0.4) {
  // Show confirmation UI with matches
  setPotentialMatches(matches);
  return;
}

// No match — proceed with new society creation
```

**New component**: `SocietyMatchConfirm` (inline in AuthPage)

When `potentialMatches` has items, show a selection card:

```
"We found similar communities:"
○ Shriram Greenfield (95% match)
○ Greenfield Residency (52% match)
○ None of these — create new
[Continue]
```

When user confirms a match → also auto-save their input as a new alias (learning loop).

**File**: `src/pages/AuthPage.tsx` — Add the match confirmation UI in the `societySubStep === 'search'` section.

### Layer 4: Auto-Learning (alias creation on match confirmation)

When a user confirms a match with a different name variant:
- Insert new alias via `society_aliases` (through validate-society edge function)
- Future users typing the same variant get an instant exact match

## Files Changed

| File | Change |
|------|--------|
| Migration 1 | `society_aliases` table, `normalized_name` column, indexes, backfill |
| Migration 2 | `resolve_society` RPC with confidence scoring |
| `supabase/functions/validate-society/index.ts` | Add dedup check before insert + auto-alias creation |
| `src/hooks/useAuthPage.ts` | Replace naive match with `resolve_society` RPC call |
| `src/pages/AuthPage.tsx` | Add `SocietyMatchConfirm` inline UI for multi-match |

## UX Behavior by Confidence

| Confidence | Behavior |
|-----------|----------|
| ≥ 0.8 (1 match) | Auto-select, show toast "Found: X" |
| ≥ 0.4 (1+ matches) | Show confirmation card with options |
| < 0.4 or no match | Proceed to create new society |

## Edge Cases

| Case | Behavior |
|------|----------|
| "Phase 1" vs "Phase 2" same complex | Normalized to same base → matched |
| Same name, 10km apart | Geo check fails → treated as different |
| Two users register simultaneously | `UNIQUE(normalized_alias)` prevents duplicate aliases; `validate-society` dedup prevents duplicate societies |
| User rejects all matches | New society created + original name saved as alias |
| Typos ("Green Feild") | Trigram similarity catches at ~0.5-0.6 confidence → shown as option |

