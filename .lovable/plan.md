

## Fix: OTP Input Keyboard Overlap + Auto-Submit on Autofill

### Problem
1. On mobile, the keyboard overlaps the 4 OTP input boxes, partially cutting them off
2. When OTP is auto-filled (e.g., from SMS suggestion), the user must manually dismiss keyboard and tap "Verify" — it should auto-submit

### Changes

**File: `src/pages/AuthPage.tsx` — `OtpStep` component**

1. **Keyboard-aware spacing**: Add generous `padding-bottom` to the OTP container so the content scrolls well above the keyboard. Use `scroll-margin-bottom` and ensure the wrapper has enough bottom padding for the virtual keyboard (~280px).

2. **Auto-verify on complete OTP**: Add a `useEffect` watching `auth.otp` — when `auth.otp.length === 4` and not already loading, automatically call `auth.handleVerifyOtp()`. This handles both manual entry completion and SMS autofill.

### Technical Detail

```tsx
// In OtpStep component, add:
useEffect(() => {
  if (auth.otp.length === 4 && !auth.isLoading) {
    auth.handleVerifyOtp();
  }
}, [auth.otp]);
```

For the keyboard overlap fix, increase `scrollMarginBottom` on the OTP container ref div and add bottom padding to the motion wrapper so the content can scroll above the keyboard fold.

