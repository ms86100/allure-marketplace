import { useState, useCallback, useEffect, useRef } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { friendlyError } from '@/lib/utils';

declare global {
  interface Window {
    Razorpay: any;
  }
}

/** MutationObserver ref — disconnected on payment end */
let razorpayDomObserver: MutationObserver | null = null;

/** Watch for Razorpay-injected overlays and push them below the iOS safe area */
function startSafeAreaObserver() {
  stopSafeAreaObserver();

  const patchNode = (node: HTMLElement) => {
    const zIndex = parseInt(node.style.zIndex || '0', 10);
    const isRazorpayContainer =
      zIndex > 999 ||
      node.querySelector('iframe[src*="razorpay"]') ||
      node.querySelector('iframe[src*="api.razorpay"]') ||
      node.classList.toString().includes('razorpay');

    if (isRazorpayContainer) {
      node.style.setProperty('top', 'env(safe-area-inset-top, 0px)', 'important');
      node.style.setProperty('height', 'calc(100% - env(safe-area-inset-top, 0px))', 'important');
    }
  };

  razorpayDomObserver = new MutationObserver((mutations) => {
    for (const m of mutations) {
      for (const added of m.addedNodes) {
        if (added instanceof HTMLElement) {
          patchNode(added);
        }
      }
    }
  });

  razorpayDomObserver.observe(document.body, { childList: true, subtree: true });

  // Also patch any already-present high z-index children (race condition guard)
  document.body.querySelectorAll<HTMLElement>(':scope > div').forEach(patchNode);
}

function stopSafeAreaObserver() {
  if (razorpayDomObserver) {
    razorpayDomObserver.disconnect();
    razorpayDomObserver = null;
  }
}

interface RazorpayOptions {
  orderId: string;
  orderIds?: string[];
  amount: number;
  sellerId: string;
  customerName: string;
  customerEmail: string;
  customerPhone: string;
  businessName: string;
  onSuccess: (paymentId: string, razorpayOrderId?: string) => void;
  onFailure: (error: any) => void;
  onDismiss?: () => void;
}

/** Restore body scroll position and remove the lock class */
function unlockBodyScroll() {
  document.body.classList.remove('razorpay-active');
  document.body.style.removeProperty('top');
  const savedY = parseInt(document.body.dataset.scrollY || '0', 10);
  window.scrollTo(0, savedY);
  delete document.body.dataset.scrollY;
}

const SCRIPT_URL = 'https://checkout.razorpay.com/v1/checkout.js';

export function useRazorpay() {
  const [isLoading, setIsLoading] = useState(false);
  const [isScriptLoaded, setIsScriptLoaded] = useState(false);
  const [scriptError, setScriptError] = useState(false);
  const retryCountRef = useRef(0);

  // Load Razorpay script with retry
  const loadScript = useCallback(() => {
    if (window.Razorpay) {
      setIsScriptLoaded(true);
      setScriptError(false);
      return;
    }

    // Remove any previous failed script tag
    const existing = document.querySelector(`script[src="${SCRIPT_URL}"]`);
    if (existing) existing.remove();

    const script = document.createElement('script');
    script.src = SCRIPT_URL;
    script.async = true;
    script.onload = () => {
      setIsScriptLoaded(true);
      setScriptError(false);
      retryCountRef.current = 0;
    };
    script.onerror = () => {
      console.error('Failed to load Razorpay script');
      setScriptError(true);
      // Auto-retry up to 3 times with exponential backoff
      if (retryCountRef.current < 3) {
        retryCountRef.current += 1;
        const delay = Math.pow(2, retryCountRef.current) * 1000;
        setTimeout(loadScript, delay);
      } else {
        toast.error('Payment service unavailable. Please check your network.');
      }
    };
    document.body.appendChild(script);
  }, []);

  useEffect(() => {
    loadScript();
  }, [loadScript]);

  // Cleanup: ensure body scroll lock is released if hook unmounts mid-payment
  useEffect(() => {
    return () => {
      if (document.body.classList.contains('razorpay-active')) {
        unlockBodyScroll();
      }
    };
  }, []);

  const createOrder = useCallback(async (options: RazorpayOptions) => {
    if (!isScriptLoaded) {
      if (scriptError) {
        // Retry loading script
        retryCountRef.current = 0;
        loadScript();
        toast.error('Payment service is loading. Please try again in a moment.');
      } else {
        toast.error('Payment service is loading. Please try again.');
      }
      return;
    }

    setIsLoading(true);

    try {
      // Get auth token
      const { data: { session } } = await supabase.auth.getSession();
      if (!session?.access_token) {
        toast.error('Please login to continue');
        return;
      }

      const { data, error } = await supabase.functions.invoke('create-razorpay-order', {
        body: {
          orderId: options.orderId,
          orderIds: options.orderIds || [options.orderId],
          amount: options.amount,
          sellerId: options.sellerId,
          customerName: options.customerName,
          customerEmail: options.customerEmail,
          customerPhone: options.customerPhone,
        },
      });

      if (error) {
        console.error('Create order error:', error);
        throw new Error(error.message || 'Failed to create payment order');
      }

      console.log('Razorpay order created:', data);

      // Open Razorpay checkout
      const razorpayOptions = {
        key: data.razorpay_key_id,
        amount: data.amount,
        currency: data.currency,
        name: options.businessName,
        description: `Order Payment`,
        order_id: data.razorpay_order_id,
        prefill: data.prefill,
        notes: data.notes,
        theme: {
          color: '#2D4A3E',
        },
        // CRITICAL: Enable UPI intent inside Capacitor WebView
        webview_intent: true,
        method: {
          upi: true,
          card: true,
          netbanking: true,
          wallet: true,
        },
        config: {
          display: {
            blocks: {
              upi: {
                name: 'Pay via UPI',
                instruments: [
                  // Show ALL installed UPI apps (not just gpay/phonepe/paytm)
                  { method: 'upi', flows: ['intent'] },
                  // Fallback: manual UPI ID entry for apps not detected via intent
                  { method: 'upi', flows: ['collect'] },
                ],
              },
              other: {
                name: 'Other Payment Methods',
                instruments: [
                  { method: 'card' },
                  { method: 'netbanking' },
                  { method: 'wallet' },
                ],
              },
            },
            sequence: ['block.upi', 'block.other'],
            preferences: {
              show_default_blocks: false,
            },
          },
        },
        handler: function (response: any) {
          console.log('Payment successful:', response);
          unlockBodyScroll();
          options.onSuccess(response.razorpay_payment_id, response.razorpay_order_id);
        },
        modal: {
          ondismiss: function () {
            console.log('Payment modal closed');
            unlockBodyScroll();
            setIsLoading(false);
            options.onDismiss?.();
          },
          escape: true,
          backdropclose: false,
          confirm_close: true,
          animation: false,
        },
      };

      const razorpay = new window.Razorpay(razorpayOptions);
      
      razorpay.on('payment.failed', function (response: any) {
        console.error('Payment failed:', response.error);
        unlockBodyScroll();
        options.onFailure(response.error);
      });

      // Save scroll position and lock body in place
      const scrollY = window.scrollY;
      document.body.dataset.scrollY = String(scrollY);
      document.body.style.top = `-${scrollY}px`;
      document.body.classList.add('razorpay-active');

      // Open Razorpay — use rAF to ensure the CSS changes are painted
      // before the SDK injects its overlay, preventing the brief
      // non-interactive flash on iOS WebView
      requestAnimationFrame(() => {
        razorpay.open();
      });
    } catch (error: any) {
      console.error('Razorpay error:', error);
      toast.error(friendlyError(error));
      options.onFailure(error);
    } finally {
      setIsLoading(false);
    }
  }, [isScriptLoaded, scriptError, loadScript]);

  return {
    createOrder,
    isLoading,
    isScriptLoaded,
    scriptError,
    retryLoadScript: loadScript,
  };
}
