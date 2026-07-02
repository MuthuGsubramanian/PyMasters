// Loads the Razorpay Checkout script on demand (once) and resolves when the
// global `window.Razorpay` is available. Injecting it lazily keeps it off the
// critical path for the rest of the SPA — only the Upgrade page needs it.

const SRC = 'https://checkout.razorpay.com/v1/checkout.js';
let loadPromise = null;

export function loadRazorpay() {
  if (typeof window !== 'undefined' && window.Razorpay) return Promise.resolve(true);
  if (loadPromise) return loadPromise;

  loadPromise = new Promise((resolve, reject) => {
    const existing = document.querySelector(`script[src="${SRC}"]`);
    if (existing) {
      existing.addEventListener('load', () => resolve(true));
      existing.addEventListener('error', () => { loadPromise = null; reject(new Error('Failed to load Razorpay')); });
      if (window.Razorpay) resolve(true);
      return;
    }
    const script = document.createElement('script');
    script.src = SRC;
    script.async = true;
    script.onload = () => resolve(true);
    script.onerror = () => { loadPromise = null; reject(new Error('Failed to load Razorpay')); };
    document.body.appendChild(script);
  });
  return loadPromise;
}
