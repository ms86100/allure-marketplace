import { useState, useEffect, useRef } from 'react';
import { Button } from '@/components/ui/button';
import {
  Drawer,
  DrawerContent,
  DrawerHeader,
  DrawerTitle,
  DrawerDescription,
} from '@/components/ui/drawer';
import { Loader2, CreditCard, CheckCircle, XCircle, RefreshCw, WifiOff } from 'lucide-react';
import { useRazorpay } from '@/hooks/useRazorpay';
import { useCurrency } from '@/hooks/useCurrency';

interface RazorpayCheckoutProps {
  isOpen: boolean;
  onClose: () => void;
  orderId: string;
  orderIds?: string[];
  amount: number;
  sellerId: string;
  sellerName: string;
  customerName: string;
  customerEmail: string;
  customerPhone: string;
  onPaymentSuccess: (paymentId: string) => void;
  onPaymentFailed: () => void;
  onDismiss?: () => void;
}

export function RazorpayCheckout({
  isOpen,
  onClose,
  orderId,
  orderIds,
  amount,
  sellerId,
  sellerName,
  customerName,
  customerEmail,
  customerPhone,
  onPaymentSuccess,
  onPaymentFailed,
  onDismiss,
}: RazorpayCheckoutProps) {
  const { createOrder, isLoading, isScriptLoaded, scriptError, retryLoadScript } = useRazorpay();
  const { formatPrice } = useCurrency();
  const [status, setStatus] = useState<'pending' | 'processing' | 'success' | 'failed'>('pending');
  const processingTimeoutRef = useRef<ReturnType<typeof setTimeout>>();

  useEffect(() => {
    if (isOpen) {
      setStatus('pending');
    }
    return () => {
      if (processingTimeoutRef.current) clearTimeout(processingTimeoutRef.current);
    };
  }, [isOpen]);

  const handlePayment = async () => {
    setStatus('processing');

    // Safety timeout: if Razorpay popup doesn't open within 15s, reset to pending
    processingTimeoutRef.current = setTimeout(() => {
      setStatus((prev) => (prev === 'processing' ? 'pending' : prev));
    }, 15000);

    await createOrder({
      orderId,
      orderIds: orderIds || [orderId],
      amount,
      sellerId,
      customerName,
      customerEmail,
      customerPhone,
      businessName: sellerName,
      onSuccess: (paymentId, razorpayOrderId) => {
        if (processingTimeoutRef.current) clearTimeout(processingTimeoutRef.current);
        setStatus('success');
        if (razorpayOrderId) {
          console.log('[Payment] Razorpay order_id for reconciliation:', razorpayOrderId);
        }
        setTimeout(() => onPaymentSuccess(paymentId), 1500);
      },
      onFailure: () => {
        if (processingTimeoutRef.current) clearTimeout(processingTimeoutRef.current);
        setStatus('failed');
      },
      onDismiss: () => {
        if (processingTimeoutRef.current) clearTimeout(processingTimeoutRef.current);
        // Razorpay popup closed without completing — let user retry
        setStatus('pending');
      },
    });
  };

  const handleRetry = () => {
    setStatus('pending');
  };

  const handleClose = () => {
    if (processingTimeoutRef.current) clearTimeout(processingTimeoutRef.current);
    if (status === 'success') {
      // Success — do nothing extra
    } else if (status === 'pending') {
      // User never attempted payment — just dismiss, don't cancel orders
      if (onDismiss) {
        onDismiss();
        setStatus('pending');
        onClose();
        return;
      }
    } else {
      // Failed status — actual payment failure
      onPaymentFailed();
    }
    setStatus('pending');
    onClose();
  };

  return (
    <Drawer open={isOpen} onOpenChange={handleClose}>
      <DrawerContent className="max-h-[85vh]">
        <DrawerHeader className="text-center pb-4">
          <DrawerTitle>Pay Online</DrawerTitle>
          <DrawerDescription>
            Pay {formatPrice(amount)} to {sellerName}
          </DrawerDescription>
        </DrawerHeader>

        <div className="py-6 px-4 overflow-y-auto" style={{ paddingBottom: 'max(1rem, env(safe-area-inset-bottom))' }}>
          {status === 'pending' && (
            <div className="text-center space-y-6">
              <div className="w-20 h-20 mx-auto rounded-full bg-primary/10 flex items-center justify-center">
                <CreditCard className="text-primary" size={40} />
              </div>
              <div>
                <p className="font-semibold text-2xl">{formatPrice(amount)}</p>
                <p className="text-sm text-muted-foreground mt-1">
                  Secure payment via Razorpay
                </p>
                <div className="flex items-center justify-center gap-2 mt-3">
                  <img src="https://razorpay.com/assets/razorpay-glyph.svg" alt="Razorpay" className="h-4" />
                  <span className="text-xs text-muted-foreground">UPI · Cards · Wallets · Netbanking</span>
                </div>
              </div>

              {/* Script load error state */}
              {scriptError && !isScriptLoaded && (
                <div className="bg-destructive/10 border border-destructive/20 rounded-xl p-3 flex items-center gap-3">
                  <WifiOff size={18} className="text-destructive shrink-0" />
                  <div className="text-left flex-1 min-w-0">
                    <p className="text-xs font-medium text-destructive">Payment service unavailable</p>
                    <p className="text-[11px] text-muted-foreground mt-0.5">Check your internet connection</p>
                  </div>
                  <Button variant="outline" size="sm" className="shrink-0 h-8 text-xs" onClick={retryLoadScript}>
                    Retry
                  </Button>
                </div>
              )}

              <div className="flex gap-3 pt-4">
                <Button
                  variant="outline"
                  className="flex-1 min-h-[48px]"
                  onClick={handleClose}
                >
                  Cancel
                </Button>
                <Button
                  className="flex-1 min-h-[48px]"
                  onClick={handlePayment}
                  disabled={isLoading || !isScriptLoaded}
                >
                  {isLoading ? (
                    <>
                      <Loader2 className="mr-2 animate-spin" size={16} />
                      Processing…
                    </>
                  ) : (
                    'Pay Now'
                  )}
                </Button>
              </div>
            </div>
          )}

          {status === 'processing' && (
            <div className="text-center space-y-4 py-8">
              <Loader2 className="mx-auto animate-spin text-primary" size={48} />
              <div>
                <p className="font-semibold">Opening Payment</p>
                <p className="text-sm text-muted-foreground">
                  Complete payment in the popup
                </p>
              </div>
            </div>
          )}

          {status === 'success' && (
            <div className="text-center space-y-4 py-8">
              <div className="w-20 h-20 mx-auto rounded-full bg-success/10 flex items-center justify-center">
                <CheckCircle className="text-success" size={48} />
              </div>
              <div>
                <p className="font-semibold text-success">Payment Successful!</p>
                <p className="text-sm text-muted-foreground">
                  Your order is confirmed
                </p>
              </div>
            </div>
          )}

          {status === 'failed' && (
            <div className="text-center space-y-6 py-4">
              <div className="w-20 h-20 mx-auto rounded-full bg-destructive/10 flex items-center justify-center">
                <XCircle className="text-destructive" size={48} />
              </div>
              <div>
                <p className="font-semibold text-destructive">Payment Failed</p>
                <p className="text-sm text-muted-foreground">
                  The payment was not completed
                </p>
              </div>
              <div className="flex gap-3 pt-4">
                <Button variant="outline" className="flex-1 min-h-[48px]" onClick={handleClose}>
                  Cancel
                </Button>
                <Button className="flex-1 min-h-[48px]" onClick={handleRetry}>
                  <RefreshCw size={16} className="mr-2" />
                  Retry
                </Button>
              </div>
            </div>
          )}
        </div>
      </DrawerContent>
    </Drawer>
  );
}
