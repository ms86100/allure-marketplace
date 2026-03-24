

# Fix: Simplify & Clarify Workflow Capability Indicators

## Problem

The capability indicators always show ALL possible states simultaneously — "Delivery starts here", "No delivery", AND "Generic OTP available" — regardless of context. This creates noise and confusion. The "Generic OTP available" chip shows on every single step unconditionally (line 720), which is misleading when the admin is configuring delivery OTP.

## Fix

Replace the current "show everything" approach with **context-sensitive indicators** that only display what's relevant to the current step's configuration:

### New logic in `AdminWorkflowManager.tsx` (lines 700-728)

**Show only relevant indicators based on step state:**

1. **If step has `creates_tracking_assignment`**: Show "🚚 Delivery starts at this step — Delivery OTP available from here onward"
2. **If step is AFTER tracking start** (has delivery context, not the start step itself): Show "✅ Delivery OTP available (delivery started at: [step name])"
3. **If step is BEFORE tracking start OR no tracking configured**: Show nothing by default. Only show a warning IF the admin has selected `otp_type = 'delivery'`: "⚠️ Delivery OTP cannot work here — delivery has not started yet."
4. **Remove the always-visible "Generic OTP available" chip entirely** — it's always true and adds no information. Generic OTP is self-explanatory from the dropdown.
5. **Keep the inline error block** (lines 721-725) for the invalid delivery OTP case, but only show it when `otp_type = 'delivery'` is actively selected on an invalid step.

### Result

| Step state | OTP = None | OTP = Delivery | OTP = Generic |
|---|---|---|---|
| Before tracking | *(nothing)* | ⚠️ warning block | *(nothing)* |
| Tracking start step | 🚚 "Delivery starts here" | 🚚 + ✅ valid | *(nothing)* |
| After tracking | *(nothing)* | ✅ valid | *(nothing)* |

**One file changed**: `src/components/admin/AdminWorkflowManager.tsx` lines 700-728

