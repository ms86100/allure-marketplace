import { useState, useEffect, useRef, useCallback } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
} from '@/components/ui/sheet';
import { Loader2, CheckCircle, XCircle, RefreshCw, Copy, ImagePlus, X, ChevronDown, ChevronUp } from 'lucide-react';
import { useCurrency } from '@/hooks/useCurrency';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import QRCodeDisplay from '@/components/security/QRCodeDisplay';

interface UpiDeepLinkCheckoutProps {
  isOpen: boolean;
  onClose: () => void;
  orderId: string;
  amount: number;
  sellerUpiId: string;
  sellerName: string;
  onPaymentConfirmed: () => void;
  onPaymentFailed: () => void;
}

type CheckoutStep = 'pay' | 'confirm' | 'utr' | 'done' | 'failed';

// Key for persisting UPI checkout step across app-switch
const UPI_STEP_KEY = 'sociva_upi_checkout_step';
const UPI_OPENED_APP_KEY = 'sociva_upi_opened_app';

export function UpiDeepLinkCheckout({
  isOpen,
  onClose,
  orderId,
  amount,
  sellerUpiId,
  sellerName,
  onPaymentConfirmed,
  onPaymentFailed,
}: UpiDeepLinkCheckoutProps) {
  const { formatPrice } = useCurrency();
  // Restore persisted step on mount (survives app-switch remounts)
  const [step, setStepRaw] = useState<CheckoutStep>(() => {
    try {
      const saved = sessionStorage.getItem(UPI_STEP_KEY);
      if (saved && ['pay', 'confirm', 'utr'].includes(saved)) return saved as CheckoutStep;
    } catch {}
    return 'pay';
  });
  const [utrValue, setUtrValue] = useState('');
  const [screenshotFile, setScreenshotFile] = useState<File | null>(null);
  const [screenshotPreview, setScreenshotPreview] = useState<string | null>(null);
  const [showUtrField, setShowUtrField] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const hasOpenedApp = useRef<boolean>(
    (() => { try { return sessionStorage.getItem(UPI_OPENED_APP_KEY) === 'true'; } catch { return false; } })()
  );
  const completionTriggeredRef = useRef(false);

  // Wrapper to persist step changes
  const setStep = useCallback((nextStep: CheckoutStep | ((prev: CheckoutStep) => CheckoutStep)) => {
    setStepRaw(prev => {
      const resolved = typeof nextStep === 'function' ? nextStep(prev) : nextStep;
      try { sessionStorage.setItem(UPI_STEP_KEY, resolved); } catch {}
      return resolved;
    });
  }, []);

  const shortOrderId = orderId.slice(0, 8).toUpperCase();
  const transactionNote = `ORD_${shortOrderId}`;

  const UPI_APPS = [
    { name: 'Google Pay', scheme: 'tez', bg: 'bg-[hsl(217,89%,51%)]', text: 'text-white' },
    { name: 'PhonePe', scheme: 'phonepe', bg: 'bg-[hsl(267,56%,42%)]', text: 'text-white' },
    { name: 'Paytm', scheme: 'paytmmp', bg: 'bg-[hsl(197,97%,46%)]', text: 'text-white' },
  ];

  const buildUpiLink = (scheme: string) =>
    `${scheme}://upi/pay?pa=${encodeURIComponent(sellerUpiId)}&pn=${encodeURIComponent(sellerName)}&am=${amount}&cu=INR&tn=${encodeURIComponent(transactionNote)}`;

  const upiLink = `upi://pay?pa=${encodeURIComponent(sellerUpiId)}&pn=${encodeURIComponent(sellerName)}&am=${amount}&cu=INR&tn=${encodeURIComponent(transactionNote)}`;

  // Track whether this is the first open vs a restored open
  const isRestoredRef = useRef(false);
  useEffect(() => {
    if (isOpen) {
      // If we have a persisted step from a prior app-switch, DON'T reset
      const savedStep = (() => { try { return sessionStorage.getItem(UPI_STEP_KEY); } catch { return null; } })();
      const savedOpened = (() => { try { return sessionStorage.getItem(UPI_OPENED_APP_KEY) === 'true'; } catch { return false; } })();
      
      if (savedOpened && savedStep && ['confirm', 'utr'].includes(savedStep)) {
        // Restoring from app-switch — keep persisted state
        isRestoredRef.current = true;
        hasOpenedApp.current = true;
        setStep(savedStep as CheckoutStep);
      } else if (!isRestoredRef.current) {
        // Fresh open — reset everything
        setStep('pay');
        setUtrValue('');
        hasOpenedApp.current = false;
        try { sessionStorage.removeItem(UPI_OPENED_APP_KEY); } catch {}
        completionTriggeredRef.current = false;
      }
    } else {
      isRestoredRef.current = false;
    }
  }, [isOpen]);

  const completeFlow = useCallback(() => {
    if (completionTriggeredRef.current) return;
    completionTriggeredRef.current = true;
    setStep('done');
    // Clean up persisted session on success
    try { sessionStorage.removeItem(UPI_STEP_KEY); sessionStorage.removeItem(UPI_OPENED_APP_KEY); } catch {}
    setTimeout(() => onPaymentConfirmed(), 1500);
  }, [onPaymentConfirmed]);

  useEffect(() => {
    if (isOpen && !sellerUpiId) {
      toast.error('Seller UPI ID is not configured. Please contact the seller.');
      onPaymentFailed();
      onClose();
    }
  }, [isOpen, sellerUpiId, onPaymentFailed, onClose]);

  // On app resume from UPI app, check payment status and show confirmation UI
  useEffect(() => {
    if (!isOpen) return;

    const handleVisibilityChange = async () => {
      if (document.visibilityState !== 'visible' || !hasOpenedApp.current || completionTriggeredRef.current) return;

      // Check if payment was already confirmed server-side
      const { data, error } = await supabase
        .from('orders')
        .select('payment_status, status')
        .eq('id', orderId)
        .maybeSingle();

      if (error || !data) {
        // On error, still show confirm step so user can manually confirm
        setStep((prev) => (prev === 'pay' ? 'confirm' : prev));
        return;
      }

      if (data.payment_status === 'paid' || data.payment_status === 'buyer_confirmed') {
        completeFlow();
        return;
      }

      if (data.status === 'cancelled') {
        setStep('failed');
        return;
      }

      // CRITICAL: Always advance to confirm step so "I Paid / Pay Again" stays visible
      setStep('confirm');
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);
    return () => document.removeEventListener('visibilitychange', handleVisibilityChange);
  }, [isOpen, orderId, completeFlow]);

  const handlePayWithApp = (scheme: string) => {
    hasOpenedApp.current = true;
    try { sessionStorage.setItem(UPI_OPENED_APP_KEY, 'true'); } catch {}
    setStep('confirm');
    const link = buildUpiLink(scheme);
    window.open(link, '_blank');
  };

  const handleCopyUpi = () => {
    navigator.clipboard.writeText(sellerUpiId);
    toast.success('UPI ID copied');
  };

  const handleConfirmPaid = () => {
    setStep('utr');
    setScreenshotFile(null);
    setScreenshotPreview(null);
    setUtrValue('');
    setShowUtrField(false);
  };

  const handleScreenshotSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 5 * 1024 * 1024) {
      toast.error('Image must be under 5MB');
      return;
    }
    setScreenshotFile(file);
    setScreenshotPreview(URL.createObjectURL(file));
  };

  const handleRemoveScreenshot = () => {
    setScreenshotFile(null);
    if (screenshotPreview) URL.revokeObjectURL(screenshotPreview);
    setScreenshotPreview(null);
  };

  const handleSubmitConfirmation = async () => {
    setIsSubmitting(true);
    try {
      let screenshotUrl: string | null = null;

      // Upload screenshot if provided
      if (screenshotFile) {
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) throw new Error('Not authenticated');
        const ext = screenshotFile.name.split('.').pop() || 'jpg';
        const path = `${user.id}/${orderId}.${ext}`;
        const { error: uploadErr } = await supabase.storage
          .from('payment-proofs')
          .upload(path, screenshotFile, { upsert: true });
        if (uploadErr) throw uploadErr;

        const { data: urlData } = supabase.storage
          .from('payment-proofs')
          .getPublicUrl(path);
        // For private buckets, use signed URL
        const { data: signedData } = await supabase.storage
          .from('payment-proofs')
          .createSignedUrl(path, 60 * 60 * 24 * 30); // 30 days
        screenshotUrl = signedData?.signedUrl || urlData?.publicUrl || null;
      }

      const trimmed = utrValue.trim();

      const { error } = await supabase.rpc('confirm_upi_payment', {
        _order_id: orderId,
        _upi_transaction_ref: trimmed || '',
        _payment_screenshot_url: screenshotUrl,
      } as any);

      if (error) throw error;

      // Notify seller
      const { data: orderData } = await supabase
        .from('orders')
        .select('seller_id, buyer_id')
        .eq('id', orderId)
        .single();

      if (orderData) {
        const { data: sellerProfile } = await supabase
          .from('seller_profiles')
          .select('user_id')
          .eq('id', orderData.seller_id)
          .single();

        if (sellerProfile) {
          const evidenceParts: string[] = [];
          if (trimmed) evidenceParts.push(`UTR: ${trimmed}`);
          if (screenshotUrl) evidenceParts.push('Screenshot attached');
          const evidenceText = evidenceParts.length > 0
            ? evidenceParts.join('. ') + '.'
            : 'No evidence provided.';

          await supabase.from('notification_queue').insert({
            user_id: sellerProfile.user_id,
            type: 'order',
            title: '💳 Payment Confirmation Needed',
            body: `Buyer claims UPI payment for Order #${shortOrderId}. ${evidenceText} Please verify and confirm.`,
            reference_path: `/orders/${orderId}`,
            payload: { orderId, status: 'buyer_confirmed', type: 'order' },
          } as any);

          supabase.functions.invoke('process-notification-queue').catch(() => {});
        }
      }

      completeFlow();
    } catch (err) {
      console.error('Failed to submit payment confirmation:', err);
      toast.error('Failed to submit payment confirmation');
    } finally {
      setIsSubmitting(false);
    }
  };

  const dismissLocked = hasOpenedApp.current && (step === 'confirm' || step === 'utr' || isSubmitting);

  const handleSystemClose = () => {
    if (dismissLocked) return;
    // Only auto-cancel order if user never opened a payment app
    if (step === 'pay' && !hasOpenedApp.current) {
      try { sessionStorage.removeItem(UPI_STEP_KEY); sessionStorage.removeItem(UPI_OPENED_APP_KEY); } catch {}
      onPaymentFailed();
    }
    onClose();
  };

  const handleCancelOrder = () => {
    try { sessionStorage.removeItem(UPI_STEP_KEY); sessionStorage.removeItem(UPI_OPENED_APP_KEY); } catch {}
    onPaymentFailed();
    onClose();
  };

  const handleSheetOpenChange = (nextOpen: boolean) => {
    if (!nextOpen) handleSystemClose();
  };

  return (
    <Sheet open={isOpen} onOpenChange={handleSheetOpenChange}>
      <SheetContent
        side="bottom"
        className="rounded-t-2xl max-h-[90vh] overflow-y-auto"
        onPointerDownOutside={(event) => {
          if (dismissLocked) event.preventDefault();
        }}
        onEscapeKeyDown={(event) => {
          if (dismissLocked) event.preventDefault();
        }}
      >
        <SheetHeader className="text-center pb-4">
          <SheetTitle>Pay via UPI</SheetTitle>
          <SheetDescription>
            Pay {formatPrice(amount)} to {sellerName}
          </SheetDescription>
        </SheetHeader>

        <div className="py-4">
          {/* Step 1: Pay */}
          {step === 'pay' && (
            <div className="text-center space-y-5">
              <QRCodeDisplay value={upiLink} size={180} />

              <div>
                <p className="font-semibold text-2xl">{formatPrice(amount)}</p>
                <p className="text-sm text-muted-foreground mt-1">
                  Scan QR or choose your UPI app below
                </p>
              </div>

              <div className="bg-muted rounded-xl p-3 text-left space-y-2">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-[11px] text-muted-foreground uppercase tracking-wide">UPI ID</p>
                    <p className="text-sm font-mono font-medium">{sellerUpiId}</p>
                  </div>
                  <button onClick={handleCopyUpi} className="text-muted-foreground hover:text-foreground">
                    <Copy size={14} />
                  </button>
                </div>
                <div>
                  <p className="text-[11px] text-muted-foreground uppercase tracking-wide">Order Reference</p>
                  <p className="text-sm font-mono font-medium">{transactionNote}</p>
                </div>
              </div>

              <div className="grid grid-cols-3 gap-3 pt-2">
                {UPI_APPS.map((app) => (
                  <button
                    key={app.scheme}
                    onClick={() => handlePayWithApp(app.scheme)}
                    className={`${app.bg} ${app.text} rounded-xl py-3 px-2 text-sm font-semibold transition-transform active:scale-95`}
                  >
                    {app.name}
                  </button>
                ))}
              </div>

              <Button variant="outline" className="w-full" onClick={handleCancelOrder}>
                Cancel
              </Button>
            </div>
          )}

          {/* Step 2: Confirm payment */}
          {step === 'confirm' && (
            <div className="text-center space-y-5">
              <div className="w-20 h-20 mx-auto rounded-full bg-primary/10 flex items-center justify-center">
                <CheckCircle className="text-primary" size={40} />
              </div>
              <div>
                <p className="font-semibold text-lg">Did you complete the payment?</p>
                <p className="text-sm text-muted-foreground mt-1">
                  {formatPrice(amount)} to {sellerName}
                </p>
              </div>
              <div className="flex flex-col gap-3 pt-2">
                <Button className="w-full gap-2" onClick={handleConfirmPaid}>
                  <CheckCircle size={16} />
                  Yes, I paid
                </Button>
                <Button variant="outline" className="w-full gap-2" onClick={() => setStep('pay')}>
                  <RefreshCw size={16} />
                  Pay again
                </Button>
                <Button variant="ghost" className="w-full text-muted-foreground" onClick={handleCancelOrder}>
                  Cancel order
                </Button>
              </div>
            </div>
          )}

          {/* Step 3: Confirm Payment */}
          {step === 'utr' && (
            <div className="space-y-4">
              <div className="text-center">
                <p className="font-semibold text-lg">Confirm Your Payment</p>
                <p className="text-sm text-muted-foreground mt-1">
                  {formatPrice(amount)} to {sellerName}
                </p>
              </div>

              {/* Empathetic explanation */}
              <div className="bg-muted/50 rounded-xl p-3.5">
                <p className="text-xs text-muted-foreground leading-relaxed">
                  💡 Sociva doesn't track payments automatically yet. To help your seller confirm your payment quickly, you can share a screenshot of the payment confirmation. This is <span className="font-medium text-foreground">completely optional</span> — you can simply tap "Confirm Payment" to proceed.
                </p>
              </div>

              {/* Screenshot upload */}
              <div className="space-y-2">
                <Label className="text-sm font-medium">Payment Screenshot <span className="text-muted-foreground font-normal">(optional)</span></Label>
                {screenshotPreview ? (
                  <div className="relative rounded-xl overflow-hidden border border-border">
                    <img src={screenshotPreview} alt="Payment proof" className="w-full max-h-48 object-contain bg-muted/30" />
                    <button
                      onClick={handleRemoveScreenshot}
                      className="absolute top-2 right-2 bg-background/80 backdrop-blur-sm rounded-full p-1 border border-border hover:bg-destructive/10 transition-colors"
                    >
                      <X size={14} className="text-muted-foreground" />
                    </button>
                  </div>
                ) : (
                  <label className="flex flex-col items-center justify-center gap-1.5 py-6 rounded-xl border-2 border-dashed border-muted-foreground/25 hover:border-primary/40 transition-colors cursor-pointer bg-muted/20">
                    <ImagePlus size={24} className="text-muted-foreground" />
                    <span className="text-xs text-muted-foreground">Tap to upload screenshot</span>
                    <input
                      type="file"
                      accept="image/*"
                      className="hidden"
                      onChange={handleScreenshotSelect}
                    />
                  </label>
                )}
              </div>

              {/* Collapsible UTR field */}
              <div>
                <button
                  type="button"
                  onClick={() => setShowUtrField(!showUtrField)}
                  className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors"
                >
                  {showUtrField ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
                  Add Transaction ID (UTR)
                </button>
                {showUtrField && (
                  <div className="mt-2 space-y-1.5">
                    <Input
                      id="utr-input"
                      placeholder="e.g. 546738264728"
                      value={utrValue}
                      onChange={(e) => setUtrValue(e.target.value.replace(/[^a-zA-Z0-9]/g, ''))}
                      className="font-mono text-center tracking-wider"
                      maxLength={22}
                    />
                    <p className="text-[10px] text-muted-foreground">
                      Find this in your UPI app's transaction history
                    </p>
                  </div>
                )}
              </div>

              <div className="flex gap-3 pt-1">
                <Button variant="outline" className="flex-1" onClick={() => setStep('confirm')}>
                  Back
                </Button>
                <Button
                  className="flex-1"
                  onClick={handleSubmitConfirmation}
                  disabled={isSubmitting}
                >
                  {isSubmitting ? (
                    <><Loader2 className="mr-2 animate-spin" size={16} />Submitting...</>
                  ) : (
                    'Confirm Payment'
                  )}
                </Button>
              </div>
            </div>
          )}

          {/* Step 4: Success */}
          {step === 'done' && (
            <div className="text-center space-y-4 py-8">
              <div className="w-20 h-20 mx-auto rounded-full bg-accent/10 flex items-center justify-center">
                <CheckCircle className="text-accent" size={48} />
              </div>
              <div>
                <p className="font-semibold text-accent">Payment Submitted!</p>
                <p className="text-sm text-muted-foreground mt-1">
                  Seller will verify and confirm your payment
                </p>
              </div>
            </div>
          )}

          {/* Step 5: Failed */}
          {step === 'failed' && (
            <div className="text-center space-y-6 py-4">
              <div className="w-20 h-20 mx-auto rounded-full bg-destructive/10 flex items-center justify-center">
                <XCircle className="text-destructive" size={48} />
              </div>
              <div>
                <p className="font-semibold text-destructive">Payment Failed</p>
                <p className="text-sm text-muted-foreground">
                  The payment could not be verified
                </p>
              </div>
              <div className="flex gap-3 pt-4">
                <Button variant="outline" className="flex-1" onClick={handleCancelOrder}>
                  Cancel
                </Button>
                <Button className="flex-1" onClick={() => setStep('pay')}>
                  <RefreshCw size={16} className="mr-2" />
                  Retry
                </Button>
              </div>
            </div>
          )}
        </div>
      </SheetContent>
    </Sheet>
  );
}
