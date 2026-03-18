

## Fix: Working Directory Mismatch in Verification Grep

### Root Cause

Line 201 runs `cd ios/App` for the Ruby xcodeproj script. The shell stays in that directory for the rest of the step. Lines 221-222 then grep using paths relative to the project root (`ios/App/App/...`), but the CWD is already `ios/App/`, so the actual path resolved is `ios/App/ios/App/App/...` — file not found.

### Fix

After the Ruby block completes (line 217), add `cd ../..` to return to the project root before the verification greps run. Alternatively, change the grep paths to be relative to `ios/App/` (i.e., `App/SocivaBridgeViewController.swift` and `App/AppDelegate.swift`).

**Preferred approach** — add `cd` back to root (clearest):

**Line 219** — insert `cd ../..` before the verification block:
```bash
          cd ../..
          echo "=== Build verification ==="
```

Lines 221-222 remain unchanged.

**Same fix needed in the `release-all` workflow** — find the equivalent `cd ios/App` + verification block and apply the same `cd ../..`.

### Why This Fixes It
- File is correctly written to `ios/App/App/SocivaBridgeViewController.swift` (line 185-198)
- Ruby correctly adds it to the Xcode project (lines 202-217)
- Verification grep will now find the file at the correct absolute path
- Build proceeds past the assertion

