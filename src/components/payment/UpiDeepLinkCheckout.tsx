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
import { Loader2, CheckCircle, XCircle, RefreshCw, Copy } from 'lucide-react';
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
  const [step, setStep] = useState<CheckoutStep>('pay');
  const [utrValue, setUtrValue] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const hasOpenedApp = useRef(false);

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

  useEffect(() => {
    if (isOpen) {
      setStep('pay');
      setUtrValue('');
      hasOpenedApp.current = false;
    }
  }, [isOpen]);

  // When user returns to the app after paying, advance to confirm step

  useEffect(() => {
    if (isOpen && !sellerUpiId) {
      toast.error('Seller UPI ID is not configured. Please contact the seller.');
      onPaymentFailed();
      onClose();
    }
  }, [isOpen, sellerUpiId]);

  const handlePayWithApp = (scheme: string) => {
    hasOpenedApp.current = true;
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
  };

  const handleSubmitUtr = async () => {
    const trimmed = utrValue.trim();
    if (!trimmed || trimmed.length < 6) {
      toast.error('Please enter a valid Transaction ID (at least 6 characters)');
      return;
    }

    setIsSubmitting(true);
    try {
      const { error } = await supabase.rpc('confirm_upi_payment', {
        _order_id: orderId,
        _upi_transaction_ref: trimmed,
      });

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
          await supabase.from('notification_queue').insert({
            user_id: sellerProfile.user_id,
            type: 'order',
            title: '💳 Payment Confirmation Needed',
            body: `Buyer claims UPI payment for Order #${shortOrderId}. UTR: ${trimmed}. Please verify and confirm.`,
            reference_path: `/orders/${orderId}`,
            payload: { orderId, status: 'buyer_confirmed', type: 'order' },
          } as any);

          supabase.functions.invoke('process-notification-queue').catch(() => {});
        }
      }

      setStep('done');
      setTimeout(() => onPaymentConfirmed(), 1500);
    } catch (err) {
      console.error('Failed to submit UTR:', err);
      toast.error('Failed to submit payment confirmation');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleClose = () => {
    // Only auto-cancel order if user never opened a payment app
    if (step === 'pay' && !hasOpenedApp.current) {
      onPaymentFailed();
    }
    onClose();
  };

  return (
    <Sheet open={isOpen} onOpenChange={handleClose}>
      <SheetContent side="bottom" className="rounded-t-2xl max-h-[90vh] overflow-y-auto">
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

              <Button variant="outline" className="w-full" onClick={handleClose}>
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
                <Button variant="ghost" className="w-full text-muted-foreground" onClick={handleClose}>
                  Cancel order
                </Button>
              </div>
            </div>
          )}

          {/* Step 3: Enter UTR */}
          {step === 'utr' && (
            <div className="space-y-5">
              <div className="text-center">
                <p className="font-semibold text-lg">Enter Transaction ID</p>
                <p className="text-sm text-muted-foreground mt-1">
                  Find the UTR/Transaction ID in your UPI app's payment confirmation
                </p>
              </div>

              <div className="space-y-2">
                <Label htmlFor="utr-input" className="text-sm font-medium">
                  UPI Transaction ID (UTR)
                </Label>
                <Input
                  id="utr-input"
                  placeholder="e.g. 546738264728"
                  value={utrValue}
                  onChange={(e) => setUtrValue(e.target.value.replace(/[^a-zA-Z0-9]/g, ''))}
                  className="font-mono text-center text-lg tracking-wider"
                  maxLength={22}
                  autoFocus
                />
                <p className="text-[11px] text-muted-foreground">
                  This helps the seller verify your payment quickly
                </p>
              </div>

              <div className="bg-muted/50 rounded-xl p-3">
                <p className="text-xs text-muted-foreground">
                  💡 <span className="font-medium">Where to find UTR?</span> Open your UPI app → Go to transaction history → Tap on this payment → Copy the Transaction ID / UTR number
                </p>
              </div>

              <div className="flex gap-3">
                <Button variant="outline" className="flex-1" onClick={() => setStep('confirm')}>
                  Back
                </Button>
                <Button
                  className="flex-1"
                  onClick={handleSubmitUtr}
                  disabled={isSubmitting || utrValue.trim().length < 6}
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
                <Button variant="outline" className="flex-1" onClick={handleClose}>
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
