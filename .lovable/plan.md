

## Fix: Update Codemagic Integration Name

### Problem
The build fails because `codemagic.yaml` references `Sociva App Store Connect` but your actual integration in Codemagic is named **`App Store Connect`**.

### Change
**File**: `codemagic.yaml` (line 16)

Replace:
```yaml
app_store_connect: Sociva App Store Connect
```
With:
```yaml
app_store_connect: App Store Connect
```

### After this change
Trigger a new build in Codemagic — the signing error should be resolved.

