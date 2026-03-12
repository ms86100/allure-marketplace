

# Fix Onboarding Flow: Email, Redirect, and Navigation Loop

## Issue 1: Email field pre-filled with synthetic address

**Root cause**: `ProfileEditPage` line 24 initializes email state with `profile?.email || ''`. The profile email is set to the synthetic `917838459432@phone.sociva.app` during OTP registration.

**Fix in `src/pages/ProfileEditPage.tsx`**: Filter out synthetic emails — if the email ends with `@phone.sociva.app`, treat it as empty.

```ts
const [email, setEmail] = useState(
  profile?.email && !profile.email.endsWith('@phone.sociva.app') ? profile.email : ''
);
```

Also apply the same filter when saving — strip the synthetic email so it doesn't persist:
```ts
email: email.trim() && !email.trim().endsWith('@phone.sociva.app') ? email.trim() : null,
```

## Issue 2: Redirect loop after "Save & Go to Home"

**Root cause**: `HomePage.tsx` lines 24-31 has a `useEffect` that checks `!profile.flat_number || !profile.block` and redirects back to `/profile/edit`. Even after saving the profile, the `refreshProfile()` updates the context, but by the time the user reaches HomePage, the profile state in context may still be stale from the previous render cycle (React batching). More critically, if the user didn't save an address first, flat_number/block might genuinely be empty.

The real problem is that `handleSaveProfile` only saves `name` and `email` — it does NOT save `flat_number` and `block`. Those are only synced when an address is saved (line 64-74). So if the user fills out an address, then edits their name and clicks "Save & Go to Home," the profile IS complete. But if flat_number/block are empty (e.g., user without a society), the redirect guard on HomePage sends them right back.

**Fix**: The HomePage redirect guard is too aggressive. A user should be able to reach home if they have a name and at least one delivery address OR flat_number+block. The simplest fix is to relax the HomePage guard to only require `name`:

**In `src/pages/HomePage.tsx`** (line 26): Change the completeness check to only require name:
```ts
const isIncomplete = !profile.name || profile.name === 'User';
```

The profile completion banner (lines 61-85) already handles showing missing flat_number/block as a non-blocking prompt, which is the correct UX.

Also update the same check in `src/hooks/useAuthPage.ts` (line 193) to match:
```ts
const isIncomplete = !prof?.name || prof.name === 'User';
```

## Files to modify

1. **`src/pages/ProfileEditPage.tsx`** — Filter out synthetic `@phone.sociva.app` emails from initial state and save payload
2. **`src/pages/HomePage.tsx`** — Relax redirect guard to only require name (not flat_number/block)
3. **`src/hooks/useAuthPage.ts`** — Match the relaxed completeness check for post-login redirect

