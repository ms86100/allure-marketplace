import { toast } from 'sonner';
import { hapticImpact } from '@/lib/haptics';

/**
 * Centralized cart feedback engine.
 * Every add-to-cart action routes through here to guarantee
 * consistent feedback across all surfaces:
 *   1. Haptic pulse (medium)
 *   2. Brief success toast
 *   3. CustomEvent for FloatingCartBar bounce animation
 */
export function triggerCartFeedback(productName: string) {
  // 1. Haptic — immediate tactile response
  hapticImpact('medium');

  // 2. Toast — brief, non-blocking visual confirmation
  const label = productName.length > 28 ? productName.slice(0, 28) + '…' : productName;
  toast.success(`${label} added to cart`, {
    id: 'cart-add',
    duration: 1800,
  });

  // 3. Dispatch event for FloatingCartBar bounce
  window.dispatchEvent(new CustomEvent('cart-item-added'));
}
