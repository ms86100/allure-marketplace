export function isLikelyRazorpayNode(node: HTMLElement): boolean {
  const zIndex = Number.parseInt(node.style.zIndex || '0', 10);

  return (
    zIndex > 999 ||
    node.classList.toString().includes('razorpay') ||
    !!node.querySelector('iframe[src*="razorpay"]') ||
    !!node.querySelector('iframe[src*="api.razorpay"]') ||
    !!node.querySelector('iframe[src*="checkout.razorpay"]')
  );
}

export function hasRazorpayCheckout(root: ParentNode = document): boolean {
  if (
    root.querySelector('.razorpay-container') ||
    root.querySelector('.razorpay-checkout-frame') ||
    root.querySelector('iframe[src*="razorpay"]') ||
    root.querySelector('iframe[src*="api.razorpay"]') ||
    root.querySelector('iframe[src*="checkout.razorpay"]')
  ) {
    return true;
  }

  if ('querySelectorAll' in root) {
    return Array.from(root.querySelectorAll<HTMLElement>('body > div, :scope > div')).some(isLikelyRazorpayNode);
  }

  return false;
}